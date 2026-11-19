select cron.unschedule(jobid)
from cron.job
where jobname = 'wrldline-editorial-context-monitor';

select cron.schedule(
  'wrldline-editorial-context-monitor',
  '0 */3 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113')
             || '/functions/v1/editorial-autopublisher',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_publishable_key_20261113'),
        'x-wrldline-editorial-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_editorial_cron_secret')
      ),
      body := '{"mode":"context_monitor"}'::jsonb,
      timeout_milliseconds := 180000
    );
  $job$
);
