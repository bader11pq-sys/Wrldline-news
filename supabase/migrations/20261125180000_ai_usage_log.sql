-- Persistent AI usage and cost tracking (additive only; no existing object is altered).
-- Written by Edge Functions with the service role. Editors/admins may read; nobody else.
-- Rollback: supabase/rollbacks/20261125180000_ai_usage_log.down.sql (drops only objects created here).

-- Schema-drift fix: this table already exists in production but was never in a migration.
-- "if not exists" makes this a no-op there and lets fresh/staging databases match production.
create table if not exists public.ai_provider_cooldowns (
  provider text primary key,
  disabled_until timestamptz not null,
  reason text,
  updated_at timestamptz not null default now()
);
alter table public.ai_provider_cooldowns enable row level security;

create table if not exists public.ai_usage_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  function_name text not null check (char_length(function_name) between 1 and 80),
  task text not null check (char_length(task) between 1 and 40),
  provider text not null check (char_length(provider) between 1 and 40),
  model text check (model is null or char_length(model) <= 120),
  ok boolean not null,
  error_kind text check (error_kind is null or error_kind in ('rate_limit','quota','auth','invalid_output','transient','fatal')),
  http_status integer check (http_status is null or http_status between 0 and 599),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  input_chars integer check (input_chars is null or input_chars >= 0),
  cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0),
  article_id uuid,
  message text check (message is null or char_length(message) <= 300)
);
create index if not exists ai_usage_log_created_idx on public.ai_usage_log (created_at desc);
create index if not exists ai_usage_log_provider_idx on public.ai_usage_log (provider, created_at desc);

alter table public.ai_usage_log enable row level security;
revoke all on public.ai_usage_log from anon, authenticated;
grant select on public.ai_usage_log to authenticated;
drop policy if exists ai_usage_log_editor_read on public.ai_usage_log;
create policy ai_usage_log_editor_read on public.ai_usage_log for select to authenticated
  using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('editor','admin'));

-- Daily rollup for dashboards; security_invoker so the table's RLS applies to the caller.
create or replace view public.ai_usage_daily with (security_invoker = true) as
select date_trunc('day', created_at)::date as day,
       provider, task,
       count(*) as calls,
       count(*) filter (where ok) as successes,
       count(*) filter (where not ok) as failures,
       coalesce(sum(input_tokens),0) as input_tokens,
       coalesce(sum(output_tokens),0) as output_tokens,
       coalesce(sum(input_chars),0) as input_chars,
       coalesce(sum(cost_usd),0)::numeric(12,6) as cost_usd,
       round(avg(latency_ms))::int as avg_latency_ms
from public.ai_usage_log
group by 1,2,3;
revoke all on public.ai_usage_daily from anon, authenticated;
grant select on public.ai_usage_daily to authenticated;

-- Retention helper (never runs automatically; call manually or schedule deliberately).
create or replace function public.ai_usage_prune(p_keep interval default interval '180 days')
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if p_keep < interval '30 days' then raise exception 'retention must be at least 30 days'; end if;
  delete from public.ai_usage_log where created_at < now() - p_keep;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.ai_usage_prune(interval) from public, anon, authenticated;
