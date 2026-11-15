-- WRLDLINE: enforce the user's strict 60-minute AI processing window.
-- Restore one scheduled classifier worker; GitHub Actions remain manual fallbacks.
begin;

create or replace function public.expire_stale_classification_queue()
returns void
language sql
security definer
set search_path to public
as $function$
  update public.articles
  set ai_classification_status = 'expired',
      classification_claimed_at = null,
      classification_last_error = 'expired: published more than 1 hour ago'
  where ai_classification_status in ('pending', 'failed', 'processing')
    and published_at < now() - interval '1 hour';
$function$;

create or replace function public.release_stale_classification_claims()
returns void
language sql
security definer
set search_path to public
as $function$
  update public.articles
  set ai_classification_status = 'pending',
      classification_claimed_at = null,
      classification_last_error = 'claim_timeout'
  where ai_classification_status = 'processing'
    and classification_claimed_at < now() - interval '15 minutes'
    and published_at >= now() - interval '1 hour'
    and published_at <= now() + interval '5 minutes';
$function$;

create or replace function public.claim_classification_batch(p_limit integer default 10)
returns setof public.articles
language sql
security definer
set search_path to public
as $function$
  with candidate as (
    select a.id
    from public.articles a
    where a.editorial_status = 'published'
      and a.ai_classification_status in ('pending', 'failed')
      and a.published_at >= now() - interval '1 hour'
      and a.published_at <= now() + interval '5 minutes'
      and (a.classification_retry_after is null or a.classification_retry_after <= now())
      and (a.classification_claimed_at is null or a.classification_claimed_at < now() - interval '15 minutes')
      and coalesce(a.classification_attempts, 0) < 5
      and not (
        coalesce(a.url, '') ~* 't\\.me|telegram\\.me'
        or coalesce(a.source_url, '') ~* 't\\.me|telegram'
        or lower(coalesce(a.source_name, '')) like '%telegram%'
      )
    order by a.published_at desc, a.id asc
    limit greatest(1, least(coalesce(p_limit, 10), 10))
    for update skip locked
  )
  update public.articles a
  set ai_classification_status = 'processing',
      classification_claimed_at = now(),
      classification_attempts = coalesce(a.classification_attempts, 0) + 1
  from candidate c
  where a.id = c.id
  returning a.*;
$function$;

revoke all on function public.expire_stale_classification_queue() from public, anon, authenticated;
revoke all on function public.release_stale_classification_claims() from public, anon, authenticated;
revoke all on function public.claim_classification_batch(integer) from public, anon, authenticated;
grant execute on function public.expire_stale_classification_queue() to service_role;
grant execute on function public.release_stale_classification_claims() to service_role;
grant execute on function public.claim_classification_batch(integer) to service_role;

-- Exactly one job with this name. The existing Vault references are reused.
do $block$
declare job record;
begin
  for job in
    select jobid from cron.job
    where jobname = 'wrldline-ai-classification-worker'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end
$block$;

select cron.schedule(
  'wrldline-ai-classification-worker',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113')
        || '/functions/v1/classify-news-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_publishable_key_20261113'),
        'x-wrldline-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_cron_secret_20261113')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);

commit;
