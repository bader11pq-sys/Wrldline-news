-- WRLDLINE editorial trust. LOCAL ONLY: parent must review/apply against live schema.
-- No backfill/demotion of articles or translations. No public table-wide article access.
begin;
create schema if not exists private;

alter table public.articles
  add column if not exists agency_name text,
  add column if not exists agency_account_url text,
  add column if not exists agency_statement_url text,
  add column if not exists agency_narrative text,
  add column if not exists trust_source_excerpt text,
  add column if not exists editorial_trust_status text not null default 'unconfirmed',
  add column if not exists trust_needs_review boolean not null default true,
  add column if not exists trust_review_note text,
  add column if not exists trust_reviewed_at timestamptz,
  add column if not exists trust_reviewed_by uuid,
  add column if not exists human_translation_status text not null default 'pending',
  add column if not exists human_translation_note text,
  add column if not exists human_translation_reviewed_at timestamptz,
  add column if not exists human_translation_reviewed_by uuid;

do $$ begin
  alter table public.articles add constraint articles_editorial_trust_check
    check (editorial_trust_status in ('confirmed','unconfirmed','disputed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.articles add constraint articles_human_translation_check
    check (human_translation_status in ('pending','reviewed','not_required'));
exception when duplicate_object then null; end $$;

-- Reuse live evidence. A publisher name is NOT proof of independence; the editor
-- records the originating reporting group (syndicated copies share that group).
alter table public.article_evidence
  alter column independent_source set default false,
  add column if not exists provenance_group text,
  add column if not exists independence_note text,
  add column if not exists independence_reviewed_at timestamptz,
  add column if not exists independence_reviewed_by uuid;

create table if not exists public.article_claims (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  claim_text text not null check (length(btrim(claim_text)) between 3 and 2000),
  status text not null default 'unconfirmed' check (status in ('confirmed','unconfirmed','disputed')),
  supporting_evidence_ids uuid[] not null default '{}',
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists article_claims_article_idx on public.article_claims(article_id);

-- Preserve the existing table/rows if the earlier local migration was applied.
create table if not exists public.article_change_log (
  id uuid primary key default gen_random_uuid(), article_id uuid not null,
  changed_at timestamptz not null default now(), change_type text not null,
  changed_fields jsonb not null default '{}'::jsonb,
  before_snapshot jsonb, after_snapshot jsonb
);
alter table public.article_change_log
  add column if not exists entity_type text not null default 'article',
  add column if not exists public_note text,
  add column if not exists public_safe boolean not null default false;
-- Keep history after article deletion, including when an old cascade FK exists.
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.article_change_log'::regclass and contype='f' and confrelid='public.articles'::regclass loop
    execute format('alter table public.article_change_log drop constraint %I',c.conname);
  end loop;
end $$;
create index if not exists article_change_log_article_idx on public.article_change_log(article_id,changed_at desc);

create or replace function private.trust_is_editor() returns boolean
language sql stable set search_path=pg_catalog as $$
  select auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'role','') in ('editor','admin');
$$;
create or replace function private.trust_safe_url(p_url text) returns boolean
language sql immutable set search_path=pg_catalog as $$
  select p_url is not null and length(p_url)<=2048
    and p_url ~ '^https?://[^/@[:space:]]+([/?#][^[:space:]]*)?$';
$$;
revoke all on function private.trust_is_editor(), private.trust_safe_url(text) from public,anon,authenticated;

-- Replace all policies on trust tables, not on articles/accounts. Editor/admin
-- SELECT only for logs; triggers are the sole writer. Public consumes safe RPC.
do $$ declare tbl text; p record; begin
  foreach tbl in array array['article_evidence','article_claims','article_change_log'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from public, anon, authenticated',tbl);
    for p in select policyname from pg_policies where schemaname='public' and tablename=tbl loop
      execute format('drop policy %I on public.%I',p.policyname,tbl);
    end loop;
    execute format('grant select on public.%I to authenticated',tbl);
    execute format('create policy trust_editor_read on public.%I for select to authenticated using (auth.uid() is not null and coalesce(auth.jwt()->''app_metadata''->>''role'','''') in (''editor'',''admin''))',tbl);
    if tbl <> 'article_change_log' then
      execute format('grant insert,update,delete on public.%I to authenticated',tbl);
      execute format('create policy trust_editor_write on public.%I for all to authenticated using (auth.uid() is not null and coalesce(auth.jwt()->''app_metadata''->>''role'','''') in (''editor'',''admin'')) with check (auth.uid() is not null and coalesce(auth.jwt()->''app_metadata''->>''role'','''') in (''editor'',''admin''))',tbl);
    end if;
  end loop;
end $$;

create or replace function private.trust_immutable_log() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin raise exception 'Editorial history is append-only' using errcode='42501'; end;
$$;
revoke all on function private.trust_immutable_log() from public,anon,authenticated;
drop trigger if exists trust_log_no_mutation on public.article_change_log;
create trigger trust_log_no_mutation before update or delete on public.article_change_log
  for each row execute function private.trust_immutable_log();
drop trigger if exists trust_log_no_truncate on public.article_change_log;
create trigger trust_log_no_truncate before truncate on public.article_change_log
  for each statement execute function private.trust_immutable_log();

-- Lock parent rows before evidence/claim edits: confirmation and evidence changes
-- serialize against the same article. IDs may not be moved to a different story.
create or replace function private.trust_evidence_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not private.trust_is_editor() then raise exception 'Human editor required' using errcode='42501'; end if;
  if tg_op='DELETE' then
    perform 1 from public.articles where id=old.article_id for update;
    if not found then return old; end if; -- parent article is already being deleted
    if exists(select 1 from public.article_claims where old.id=any(supporting_evidence_ids)) then
      raise exception 'Remove this evidence from its claims before deletion';
    end if;
    return old;
  end if;
  if tg_op='UPDATE' and (new.id<>old.id or new.article_id<>old.article_id) then raise exception 'Evidence identity is immutable'; end if;
  perform 1 from public.articles where id=new.article_id for update;
  if not private.trust_safe_url(new.evidence_url) then raise exception 'Evidence requires a real HTTP(S) source URL without credentials'; end if;
  if new.independent_source then
    if nullif(btrim(new.provenance_group),'') is null or nullif(btrim(new.independence_note),'') is null then
      raise exception 'Record reporting origin and a human independence rationale; republication is not independence';
    end if;
    new.independence_reviewed_at:=clock_timestamp(); new.independence_reviewed_by:=auth.uid();
  else new.independence_reviewed_at:=null; new.independence_reviewed_by:=null;
  end if;
  if tg_op='INSERT' then new.created_by:=auth.uid(); end if;
  return new;
end; $$;
revoke all on function private.trust_evidence_guard() from public,anon,authenticated;
drop trigger if exists trust_evidence_guard on public.article_evidence;
create trigger trust_evidence_guard before insert or update or delete on public.article_evidence
  for each row execute function private.trust_evidence_guard();

create or replace function private.trust_claim_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare groups integer; expected integer; actual integer;
begin
  if not private.trust_is_editor() then raise exception 'Human editor required' using errcode='42501'; end if;
  if tg_op='DELETE' then perform 1 from public.articles where id=old.article_id for update; return old; end if;
  if tg_op='UPDATE' and (new.id<>old.id or new.article_id<>old.article_id) then raise exception 'Claim identity is immutable'; end if;
  perform 1 from public.articles where id=new.article_id for update;
  select count(distinct x) into expected from unnest(new.supporting_evidence_ids) x;
  select count(*),count(distinct lower(btrim(provenance_group))) filter (
    where independent_source and independence_reviewed_by is not null and independence_reviewed_at is not null
      and evidence_type in ('independent_report','official_statement','field_report','primary_document'))
    into actual,groups from public.article_evidence where article_id=new.article_id and id=any(new.supporting_evidence_ids);
  if expected<>actual or array_position(new.supporting_evidence_ids,null) is not null then raise exception 'Evidence must belong to this article'; end if;
  if new.status='confirmed' then
    if groups<2 or nullif(btrim(new.review_note),'') is null then raise exception 'Confirmation requires human review and two recorded independent reporting origins'; end if;
    if exists(select 1 from public.article_evidence where id=any(new.supporting_evidence_ids) and evidence_type in ('contradiction','retraction')) then
      raise exception 'Contradictory or retracted evidence cannot support a confirmed claim';
    end if;
  end if;
  new.reviewed_at:=clock_timestamp(); new.reviewed_by:=auth.uid();
  return new;
end; $$;
revoke all on function private.trust_claim_guard() from public,anon,authenticated;
drop trigger if exists trust_claim_guard on public.article_claims;
create trigger trust_claim_guard before insert or update or delete on public.article_claims
  for each row execute function private.trust_claim_guard();

-- A review label is not enough after the linked evidence changed. Publisher
-- counts, AI scores and a stale human timestamp are not fresh verification.
create or replace function private.trust_claim_current(p_claim_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce((select c.status='confirmed' and c.reviewed_by is not null and c.reviewed_at is not null
    and (select count(distinct lower(btrim(e.provenance_group))) from public.article_evidence e
      where e.article_id=c.article_id and e.id=any(c.supporting_evidence_ids) and e.independent_source
        and e.independence_reviewed_at is not null and e.independence_reviewed_by is not null
        and e.evidence_type in ('independent_report','official_statement','field_report','primary_document'))>=2
    and not exists(select 1 from public.article_evidence e where e.article_id=c.article_id and e.evidence_type in ('contradiction','retraction'))
    and not exists(select 1 from public.article_evidence e where e.article_id=c.article_id and e.id=any(c.supporting_evidence_ids)
      and e.independence_reviewed_at>c.reviewed_at)
    from public.article_claims c where c.id=p_claim_id),false);
$$;
revoke all on function private.trust_claim_current(uuid) from public,anon,authenticated;

-- No old count-based promotion: disable old trigger and replace its helper for
-- any old internal caller. Future changes invalidate review, never certify it.
drop trigger if exists article_evidence_recompute on public.article_evidence;
create or replace function private.refresh_article_verification(p_article_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update public.articles set trust_needs_review=true,
    editorial_trust_status=case when exists(select 1 from public.article_claims c where c.article_id=p_article_id and c.status='disputed')
      or exists(select 1 from public.article_evidence e where e.article_id=p_article_id and e.evidence_type in ('contradiction','retraction'))
      then 'disputed' else 'unconfirmed' end,
    verification=case when exists(select 1 from public.article_claims c where c.article_id=p_article_id and c.status='disputed')
      or exists(select 1 from public.article_evidence e where e.article_id=p_article_id and e.evidence_type in ('contradiction','retraction'))
      then 'disputed' else 'unconfirmed' end
    where id=p_article_id;
end; $$;
revoke all on function private.refresh_article_verification(uuid) from public,anon,authenticated;

create or replace function private.trust_article_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare oj jsonb; nj jsonb; translated boolean; review_requested boolean; changed boolean;
begin
  nj:=to_jsonb(new); oj:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  translated:=coalesce(nullif(new.source_language,''),new.lang) is distinct from new.lang;
  if tg_op='UPDATE' and new.verification is distinct from old.verification
    and new.verification in ('disputed','unconfirmed','retracted') and new.editorial_trust_status='confirmed' then
    new.trust_needs_review:=true;
    new.editorial_trust_status:=case when new.verification in ('disputed','retracted') then 'disputed' else 'unconfirmed' end;
  end if;
  changed:=tg_op='UPDATE' and (oj->'title' is distinct from nj->'title' or oj->'summary' is distinct from nj->'summary'
    or oj->'lang' is distinct from nj->'lang' or oj->'source_language' is distinct from nj->'source_language'
    or oj->'source_url' is distinct from nj->'source_url' or oj->'agency_narrative' is distinct from nj->'agency_narrative'
    or oj->'agency_statement_url' is distinct from nj->'agency_statement_url' or oj->'agency_account_url' is distinct from nj->'agency_account_url'
    or oj->'trust_source_excerpt' is distinct from nj->'trust_source_excerpt');
  if tg_op='UPDATE' and new.human_translation_status is distinct from old.human_translation_status
    and translated and new.human_translation_status<>'reviewed' and new.editorial_trust_status='confirmed' then
    new.trust_needs_review:=true; new.editorial_trust_status:='unconfirmed'; new.verification:='unconfirmed';
  end if;
  if changed then
    new.trust_needs_review:=true; new.editorial_trust_status:='unconfirmed';
    if translated then new.human_translation_status:='pending'; new.human_translation_reviewed_at:=null; new.human_translation_reviewed_by:=null; end if;
    if new.verification in ('confirmed','field_confirmed','official_confirmed') then new.verification:='unconfirmed'; end if;
  end if;
  if new.agency_account_url is not null and not private.trust_safe_url(new.agency_account_url) then raise exception 'Invalid agency account URL'; end if;
  if new.agency_statement_url is not null and not private.trust_safe_url(new.agency_statement_url) then raise exception 'Invalid agency statement URL'; end if;
  if new.human_translation_status='not_required' and translated then raise exception 'Translated content requires human translation review'; end if;
  if (tg_op='INSERT' and new.human_translation_status='reviewed') or
    (tg_op='UPDATE' and (new.human_translation_status is distinct from old.human_translation_status or new.human_translation_note is distinct from old.human_translation_note)
      and new.human_translation_status='reviewed') then
    if not private.trust_is_editor() or nullif(btrim(new.human_translation_note),'') is null then raise exception 'Explicit human translation review note required' using errcode='42501'; end if;
    new.human_translation_reviewed_at:=clock_timestamp(); new.human_translation_reviewed_by:=auth.uid();
  elsif tg_op='UPDATE' then
    if not changed then new.human_translation_reviewed_at:=old.human_translation_reviewed_at; new.human_translation_reviewed_by:=old.human_translation_reviewed_by; end if;
  else new.human_translation_reviewed_at:=null; new.human_translation_reviewed_by:=null;
  end if;
  review_requested:=(tg_op='INSERT' and (new.editorial_trust_status='confirmed' or not new.trust_needs_review)) or
    (tg_op='UPDATE' and ((new.editorial_trust_status is distinct from old.editorial_trust_status and new.editorial_trust_status='confirmed')
      or (old.trust_needs_review and not new.trust_needs_review)
      or (new.trust_review_note is distinct from old.trust_review_note and not new.trust_needs_review)));
  if review_requested then
    if not private.trust_is_editor() or nullif(btrim(new.trust_review_note),'') is null then raise exception 'Explicit human editorial review required' using errcode='42501'; end if;
    if new.editorial_trust_status='confirmed' then
      if not exists(select 1 from public.article_claims where article_id=new.id)
        or exists(select 1 from public.article_claims where article_id=new.id and status<>'confirmed')
        or exists(select 1 from public.article_evidence where article_id=new.id and evidence_type in ('contradiction','retraction')) then
        raise exception 'Unconfirmed/disputed claims or conflicting evidence prevent story confirmation';
      end if;
      -- Revalidate current evidence, not a stale claim-review label.
      if exists(select 1 from public.article_claims c where c.article_id=new.id and
        not private.trust_claim_current(c.id)) then
        raise exception 'Claim evidence is no longer sufficient or changed since its human review';
      end if;
      if translated and (new.human_translation_status<>'reviewed' or new.human_translation_reviewed_by is null) then raise exception 'Unreviewed translation cannot be confirmed'; end if;
    end if;
    new.trust_needs_review:=false; new.trust_reviewed_at:=clock_timestamp(); new.trust_reviewed_by:=auth.uid();
    new.verification:=new.editorial_trust_status;
  elsif tg_op='UPDATE' then
    new.trust_reviewed_at:=old.trust_reviewed_at; new.trust_reviewed_by:=old.trust_reviewed_by;
  else new.trust_reviewed_at:=null; new.trust_reviewed_by:=null;
  end if;
  -- Legacy verification field cannot bypass the structured claim/translation checks.
  if new.verification in ('confirmed','field_confirmed','official_confirmed') and
    (tg_op='INSERT' or new.verification is distinct from old.verification) and not review_requested then
    raise exception 'Use the human editorial trust review; AI confidence and counts do not verify a story';
  end if;
  return new;
end; $$;
revoke all on function private.trust_article_guard() from public,anon,authenticated;
drop trigger if exists trust_article_guard on public.articles;
create trigger trust_article_guard before insert or update on public.articles for each row execute function private.trust_article_guard();

-- Sanitized append-only entries. Snapshots and actor IDs are NEVER written by
-- this trigger. Existing snapshots remain private and excluded from public RPC.
create or replace function private.trust_audit_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare oj jsonb:='{}'; nj jsonb:='{}'; aid uuid; keys text[]; k text; fields jsonb:='{}'; kind text:='updated'; note text;
begin
  if tg_op<>'INSERT' then oj:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then nj:=to_jsonb(new); end if;
  aid:=coalesce((nj->>'article_id')::uuid,(oj->>'article_id')::uuid,(nj->>'id')::uuid,(oj->>'id')::uuid);
  if tg_table_name='articles' then
    keys:=array['title','summary','lang','source_language','source_name','source_url','url','editorial_status','verification','correction_note','corrected_at',
      'agency_name','agency_account_url','agency_statement_url','agency_narrative','trust_source_excerpt','editorial_trust_status','trust_needs_review',
      'trust_review_note','trust_reviewed_at','human_translation_status','human_translation_note','human_translation_reviewed_at'];
  elsif tg_table_name='article_evidence' then keys:=array['publisher','evidence_url','evidence_type','independent_source','provenance_group','independence_note','notes'];
  elsif tg_table_name='article_claims' then keys:=array['claim_text','status','supporting_evidence_ids','review_note'];
  else keys:=array['title','summary','translation_status','translation_source','human_review_note','reviewed_at']; end if;
  foreach k in array keys loop
    if oj->k is distinct from nj->k then fields:=fields||jsonb_build_object(k,true); end if;
  end loop;
  if fields='{}' and tg_op='UPDATE' then return new; end if;
  note:=case tg_table_name when 'article_evidence' then 'Source evidence updated; editorial assessment requires review.'
    when 'article_claims' then 'Claim assessment updated; editorial assessment requires review.'
    when 'article_translations' then 'Translation text or human review status updated.' else 'Editorial content or assessment updated.' end;
  if tg_op='INSERT' and tg_table_name='articles' then kind:='created'; note:='Story created.';
  elsif tg_table_name='articles' and fields ? 'correction_note' and nullif(nj->>'correction_note','') is not null then
    kind:='correction'; note:=left(nj->>'correction_note',1200);
  elsif tg_table_name='articles' and fields ? 'verification' then kind:='verification';
  elsif tg_table_name='articles' and nj->>'editorial_status'='rejected' then kind:='retraction'; note:='Story withdrawn from publication.'; end if;
  insert into public.article_change_log(article_id,change_type,entity_type,changed_fields,public_note,public_safe)
    values(aid,kind,tg_table_name,fields,note,true);
  if tg_table_name in ('article_evidence','article_claims') then perform private.refresh_article_verification(aid); end if;
  if tg_table_name='articles' and tg_op='UPDATE' and
    (fields ? 'title' or fields ? 'summary' or oj->'source_language' is distinct from nj->'source_language' or oj->'lang' is distinct from nj->'lang')
    and to_regclass('public.article_translations') is not null then
    execute 'update public.article_translations set translation_status=''review'' where article_id=$1 and translation_status=''published''' using aid;
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end; $$;
revoke all on function private.trust_audit_change() from public,anon,authenticated;
drop trigger if exists article_change_log_trigger on public.articles;
drop trigger if exists trust_article_audit on public.articles;
create trigger trust_article_audit after insert or update or delete on public.articles for each row execute function private.trust_audit_change();
drop trigger if exists trust_evidence_audit on public.article_evidence;
create trigger trust_evidence_audit after insert or update or delete on public.article_evidence for each row execute function private.trust_audit_change();
drop trigger if exists trust_claim_audit on public.article_claims;
create trigger trust_claim_audit after insert or update or delete on public.article_claims for each row execute function private.trust_audit_change();

-- Explicit human review entry points. Caller JWT (not service role/AI metadata)
-- is required; reviewed timestamps and identities are stamped by DB triggers.
create or replace function public.review_article_trust(p_article_id uuid,p_status text,p_note text,
  p_translation_status text default null,p_translation_note text default null) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not private.trust_is_editor() then raise exception 'Editor/admin required' using errcode='42501'; end if;
  update public.articles set editorial_trust_status=p_status,trust_needs_review=false,trust_review_note=p_note,
    human_translation_status=coalesce(p_translation_status,human_translation_status),
    human_translation_note=coalesce(p_translation_note,human_translation_note) where id=p_article_id;
  if not found then raise exception 'Article not found'; end if;
end; $$;
revoke all on function public.review_article_trust(uuid,text,text,text,text) from public,anon;
grant execute on function public.review_article_trust(uuid,text,text,text,text) to authenticated;

-- Optional live translations: do not create a guessed parallel translation table.
create or replace function private.trust_translation_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare edited boolean;
begin
  if tg_op='UPDATE' and (new.id<>old.id or new.article_id<>old.article_id or new.lang is distinct from old.lang) then
    raise exception 'Translation identity and language are immutable; create a new translation';
  end if;
  if tg_op='UPDATE' and old.translation_source='machine_draft' and new.translation_source is distinct from old.translation_source then
    raise exception 'Machine-origin provenance cannot be relabeled as editorial';
  end if;
  perform 1 from public.articles where id=new.article_id for update;
  edited:=tg_op='UPDATE' and (new.title is distinct from old.title or new.summary is distinct from old.summary);
  if edited then new.translation_status:='review'; new.reviewed_at:=null; new.reviewed_by:=null; end if;
  if new.translation_status='published' and (tg_op='INSERT' or old.translation_status is distinct from new.translation_status
    or new.human_review_note is distinct from old.human_review_note) then
    if not private.trust_is_editor() or nullif(btrim(new.human_review_note),'') is null then raise exception 'Publishing a translation requires explicit human review' using errcode='42501'; end if;
    new.reviewed_at:=clock_timestamp(); new.reviewed_by:=auth.uid();
  elsif new.translation_status<>'published' then new.reviewed_at:=null; new.reviewed_by:=null;
  elsif tg_op='UPDATE' and not edited then new.reviewed_at:=old.reviewed_at; new.reviewed_by:=old.reviewed_by;
  elsif tg_op='INSERT' then new.reviewed_at:=null; new.reviewed_by:=null; end if;
  return new;
end; $$;
revoke all on function private.trust_translation_guard() from public,anon,authenticated;
do $$ begin
  if to_regclass('public.article_translations') is not null then
    alter table public.article_translations add column if not exists human_review_note text;
    drop trigger if exists trust_translation_guard on public.article_translations;
    create trigger trust_translation_guard before insert or update on public.article_translations for each row execute function private.trust_translation_guard();
    drop trigger if exists trust_translation_audit on public.article_translations;
    create trigger trust_translation_audit after insert or update or delete on public.article_translations for each row execute function private.trust_audit_change();
  end if;
end $$;
create or replace function public.review_article_translation(p_translation_id uuid,p_decision text,p_note text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare affected integer;
begin
  if not private.trust_is_editor() then raise exception 'Editor/admin required' using errcode='42501'; end if;
  if p_decision not in ('published','rejected') or nullif(btrim(p_note),'') is null then raise exception 'Explicit review decision and note required'; end if;
  if to_regclass('public.article_translations') is null then raise exception 'Translation table is unavailable'; end if;
  execute 'update public.article_translations set translation_status=$1,human_review_note=$2,published_at=case when $1=''published'' then now() else published_at end where id=$3'
    using p_decision,p_note,p_translation_id;
  get diagnostics affected = row_count;
  if affected=0 then raise exception 'Translation not found'; end if;
end; $$;
revoke all on function public.review_article_translation(uuid,text,text) from public,anon;
grant execute on function public.review_article_translation(uuid,text,text) to authenticated;

-- One story, bounded arrays, explicit SAFE snake_case projection. No snapshots,
-- actor IDs, claim/evidence IDs, internal notes or account rows. Legacy count/AI
-- verification is deliberately not presented as human confirmation.
create or replace function public.get_public_article_trust(p_article_id uuid,p_lang text default 'ar') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb; translation jsonb;
begin
  select jsonb_build_object(
    'id',a.id,'canonical_url','/news/'||a.id,'lang',a.lang,'source_language',coalesce(a.source_language,a.lang),
    'source_name',a.source_name,'source_url',case when private.trust_safe_url(a.url) then a.url when private.trust_safe_url(a.source_url) then a.source_url end,
    'editorial_trust_status',case when a.trust_needs_review then case when a.editorial_trust_status='disputed' then 'disputed' else 'unconfirmed' end else a.editorial_trust_status end,
    'trust_needs_review',a.trust_needs_review,'trust_reviewed_at',a.trust_reviewed_at,
    'human_translation_status',a.human_translation_status,'human_translation_reviewed_at',a.human_translation_reviewed_at,
    'agency_name',a.agency_name,'agency_account_url',case when private.trust_safe_url(a.agency_account_url) then a.agency_account_url end,
    'agency_statement_url',case when private.trust_safe_url(a.agency_statement_url) then a.agency_statement_url end,
    'agency_narrative',left(a.agency_narrative,6000),'trust_source_excerpt',left(a.trust_source_excerpt,6000),
    'correction_note',left(a.correction_note,1200),'corrected_at',a.corrected_at,
    'evidence',coalesce((select jsonb_agg(x.obj) from (select jsonb_build_object(
      'publisher',e.publisher,'evidence_url',e.evidence_url,'evidence_type',e.evidence_type,
      'independence_recorded',e.independent_source and e.independence_reviewed_at is not null and e.independence_reviewed_by is not null)
      obj from public.article_evidence e where e.article_id=a.id and private.trust_safe_url(e.evidence_url) order by e.created_at,e.id limit 100) x),'[]'::jsonb),
    'claims',coalesce((select jsonb_agg(x.obj) from (select jsonb_build_object(
      'claim_text',c.claim_text,'status',case when c.status='confirmed' and (a.trust_needs_review or not private.trust_claim_current(c.id)) then 'unconfirmed' else c.status end,'reviewed_at',c.reviewed_at,
      'supporting_evidence',coalesce((select jsonb_agg(s.obj) from (select jsonb_build_object('publisher',e.publisher,'evidence_url',e.evidence_url) obj
        from public.article_evidence e where e.article_id=a.id and e.id=any(c.supporting_evidence_ids) and private.trust_safe_url(e.evidence_url) order by e.created_at limit 100) s),'[]'::jsonb)) obj
      from public.article_claims c where c.article_id=a.id order by c.created_at,c.id limit 100) x),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(x.obj) from (select jsonb_build_object(
      'changed_at',l.changed_at,'change_type',l.change_type,'entity_type',l.entity_type,'public_note',l.public_note) obj
      from public.article_change_log l where l.article_id=a.id and l.public_safe order by l.changed_at desc,l.id limit 100) x),'[]'::jsonb)
  ) into result from public.articles a where a.id=p_article_id and a.editorial_status='published'
    and a.published_at is not null and a.published_at<=now() limit 1;
  if result is null then return null; end if;
  if to_regclass('public.article_translations') is not null then
    execute 'select jsonb_build_object(''lang'',lang,''title'',title,''summary'',summary,''translation_source'',translation_source,''reviewed_at'',reviewed_at)
      from public.article_translations where article_id=$1 and lang=$2 and translation_status=''published'' and reviewed_by is not null and reviewed_at is not null and nullif(btrim(human_review_note),'''') is not null limit 1'
      into translation using p_article_id,p_lang;
  end if;
  return result||jsonb_build_object('reviewed_translation',translation);
end; $$;
revoke all on function public.get_public_article_trust(uuid,text) from public;
grant execute on function public.get_public_article_trust(uuid,text) to anon,authenticated;

-- authenticated is shared by readers AND editors. Table-wide SELECT inherited
-- from older migrations would expose newly added notes/actor IDs despite RLS.
-- Explicit allowlists retain browser projections; future columns stay private.
-- Apply in this transaction, not in a later migration with an exposure window.
do $$ declare tbl text; all_columns text; safe_columns text; allowed text[]; begin
  foreach tbl in array array['articles','article_translations'] loop
    if to_regclass('public.'||tbl) is null then continue; end if;
    if tbl='articles' then
      allowed:=array[
        'id','title','summary','image_url','author','lang','category','country',
        'event_country','source_scope','source_language','language_detection',
        'source_name','url','source_url','published_at','received_at','fetched_at',
        'media_type','is_breaking','content_type','sponsor_name','sponsor_url',
        'correction_note','corrected_at','editorial_status','verification',
        'verification_source_count','verification_independent_count','verification_field_count',
        'verification_official_count','verification_conflict_count','verification_correction_count',
        'verification_retraction_count','verification_updated_at','verification_note',
        'ai_country_code','ai_region','ai_event_type','ai_risk_level','ai_risk_score',
        'ai_confidence','ai_summary','ai_location_name','ai_latitude','ai_longitude',
        'ai_classification_status','is_exclusive','exclusive_type','exclusive_reason','exclusive_confidence',
        'newsdata_article_id','newsdata_categories','newsdata_ai_tags','newsdata_sentiment',
        'newsdata_ai_summary','newsdata_fetched_at','newsdata_only',
        'agency_name','agency_account_url','agency_statement_url','agency_narrative','trust_source_excerpt',
        'editorial_trust_status','trust_needs_review','trust_reviewed_at',
        'human_translation_status','human_translation_reviewed_at'];
    else
      allowed:=array['id','article_id','lang','title','summary','ai_summary',
        'translation_status','translation_source','created_at','published_at','reviewed_at'];
    end if;
    select string_agg(quote_ident(attname),',' order by attnum),
      string_agg(quote_ident(attname),',' order by attnum) filter (where attname=any(allowed))
      into all_columns,safe_columns from pg_attribute
      where attrelid=to_regclass('public.'||tbl) and attnum>0 and not attisdropped;
    execute format('revoke select on table public.%I from public,anon,authenticated',tbl);
    -- Table REVOKE does not revoke pre-existing individual column grants.
    execute format('revoke select (%s) on table public.%I from public,anon,authenticated',all_columns,tbl);
    execute format('grant select (%s) on table public.%I to authenticated',safe_columns,tbl);
    -- Existing ingestion/briefing service projections may need reviewer presence
    -- for certification. They remain server-only; no service key enters browsers.
    execute format('grant select on table public.%I to service_role',tbl);
  end loop;
end $$;

-- Keep existing editor/write policies. A restrictive SELECT condition also
-- closes stale/unknown permissive reader policies (including FOR ALL policies).
-- No rows or publishing decisions are changed at migration time.
do $$ begin
  if to_regclass('public.article_translations') is not null then
    alter table public.article_translations enable row level security;
    drop policy if exists "Authenticated read published translations" on public.article_translations;
    create policy "Authenticated read published translations" on public.article_translations
      for select to authenticated using (
        (translation_status='published' and exists (
          select 1 from public.articles a where a.id=article_id and a.editorial_status='published'))
        or (auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'role','') in ('editor','admin')));
    drop policy if exists trust_reader_published_translations on public.article_translations;
    create policy trust_reader_published_translations on public.article_translations
      as restrictive for select to authenticated using (
        (translation_status='published' and exists (
          select 1 from public.articles a where a.id=article_id and a.editorial_status='published'))
        or (auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'role','') in ('editor','admin')));
  end if;
end $$;

-- Only this explicitly role-checked editor projection exposes article notes and
-- reviewer IDs to a browser. IDs come from the bounded core list, not raw rows.
create or replace function public.get_editor_article_trust(p_article_ids uuid[])
returns table (id uuid,trust_review_note text,trust_reviewed_by uuid,
  human_translation_note text,human_translation_reviewed_by uuid)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not private.trust_is_editor() then raise exception 'Editor/admin required' using errcode='42501'; end if;
  if p_article_ids is null or cardinality(p_article_ids)>200 then
    raise exception 'Provide at most 200 article IDs';
  end if;
  return query select a.id,a.trust_review_note,a.trust_reviewed_by,
    a.human_translation_note,a.human_translation_reviewed_by
    from public.articles a where a.id=any(p_article_ids) order by a.id limit 200;
end; $$;
revoke all on function public.get_editor_article_trust(uuid[]) from public,anon;
grant execute on function public.get_editor_article_trust(uuid[]) to authenticated;
commit;
