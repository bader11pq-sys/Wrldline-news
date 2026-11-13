-- WRLDLINE daily global briefing infrastructure
-- Deploy supabase/functions/daily-global-briefing/index.ts before enabling the cron job.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create table if not exists public.daily_news_briefings (
  briefing_date date primary key,
  window_start timestamptz not null,
  window_end timestamptz not null,
  title text not null default 'ملخص الأخبار العالمية',
  executive_summary text not null,
  top_developments jsonb not null default '[]'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  global_trends jsonb not null default '[]'::jsonb,
  watchlist jsonb not null default '[]'::jsonb,
  article_count integer not null default 0,
  selected_article_count integer not null default 0,
  source_count integer not null default 0,
  model_provider text,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_news_briefings enable row level security;
drop policy if exists "Public can read daily global briefings" on public.daily_news_briefings;
create policy "Public can read daily global briefings"
  on public.daily_news_briefings for select to anon, authenticated using (true);
grant select on public.daily_news_briefings to anon, authenticated;
grant all on public.daily_news_briefings to service_role;

-- The Edge Function compares the supplied cron token's SHA-256 digest with this
-- server-only hash. The original token stays encrypted in Supabase Vault.
create table if not exists public.wrldline_daily_briefing_auth (
  singleton boolean primary key default true check (singleton),
  secret_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.wrldline_daily_briefing_auth enable row level security;
revoke all on public.wrldline_daily_briefing_auth from anon, authenticated;
grant all on public.wrldline_daily_briefing_auth to service_role;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'wrldline_daily_briefing_cron_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'wrldline_daily_briefing_cron_secret'
    );
  end if;
end $$;

insert into public.wrldline_daily_briefing_auth(singleton, secret_hash)
select true, encode(digest(decrypted_secret, 'sha256'), 'hex')
from vault.decrypted_secrets
where name = 'wrldline_daily_briefing_cron_secret'
on conflict (singleton) do update
set secret_hash = excluded.secret_hash, updated_at = now();

-- PostgreSQL/Supabase Cron runs on UTC in this project. This job creates the
-- previous completed UTC calendar day, from 00:00 inclusive to 00:00 exclusive.
select cron.schedule(
  'wrldline-daily-global-briefing',
  '0 0 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_project_url_20261113')
             || '/functions/v1/daily-global-briefing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_publishable_key_20261113'),
        'x-wrldline-briefing-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_daily_briefing_cron_secret')
      ),
      body := jsonb_build_object('mode', 'scheduled'),
      timeout_milliseconds := 120000
    );
  $job$
) as scheduled_job_id;
