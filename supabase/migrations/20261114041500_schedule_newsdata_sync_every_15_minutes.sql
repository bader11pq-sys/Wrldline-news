
select cron.unschedule(jobid)
from cron.job
where jobname = 'wrldline-newsdata-sync';

select cron.schedule(
  'wrldline-newsdata-sync',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113')
             || '/functions/v1/newsdata-integration',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_publishable_key_20261113'),
        'x-wrldline-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_cron_secret_20261113')
      ),
      body := '{"mode":"sync"}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
