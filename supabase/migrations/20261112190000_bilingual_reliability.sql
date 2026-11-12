-- Bilingual article translations and evidence-derived reliability.
alter table public.articles
  alter column verification set default 'unconfirmed',
  add column if not exists verification_source_count integer not null default 0,
  add column if not exists verification_independent_count integer not null default 0,
  add column if not exists verification_field_count integer not null default 0,
  add column if not exists verification_official_count integer not null default 0,
  add column if not exists verification_conflict_count integer not null default 0,
  add column if not exists verification_correction_count integer not null default 0,
  add column if not exists verification_retraction_count integer not null default 0,
  add column if not exists verification_updated_at timestamptz,
  add column if not exists verification_note text;
alter table public.article_translations add column if not exists ai_summary text;
revoke insert on public.article_translations from anon;
grant select on public.article_translations to anon,authenticated;
grant insert,update on public.article_translations to authenticated;
create table if not exists public.article_evidence (
 id uuid primary key default gen_random_uuid(),article_id uuid not null references public.articles(id) on delete cascade,
 publisher text not null check(length(trim(publisher)) between 2 and 180),
 evidence_url text not null check(evidence_url ~ '^https?://'),
 evidence_type text not null check(evidence_type in ('independent_report','official_statement','field_report','primary_document','contradiction','correction','retraction')),
 independent_source boolean not null default true,notes text,created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),unique(article_id,evidence_url)
);
create index if not exists article_evidence_article_idx on public.article_evidence(article_id,created_at desc);
create index if not exists article_evidence_created_by_idx on public.article_evidence(created_by);
alter table public.article_evidence enable row level security;
grant select on public.article_evidence to anon,authenticated;
grant insert,update,delete on public.article_evidence to authenticated;
drop policy if exists "Public can read evidence for published articles" on public.article_evidence;
create policy "Public can read evidence for published articles" on public.article_evidence for select to anon,authenticated
using(exists(select 1 from public.articles a where a.id=article_id and a.editorial_status='published'));
drop policy if exists "Editors can add article evidence" on public.article_evidence;
create policy "Editors can add article evidence" on public.article_evidence for insert to authenticated
with check(((select auth.jwt())->'app_metadata'->>'role') in ('admin','editor'));
drop policy if exists "Editors can update article evidence" on public.article_evidence;
create policy "Editors can update article evidence" on public.article_evidence for update to authenticated
using(((select auth.jwt())->'app_metadata'->>'role') in ('admin','editor'))
with check(((select auth.jwt())->'app_metadata'->>'role') in ('admin','editor'));
drop policy if exists "Editors can delete article evidence" on public.article_evidence;
create policy "Editors can delete article evidence" on public.article_evidence for delete to authenticated
using(((select auth.jwt())->'app_metadata'->>'role') in ('admin','editor'));
create schema if not exists private;
create or replace function private.refresh_article_verification(p_article_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_sources integer;v_independent integer;v_field integer;v_official integer;v_conflicts integer;v_corrections integer;v_retractions integer;v_status text;
begin
 select count(*),
 count(distinct lower(trim(publisher))) filter(where independent_source and evidence_type in ('independent_report','official_statement','field_report','primary_document')),
 count(*) filter(where evidence_type='field_report'),count(*) filter(where evidence_type='official_statement'),
 count(*) filter(where evidence_type='contradiction'),count(*) filter(where evidence_type='correction'),
 count(*) filter(where evidence_type='retraction')
 into v_sources,v_independent,v_field,v_official,v_conflicts,v_corrections,v_retractions
 from public.article_evidence where article_id=p_article_id;
 v_status:=case when v_retractions>0 then 'retracted' when v_conflicts>0 then 'disputed'
 when v_corrections>0 then 'corrected' when v_field>0 and v_independent>=2 then 'field_confirmed'
 when v_official>0 and v_independent>=2 then 'official_confirmed' when v_independent>=3 then 'confirmed'
 when v_independent>=2 then 'multi' when v_independent=1 then 'single' else 'unconfirmed' end;
 update public.articles set verification=v_status,verification_source_count=v_sources,verification_independent_count=v_independent,
 verification_field_count=v_field,verification_official_count=v_official,verification_conflict_count=v_conflicts,
 verification_correction_count=v_corrections,verification_retraction_count=v_retractions,verification_updated_at=now()
 where id=p_article_id;
end;$$;
revoke all on function private.refresh_article_verification(uuid) from public,anon,authenticated;
create or replace function private.article_evidence_recompute_trigger()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='DELETE' then perform private.refresh_article_verification(old.article_id);return old;
 elsif tg_op='UPDATE' then
  if old.article_id is distinct from new.article_id then perform private.refresh_article_verification(old.article_id);end if;
  perform private.refresh_article_verification(new.article_id);return new;
 else perform private.refresh_article_verification(new.article_id);return new;end if;
end;$$;
revoke all on function private.article_evidence_recompute_trigger() from public,anon,authenticated;
drop trigger if exists article_evidence_recompute on public.article_evidence;
create trigger article_evidence_recompute after insert or update or delete on public.article_evidence
for each row execute function private.article_evidence_recompute_trigger();
update public.articles set verification='unconfirmed',verification_source_count=0,verification_independent_count=0,
 verification_field_count=0,verification_official_count=0,verification_conflict_count=0,verification_correction_count=0,
 verification_retraction_count=0,verification_updated_at=now()
where editorial_status='published' and not exists(select 1 from public.article_evidence e where e.article_id=articles.id);
create table if not exists public.telegram_breaking_translations(
 article_id uuid not null references public.telegram_breaking_items(article_id) on delete cascade,
 lang text not null check(lang in ('ar','en')),title text not null,summary text,
 created_at timestamptz not null default now(),primary key(article_id,lang)
);
alter table public.telegram_breaking_translations enable row level security;
grant select on public.telegram_breaking_translations to anon,authenticated;
revoke insert,update,delete on public.telegram_breaking_translations from anon,authenticated;
drop policy if exists "Public read ticker translations" on public.telegram_breaking_translations;
create policy "Public read ticker translations" on public.telegram_breaking_translations for select to anon,authenticated
using(exists(select 1 from public.telegram_breaking_items t where t.article_id=public.telegram_breaking_translations.article_id));
do $$ begin alter publication supabase_realtime add table public.articles; exception when duplicate_object then null; end $$;
