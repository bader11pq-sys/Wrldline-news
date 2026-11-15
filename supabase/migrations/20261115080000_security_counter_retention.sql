-- Counter-only retention; never deletes messages, users, opt-ins, or unresolved deliveries.
create or replace function public.wrldline_security_maintenance()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare forms integer; notifications integer;
begin
  delete from public.form_rate_limits where bucket in (
    select bucket from public.form_rate_limits where expires_at<now()-interval '1 day'
    order by expires_at limit 5000);
  get diagnostics forms=row_count;
  delete from public.notification_rate_buckets where (key,bucket) in (
    select key,bucket from public.notification_rate_buckets where bucket<now()-interval '2 days'
    order by bucket limit 5000);
  get diagnostics notifications=row_count;
  return jsonb_build_object('form_counters_removed',forms,'notification_counters_removed',notifications);
end $$;
revoke all on function public.wrldline_security_maintenance() from public,anon,authenticated;
grant execute on function public.wrldline_security_maintenance() to service_role;
-- The existing pg_cron extension is verified by the operator before scheduling.
DO $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('wrldline-security-counters','27 * * * *','select public.wrldline_security_maintenance() LIMIT 1;');
  end if;
end $$;
