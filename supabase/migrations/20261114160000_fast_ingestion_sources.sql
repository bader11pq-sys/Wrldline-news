-- Fast, source-diverse ingestion: RSS/Atom endpoints remain server-side and are deduplicated by URL.
insert into public.feeds (name,url,lang,category,source_scope,active)
values
 ('GDELT Global Monitor','https://api.gdeltproject.org/api/v2/doc/doc?query=world&mode=rss&maxrecords=50&format=rss','en','world','international',true),
 ('Wikipedia Current Events','https://en.wikipedia.org/w/index.php?title=Portal:Current_events&feedformat=atom','en','world','international',true),
 ('USGS Earthquakes','https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.atom','en','science','international',true),
 ('US National Weather Service','https://www.weather.gov/rss_page.php?site_name=nws','en','environment','international',true)
on conflict (url) do update set active=true,category=excluded.category,source_scope=excluded.source_scope;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'wrldline-general-ingestion-fast') then perform cron.unschedule('wrldline-general-ingestion-fast'); end if;
  perform cron.schedule('wrldline-general-ingestion-fast','*/2 * * * *',$job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113') || '/functions/v1/wrldline-news-ingest',
      headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_publishable_key_20261113'),'x-wrldline-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_cron_secret_20261113')),
      body := jsonb_build_object('mode','general'), timeout_milliseconds := 160000
    );
  $job$);
  if exists (select 1 from cron.job where jobname = 'wrldline-breaking-ingestion-fast') then perform cron.unschedule('wrldline-breaking-ingestion-fast'); end if;
  perform cron.schedule('wrldline-breaking-ingestion-fast','* * * * *',$job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113') || '/functions/v1/wrldline-news-ingest',
      headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_publishable_key_20261113'),'x-wrldline-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_cron_secret_20261113')),
      body := jsonb_build_object('mode','breaking'), timeout_milliseconds := 120000
    );
  $job$);
end $$;
