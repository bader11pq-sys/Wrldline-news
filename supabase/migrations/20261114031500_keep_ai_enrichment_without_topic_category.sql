
select cron.schedule(
  'wrldline-ai-classification-worker',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113') || '/functions/v1/classify-news-worker',
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
