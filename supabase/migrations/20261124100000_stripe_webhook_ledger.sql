-- WRLDLINE: Stripe webhook idempotency ledger, ordering watermark, binding and price allow-list.
-- Rollback: DROP FUNCTION public.apply_stripe_subscription_event(...); DROP FUNCTION public.has_plus_entitlement(uuid);
--           DROP TABLE public.stripe_webhook_events; ALTER TABLE public.subscriptions DROP COLUMN stripe_event_created_at;
-- No existing subscription row is modified by this migration.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_created_at timestamptz not null,
  processed_at timestamptz not null default now(),
  user_id uuid,
  stripe_customer_id text,
  stripe_subscription_id text,
  outcome text not null
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from public, anon, authenticated;
grant all on public.stripe_webhook_events to service_role;
comment on table public.stripe_webhook_events is 'Idempotency ledger for verified Stripe webhook events. Service role only; no client access.';

alter table public.subscriptions add column if not exists stripe_event_created_at timestamptz;

-- Single entitlement predicate. A missing period end never means "forever".
create or replace function public.has_plus_entitlement(p_user uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user
      and s.plan = 'plus'
      and s.status in ('active', 'trialing')
      and s.current_period_end is not null
      and s.current_period_end > now()
  );
$$;
revoke all on function public.has_plus_entitlement(uuid) from public, anon;
grant execute on function public.has_plus_entitlement(uuid) to authenticated, service_role;

create or replace function public.apply_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_event_created timestamptz,
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_price_allowed boolean,
  p_status text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
) returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted int;
  v_row public.subscriptions%rowtype;
  v_by_customer public.subscriptions%rowtype;
  v_outcome text;
  v_active boolean;
begin
  if p_event_id is null or p_event_type is null or p_event_created is null then
    raise exception 'event id, type and created time are required';
  end if;

  insert into public.stripe_webhook_events(event_id, event_type, stripe_created_at, user_id, stripe_customer_id, stripe_subscription_id, outcome)
  values (p_event_id, p_event_type, p_event_created, p_user_id, p_customer_id, p_subscription_id, 'processing')
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return 'duplicate'; end if;

  if p_user_id is null or p_customer_id is null or p_subscription_id is null then
    v_outcome := 'rejected_missing_binding';
  elsif not coalesce(p_price_allowed, false) then
    v_outcome := 'rejected_unknown_price';
  elsif not exists (select 1 from auth.users where id = p_user_id) then
    v_outcome := 'rejected_unknown_user';
  else
    select * into v_by_customer from public.subscriptions where stripe_customer_id = p_customer_id;
    if found and v_by_customer.user_id <> p_user_id then
      v_outcome := 'rejected_customer_user_mismatch';
    else
      select * into v_row from public.subscriptions where user_id = p_user_id for update;
      v_active := p_status in ('active', 'trialing');
      if found and v_row.stripe_customer_id is not null and v_row.stripe_customer_id <> p_customer_id then
        v_outcome := 'rejected_customer_mismatch';
      elsif found and v_row.stripe_event_created_at is not null and v_row.stripe_event_created_at > p_event_created then
        v_outcome := 'stale_ignored';
      elsif found and v_row.stripe_subscription_id is not null and v_row.stripe_subscription_id <> p_subscription_id
            and v_row.status in ('active', 'trialing') and not v_active then
        -- An old subscription ending must never override a newer active one.
        v_outcome := 'superseded_ignored';
      else
        insert into public.subscriptions(user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan, status,
                                         current_period_end, cancel_at_period_end, stripe_event_created_at, updated_at)
        values (p_user_id, p_customer_id, p_subscription_id, p_price_id, case when v_active then 'plus' else 'free' end, p_status,
                p_period_end, coalesce(p_cancel_at_period_end, false), p_event_created, now())
        on conflict (user_id) do update set
          stripe_customer_id = excluded.stripe_customer_id,
          stripe_subscription_id = excluded.stripe_subscription_id,
          stripe_price_id = excluded.stripe_price_id,
          plan = excluded.plan,
          status = excluded.status,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          stripe_event_created_at = excluded.stripe_event_created_at,
          updated_at = now();
        v_outcome := 'applied';
      end if;
    end if;
  end if;

  update public.stripe_webhook_events set outcome = v_outcome, processed_at = now() where event_id = p_event_id;
  return v_outcome;
end;
$$;
revoke all on function public.apply_stripe_subscription_event(text, text, timestamptz, uuid, text, text, text, boolean, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_event(text, text, timestamptz, uuid, text, text, text, boolean, text, timestamptz, boolean) to service_role;
