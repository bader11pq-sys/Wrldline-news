-- Required pg_cron/pg_net/Vault extensions and named secret verified on 2026-11-15.
-- Reuses existing application-native scheduling; no Manus task/sandbox daemon.
-- cron.schedule(jobname,...) replaces same-named jobs rather than duplicate fanout.
DO $$ begin
  if not exists(select 1 from pg_extension where extname='pg_cron')
    or not exists(select 1 from pg_extension where extname='pg_net')
    or not exists(select 1 from vault.secrets where name='wrldline_news_cron_secret_20261113') then
    raise exception 'Verified native scheduler prerequisites unavailable';
  end if;
  perform cron.schedule('wrldline-notifications-every-minute','* * * * *',$job$
    select net.http_post(
      url:='https://vmaxbnogmmfyrcucapnq.supabase.co/functions/v1/notification-dispatch',
      headers:=jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx',
        'x-wrldline-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='wrldline_news_cron_secret_20261113' LIMIT 1)),
      body:='{}'::jsonb,timeout_milliseconds:=70000
    ) LIMIT 1;
  $job$);
  perform cron.schedule('wrldline-source-freshness','*/15 * * * *',$job$
    select net.http_post(
      url:='https://vmaxbnogmmfyrcucapnq.supabase.co/functions/v1/source-freshness',
      headers:=jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx',
        'x-wrldline-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='wrldline_news_cron_secret_20261113' LIMIT 1)),
      body:='{}'::jsonb,timeout_milliseconds:=120000
    ) LIMIT 1;
  $job$);
end $$;
