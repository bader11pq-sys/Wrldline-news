-- SMS OTP abuse and spend protection (2026-11-24 audit, backend-audit "SMS OTP send abuse").
-- Service-role only. Phone numbers and IPs are stored as SHA-256 hashes, never in clear text.
-- Rollback: drop function public.otp_rate_check(uuid,text,text,text); drop table public.otp_rate_log;

create table if not exists public.otp_rate_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  action text not null check (action in ('start_otp','verify_otp')),
  user_id uuid not null,
  phone_hash text not null,
  ip_hash text not null
);
create index if not exists otp_rate_log_user_idx on public.otp_rate_log (user_id, action, created_at desc);
create index if not exists otp_rate_log_phone_idx on public.otp_rate_log (phone_hash, action, created_at desc);
create index if not exists otp_rate_log_ip_idx on public.otp_rate_log (ip_hash, action, created_at desc);
create index if not exists otp_rate_log_created_idx on public.otp_rate_log (created_at);

alter table public.otp_rate_log enable row level security;
revoke all on public.otp_rate_log from anon, authenticated;

-- Returns {allowed boolean, reason text, retry_after_seconds int}. Logs the attempt only when allowed.
create or replace function public.otp_rate_check(p_user uuid, p_action text, p_phone text, p_ip text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := encode(sha256(convert_to(coalesce(p_phone,''), 'utf8')), 'hex');
  v_ip text := encode(sha256(convert_to(coalesce(p_ip,'unknown'), 'utf8')), 'hex');
  v_user_h int; v_user_d int; v_phone_h int; v_ip_h int; v_global_d int;
  v_lim_user_h int; v_lim_user_d int; v_lim_phone_h int; v_lim_ip_h int; v_lim_global_d int;
begin
  if p_action not in ('start_otp','verify_otp') then
    return jsonb_build_object('allowed', false, 'reason', 'bad_action', 'retry_after_seconds', 0);
  end if;
  -- serialise per user so concurrent requests cannot slip past the counters
  perform pg_advisory_xact_lock(hashtextextended('otp:' || p_user::text, 0));

  if p_action = 'start_otp' then
    v_lim_user_h := 3; v_lim_user_d := 8; v_lim_phone_h := 3; v_lim_ip_h := 10; v_lim_global_d := 300;
  else
    v_lim_user_h := 10; v_lim_user_d := 30; v_lim_phone_h := 10; v_lim_ip_h := 40; v_lim_global_d := 3000;
  end if;

  select count(*) filter (where created_at > now() - interval '1 hour'), count(*)
    into v_user_h, v_user_d
    from public.otp_rate_log where user_id = p_user and action = p_action and created_at > now() - interval '1 day';
  if v_user_h >= v_lim_user_h then return jsonb_build_object('allowed', false, 'reason', 'user_hourly', 'retry_after_seconds', 3600); end if;
  if v_user_d >= v_lim_user_d then return jsonb_build_object('allowed', false, 'reason', 'user_daily', 'retry_after_seconds', 86400); end if;

  select count(*) into v_phone_h from public.otp_rate_log
    where phone_hash = v_phone and action = p_action and created_at > now() - interval '1 hour';
  if v_phone_h >= v_lim_phone_h then return jsonb_build_object('allowed', false, 'reason', 'phone_hourly', 'retry_after_seconds', 3600); end if;

  select count(*) into v_ip_h from public.otp_rate_log
    where ip_hash = v_ip and action = p_action and created_at > now() - interval '1 hour';
  if v_ip_h >= v_lim_ip_h then return jsonb_build_object('allowed', false, 'reason', 'ip_hourly', 'retry_after_seconds', 3600); end if;

  select count(*) into v_global_d from public.otp_rate_log
    where action = p_action and created_at > now() - interval '1 day';
  if v_global_d >= v_lim_global_d then return jsonb_build_object('allowed', false, 'reason', 'global_daily', 'retry_after_seconds', 3600); end if;

  insert into public.otp_rate_log(action, user_id, phone_hash, ip_hash) values (p_action, p_user, v_phone, v_ip);
  -- opportunistic cleanup keeps the table small (older than 3 days)
  delete from public.otp_rate_log where created_at < now() - interval '3 days' and id in (
    select id from public.otp_rate_log where created_at < now() - interval '3 days' limit 200);
  return jsonb_build_object('allowed', true, 'reason', 'ok', 'retry_after_seconds', 0);
end;
$$;

revoke all on function public.otp_rate_check(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.otp_rate_check(uuid, text, text, text) to service_role;
