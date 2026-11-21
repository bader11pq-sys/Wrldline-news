alter table public.editorial_publications
  drop constraint if exists editorial_publications_section_check;

alter table public.editorial_publications
  add constraint editorial_publications_section_check
  check (section = any (array['dossier','watchlist','context','mirror','hourly']::text[]));

create index if not exists editorial_publications_hourly_latest_idx
  on public.editorial_publications (published_at desc)
  where section = 'hourly' and status = 'published';

do $$
declare r record;
begin
  for r in select jobid from cron.job where jobname = 'wrldline-hourly-editorial' loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'wrldline-hourly-editorial',
  '0 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='wrldline_news_project_url_20261113')
             || '/functions/v1/editorial-autopublisher',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name='wrldline_news_publishable_key_20261113'),
        'x-wrldline-editorial-secret',(select decrypted_secret from vault.decrypted_secrets where name='wrldline_editorial_cron_secret')
      ),
      body := '{"mode":"hourly"}'::jsonb,
      timeout_milliseconds := 180000
    );
  $job$
);
