select cron.schedule(
  'wrldline-translation-worker',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113')
             || '/functions/v1/wrldline-news-ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_publishable_key_20261113'),
        'x-wrldline-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_cron_secret_20261113')
      ),
      body := jsonb_build_object('mode', 'translation'),
      timeout_milliseconds := 160000
    ) as request_id;
  $job$
);
