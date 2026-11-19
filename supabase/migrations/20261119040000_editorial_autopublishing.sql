
begin;

create table if not exists public.editorial_publications (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('dossier','watchlist','context','mirror')),
  slug text not null,
  title text not null,
  status text not null default 'published' check (status in ('draft','published','archived')),
  content jsonb not null,
  sources jsonb not null default '[]'::jsonb,
  research_summary text,
  research_query text,
  generated_by text,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(section, slug)
);
create index if not exists editorial_publications_feed_idx
  on public.editorial_publications(section, status, published_at desc);

alter table public.editorial_publications enable row level security;
drop policy if exists "Public reads published editorial publications" on public.editorial_publications;
create policy "Public reads published editorial publications"
  on public.editorial_publications for select to anon, authenticated
  using (status = 'published');
revoke all on public.editorial_publications from anon, authenticated;
grant select on public.editorial_publications to anon, authenticated;
grant all on public.editorial_publications to service_role;

create table if not exists public.editorial_runtime_state (
  state_key text primary key,
  state_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.editorial_runtime_state enable row level security;
revoke all on public.editorial_runtime_state from anon, authenticated;
grant all on public.editorial_runtime_state to service_role;

create table if not exists public.editorial_runtime_auth (
  singleton boolean primary key default true check (singleton),
  secret_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.editorial_runtime_auth enable row level security;
revoke all on public.editorial_runtime_auth from anon, authenticated;
grant all on public.editorial_runtime_auth to service_role;

create table if not exists public.editorial_run_log (
  id bigint generated always as identity primary key,
  mode text not null,
  status text not null check (status in ('started','published','skipped','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  section text,
  publication_slug text,
  provider text,
  research_sources integer not null default 0,
  article_sources integer not null default 0,
  error_summary text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists editorial_run_log_recent_idx
  on public.editorial_run_log(started_at desc);
alter table public.editorial_run_log enable row level security;
revoke all on public.editorial_run_log from anon, authenticated;
grant all on public.editorial_run_log to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'wrldline_editorial_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'wrldline_editorial_cron_secret');
  end if;
end $$;

insert into public.editorial_runtime_auth(singleton, secret_hash)
select true, encode(digest(decrypted_secret, 'sha256'), 'hex')
from vault.decrypted_secrets
where name = 'wrldline_editorial_cron_secret'
on conflict (singleton) do update
set secret_hash = excluded.secret_hash, updated_at = now();

insert into public.editorial_runtime_state(state_key, state_value)
values ('dossier_next_due_at', jsonb_build_object('at', '2026-11-19T15:00:00.000Z'))
on conflict (state_key) do nothing;

do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname in (
    'wrldline-editorial-dossier',
    'wrldline-editorial-watchlist',
    'wrldline-editorial-context-monthly',
    'wrldline-editorial-context-monitor',
    'wrldline-editorial-mirror'
  ) loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'wrldline-editorial-dossier',
  '0 15 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113') || '/functions/v1/editorial-autopublisher',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_publishable_key_20261113'),
        'x-wrldline-editorial-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_editorial_cron_secret')
      ),
      body := '{"mode":"dossier"}'::jsonb,
      timeout_milliseconds := 180000
    );
  $job$
);

select cron.schedule(
  'wrldline-editorial-watchlist',
  '0 21 * * 6',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113') || '/functions/v1/editorial-autopublisher',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_publishable_key_20261113'),
        'x-wrldline-editorial-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_editorial_cron_secret')
      ),
      body := '{"mode":"watchlist"}'::jsonb,
      timeout_milliseconds := 180000
    );
  $job$
);

select cron.schedule(
  'wrldline-editorial-context-monthly',
  '0 4 1 * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113') || '/functions/v1/editorial-autopublisher',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_publishable_key_20261113'),
        'x-wrldline-editorial-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_editorial_cron_secret')
      ),
      body := '{"mode":"context_monthly"}'::jsonb,
      timeout_milliseconds := 180000
    );
  $job$
);

select cron.schedule(
  'wrldline-editorial-context-monitor',
  '0 12 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113') || '/functions/v1/editorial-autopublisher',
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

select cron.schedule(
  'wrldline-editorial-mirror',
  '0 18 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113') || '/functions/v1/editorial-autopublisher',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_publishable_key_20261113'),
        'x-wrldline-editorial-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_editorial_cron_secret')
      ),
      body := '{"mode":"mirror"}'::jsonb,
      timeout_milliseconds := 180000
    );
  $job$
);

commit;
