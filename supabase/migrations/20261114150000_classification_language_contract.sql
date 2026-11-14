-- WRLDLINE classification + language contract
-- 2026-11-14
--
-- This migration separates four dimensions that were previously conflated:
--   1. UI language          (client-side: language.js)
--   2. Source language      (articles.source_language / articles.lang)
--   3. Translation state    (article_translations.translation_status/source)
--   4. Story classification (category/topics/geographic_scope/event_country)
--
-- It also makes the classification queue idempotent. The Edge worker is the
-- single operational path; the GitHub backlog workflow becomes a manual tool.

begin;

-- ---------------------------------------------------------------------------
-- 1. Stop using "world" as a database default.
-- ---------------------------------------------------------------------------
alter table public.articles alter column category set default 'uncategorized';
alter table public.feeds alter column category set default 'uncategorized';

-- ---------------------------------------------------------------------------
-- 2. Article contract.
-- ---------------------------------------------------------------------------
alter table public.articles
  add column if not exists source_language text,
  add column if not exists language_detection text not null default 'unknown',
  add column if not exists source_scope text not null default 'unknown',
  add column if not exists source_country text,
  add column if not exists event_country text,
  add column if not exists geographic_scope text not null default 'unknown',
  add column if not exists topics text[] not null default '{}',
  add column if not exists secondary_locations jsonb not null default '[]'::jsonb,
  add column if not exists entities jsonb not null default '[]'::jsonb,
  add column if not exists classification_reason text,
  add column if not exists classification_confidence numeric,
  add column if not exists classification_model_version text,
  add column if not exists taxonomy_version text not null default 'wrldline-1',
  add column if not exists classification_attempts integer not null default 0,
  add column if not exists classification_retry_after timestamptz,
  add column if not exists classification_last_error text,
  add column if not exists classification_claimed_at timestamptz;

alter table public.feeds
  add column if not exists source_scope text not null default 'unknown';

do $$ begin
  alter table public.articles add constraint articles_language_detection_check
    check (language_detection in ('declared','detected','conflict','legacy','unknown'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.articles add constraint articles_source_scope_check
    check (source_scope in ('local','national','regional','international','cross-border','unknown'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.articles add constraint articles_geographic_scope_check
    check (geographic_scope in ('local','national','regional','international','cross-border','unknown'));
exception when duplicate_object then null; end $$;

alter table public.articles drop constraint if exists articles_ai_classification_status_check;
alter table public.articles add constraint articles_ai_classification_status_check
  check (ai_classification_status in ('pending','processing','failed','classified','needs_review','expired','skipped'));

do $$ begin
  alter table public.feeds add constraint feeds_source_scope_check
    check (source_scope in ('local','national','regional','international','cross-border','unknown'));
exception when duplicate_object then null; end $$;

-- A trigger, not a CHECK, so a future feed cannot break ingestion: unknown
-- values become the explicit uncategorized state instead of "world".
create or replace function public.normalize_article_category_value()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  value text;
begin
  value := lower(trim(coalesce(new.category, '')));
  if value = '' or value not in ('politics','economy','security','tech','sports','culture','health','science','environment','society','world','uncategorized') then
    value := 'uncategorized';
  end if;
  new.category := value;
  return new;
end;
$$;

drop trigger if exists trg_normalize_article_category on public.articles;
create trigger trg_normalize_article_category
before insert or update of category on public.articles
for each row execute function public.normalize_article_category_value();

create or replace function public.normalize_feed_category_value()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  value text;
begin
  value := lower(trim(coalesce(new.category, '')));
  if value = '' or value not in ('politics','economy','security','tech','sports','culture','health','science','environment','society','world','uncategorized') then
    value := 'uncategorized';
  end if;
  new.category := value;
  return new;
end;
$$;

drop trigger if exists trg_normalize_feed_category on public.feeds;
create trigger trg_normalize_feed_category
before insert or update of category on public.feeds
for each row execute function public.normalize_feed_category_value();

create index if not exists articles_classification_queue_idx
  on public.articles (ai_classification_status, published_at desc)
  where editorial_status = 'published' and ai_classification_status in ('pending','failed','processing');

create index if not exists articles_classification_retry_idx
  on public.articles (classification_retry_after)
  where ai_classification_status in ('pending','failed');

-- ---------------------------------------------------------------------------
-- 3. Translation lifecycle.
-- ---------------------------------------------------------------------------
alter table public.article_translations
  add column if not exists translation_status text not null default 'review',
  add column if not exists translation_source text not null default 'machine_draft',
  add column if not exists source_hash text,
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists prompt_version text,
  add column if not exists glossary_version text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists published_at timestamptz;

do $$ begin
  alter table public.article_translations add constraint article_translations_status_check
    check (translation_status in ('none','draft','review','published','rejected'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.article_translations add constraint article_translations_source_check
    check (translation_source in ('editorial','machine_draft','external_source'));
exception when duplicate_object then null; end $$;

-- Existing translations were already publicly visible before this migration.
-- Grandfather them as published machine translations, but label them honestly
-- in the UI. New machine translations default to review and stay private.
update public.article_translations
set translation_status = 'published',
    translation_source = coalesce(nullif(translation_source, ''), 'machine_draft'),
    published_at = coalesce(published_at, created_at)
where translation_status = 'review' and translation_source = 'machine_draft';

create index if not exists article_translations_status_idx
  on public.article_translations (translation_status, lang);

drop policy if exists "Public read published translations" on public.article_translations;
create policy "Public read published translations" on public.article_translations
for select to anon
using (
  translation_status = 'published'
  and exists (select 1 from public.articles a where a.id = article_id and a.editorial_status = 'published')
);

drop policy if exists "Authenticated read published or editorial translations" on public.article_translations;
create policy "Authenticated read published or editorial translations" on public.article_translations
for select to authenticated
using (
  (
    translation_status = 'published'
    and exists (select 1 from public.articles a where a.id = article_id and a.editorial_status = 'published')
  )
  or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin')
);

-- ---------------------------------------------------------------------------
-- 4. Backfill audit. Every data change below records the old value first.
-- ---------------------------------------------------------------------------
create table if not exists public.classification_backfill_audit (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('article','feed')),
  entity_id uuid not null,
  old_category text,
  new_category text,
  old_country text,
  new_country text,
  old_source_scope text,
  new_source_scope text,
  old_language text,
  new_language text,
  old_source_country text,
  new_source_country text,
  old_event_country text,
  new_event_country text,
  old_status text,
  new_status text,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.classification_backfill_audit enable row level security;
revoke all on public.classification_backfill_audit from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Queue RPCs. These are the only operational classification path.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_classification_queue()
returns void
language sql
security definer
set search_path = public
as $$
  update public.articles
  set ai_classification_status = 'expired',
      classification_claimed_at = null,
      classification_last_error = 'expired: published more than 48 hours ago'
  where ai_classification_status in ('pending','failed')
    and published_at < now() - interval '48 hours';
$$;

create or replace function public.release_stale_classification_claims()
returns void
language sql
security definer
set search_path = public
as $$
  update public.articles
  set ai_classification_status = 'pending',
      classification_claimed_at = null,
      classification_last_error = 'claim_timeout'
  where ai_classification_status = 'processing'
    and classification_claimed_at < now() - interval '15 minutes';
$$;

create or replace function public.claim_classification_batch(p_limit integer default 20)
returns setof public.articles
language sql
security definer
set search_path = public
as $$
  with candidate as (
    select a.id
    from public.articles a
    where a.editorial_status = 'published'
      and a.ai_classification_status in ('pending','failed')
      and a.published_at >= now() - interval '48 hours'
      and a.published_at <= now() + interval '5 minutes'
      and (a.classification_retry_after is null or a.classification_retry_after <= now())
      and (a.classification_claimed_at is null or a.classification_claimed_at < now() - interval '15 minutes')
      and coalesce(a.classification_attempts, 0) < 5
      and not (
        coalesce(a.url, '') ~* 't\.me|telegram\.me'
        or coalesce(a.source_url, '') ~* 't\.me|telegram'
        or lower(coalesce(a.source_name, '')) like '%telegram%'
      )
    order by
      case when a.published_at >= now() - interval '1 hour' then 0 else 1 end,
      a.published_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  )
  update public.articles a
  set ai_classification_status = 'processing',
      classification_claimed_at = now(),
      classification_attempts = coalesce(a.classification_attempts, 0) + 1
  from candidate c
  where a.id = c.id
  returning a.*;
$$;

create or replace function public.release_classification_claims(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.articles
  set ai_classification_status = 'pending',
      classification_claimed_at = null,
      classification_last_error = coalesce(classification_last_error, 'worker_request_failed')
  where id = any(p_ids)
    and ai_classification_status = 'processing';
$$;

create or replace function public.classification_queue_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pending', count(*) filter (where ai_classification_status = 'pending'),
    'processing', count(*) filter (where ai_classification_status = 'processing'),
    'failed', count(*) filter (where ai_classification_status = 'failed'),
    'classified', count(*) filter (where ai_classification_status = 'classified'),
    'needs_review', count(*) filter (where ai_classification_status = 'needs_review'),
    'expired', count(*) filter (where ai_classification_status = 'expired'),
    'skipped', count(*) filter (where ai_classification_status = 'skipped'),
    'oldest_pending_age_minutes', coalesce(round(extract(epoch from (now() - min(published_at) filter (where ai_classification_status = 'pending'))) / 60.0), 0),
    'oldest_pending_at', min(published_at) filter (where ai_classification_status = 'pending')
  )
  from public.articles
  where editorial_status = 'published';
$$;

revoke all on function public.expire_stale_classification_queue() from public, anon, authenticated;
revoke all on function public.release_stale_classification_claims() from public, anon, authenticated;
revoke all on function public.claim_classification_batch(integer) from public, anon, authenticated;
revoke all on function public.release_classification_claims(uuid[]) from public, anon, authenticated;
revoke all on function public.classification_queue_stats() from public, anon, authenticated;
grant execute on function public.expire_stale_classification_queue() to service_role;
grant execute on function public.release_stale_classification_claims() to service_role;
grant execute on function public.claim_classification_batch(integer) to service_role;
grant execute on function public.release_classification_claims(uuid[]) to service_role;
grant execute on function public.classification_queue_stats() to service_role;

-- ---------------------------------------------------------------------------
-- 6. One classification cron job, every minute. The worker claims batches.
-- ---------------------------------------------------------------------------
do $$
declare
  job record;
begin
  for job in select jobid from cron.job where jobname = 'wrldline-ai-classification-worker' loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

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

commit;
