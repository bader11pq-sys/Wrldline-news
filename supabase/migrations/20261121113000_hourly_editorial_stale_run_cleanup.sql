do $$
declare r record;
begin
  for r in select jobid from cron.job where jobname = 'wrldline-hourly-stale-cleanup' loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'wrldline-hourly-stale-cleanup',
  '*/5 * * * *',
  $job$
    update public.editorial_run_log
    set status = 'failed',
        finished_at = now(),
        error_summary = coalesce(error_summary, 'Hourly editorial run exceeded the 5-minute safety limit'),
        details = coalesce(details, '{}'::jsonb) || jsonb_build_object('auto_closed', true, 'auto_closed_at', now())
    where mode = 'hourly'
      and status = 'started'
      and started_at < now() - interval '5 minutes';
  $job$
);