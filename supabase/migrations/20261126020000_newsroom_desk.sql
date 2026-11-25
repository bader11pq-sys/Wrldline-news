-- Newsroom desk: editor-only workflow overview, article queue, source summary and internal review notes.
-- Reuses articles.editorial_status (draft/review/published/rejected), editorial_trust_status, trust_needs_review,
-- article_change_log (corrections/updates history), article_updates and source_policy. No existing table is altered.
-- Authorisation is the existing private.trust_is_editor() (JWT app_metadata.role in editor/admin).
-- Nothing here publishes anything: the existing publication gate and human-review gate remain the only path.
-- Rollback: supabase/rollbacks/20261126020000_newsroom_desk.down.sql
begin;

-- 1. Internal, append-only review notes (never public).
create table if not exists public.article_review_notes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note','request_changes','verification','assignment')),
  body text not null check (char_length(btrim(body)) between 3 and 1000),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists article_review_notes_article_idx on public.article_review_notes(article_id, created_at desc);
create index if not exists article_review_notes_assignee_idx on public.article_review_notes(assigned_to, created_at desc) where assigned_to is not null;

alter table public.article_review_notes enable row level security;
revoke all on public.article_review_notes from public, anon, authenticated;
grant select, insert on public.article_review_notes to authenticated;
grant all on public.article_review_notes to service_role;

drop policy if exists review_notes_editor_read on public.article_review_notes;
create policy review_notes_editor_read on public.article_review_notes
  for select to authenticated using (private.trust_is_editor());
drop policy if exists review_notes_editor_insert on public.article_review_notes;
create policy review_notes_editor_insert on public.article_review_notes
  for insert to authenticated with check (private.trust_is_editor() and created_by = (select auth.uid()));
-- No UPDATE or DELETE policy: notes are an audit trail.

-- 2. Overview for operational monitoring and analytics.
create or replace function public.editor_newsroom_overview(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare
  d integer := greatest(1, least(coalesce(p_days, 30), 90));
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)));
  result jsonb;
begin
  if not private.trust_is_editor() then
    raise exception 'Editor/admin required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'generated_at', now(),
    'window_days', d,
    'by_status', coalesce((select jsonb_object_agg(s, n) from (select editorial_status s, count(*) n from public.articles group by 1) x), '{}'::jsonb),
    'review_backlog', (select count(*) from public.articles where editorial_status in ('draft','review')),
    'needs_trust_review', (select count(*) from public.articles where editorial_status = 'published' and trust_needs_review),
    'published_by_trust', coalesce((select jsonb_object_agg(t, n) from (
        select coalesce(editorial_trust_status, 'unconfirmed') t, count(*) n from public.articles
        where editorial_status = 'published' and published_at >= since group by 1) x), '{}'::jsonb),
    'published_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', dy, 'count', n) order by dy) from (
        select (published_at at time zone 'UTC')::date as dy, count(*) as n from public.articles
        where editorial_status = 'published' and published_at >= since and published_at <= now() group by 1) x), '[]'::jsonb),
    'changes_by_type', coalesce((select jsonb_object_agg(c, n) from (
        select change_type c, count(*) n from public.article_change_log where changed_at >= since group by 1) x), '{}'::jsonb),
    'story_updates_by_kind', coalesce((select jsonb_object_agg(k, n) from (
        select kind k, count(*) n from public.article_updates where created_at >= since group by 1) x), '{}'::jsonb),
    'translations_awaiting_review', coalesce((select count(*) from public.article_translations where translation_status = 'review'), 0),
    'open_review_requests', (select count(*) from public.article_review_notes n
        where n.kind = 'request_changes' and n.created_at >= since
          and not exists (select 1 from public.article_review_notes later where later.article_id = n.article_id and later.created_at > n.created_at and later.kind <> 'request_changes'))
  ) into result;
  return result;
end;
$$;

-- 3. Article queue with filters, search and history counters.
create or replace function public.editor_article_queue(
  p_status text default null, p_trust text default null, p_q text default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, title text, editorial_status text, trust_status text, trust_needs_review boolean, audience_lane text,
  source_name text, published_at timestamptz, last_change_at timestamptz, change_count bigint,
  correction_count bigint, update_count bigint, note_count bigint, last_note_kind text)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not private.trust_is_editor() then
    raise exception 'Editor/admin required' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('draft','review','published','rejected') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_trust is not null and p_trust not in ('confirmed','unconfirmed','disputed') then
    raise exception 'invalid trust status' using errcode = '22023';
  end if;
  return query
  select a.id, left(a.title::text, 300), a.editorial_status::text, coalesce(a.editorial_trust_status, 'unconfirmed')::text,
    coalesce(a.trust_needs_review, true), a.audience_lane::text, left(a.source_name::text, 160), a.published_at,
    (select max(l.changed_at) from public.article_change_log l where l.article_id = a.id),
    (select count(*) from public.article_change_log l where l.article_id = a.id),
    (select count(*) from public.article_change_log l where l.article_id = a.id and l.change_type in ('correction','retraction')),
    (select count(*) from public.article_updates u where u.article_id = a.id),
    (select count(*) from public.article_review_notes n where n.article_id = a.id),
    (select n.kind::text from public.article_review_notes n where n.article_id = a.id order by n.created_at desc limit 1)
  from public.articles a
  where (p_status is null or a.editorial_status = p_status)
    and (p_trust is null or coalesce(a.editorial_trust_status, 'unconfirmed') = p_trust)
    and (q is null or a.title ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or a.source_name ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by (a.editorial_status in ('review','draft')) desc, coalesce(a.published_at, now()) desc, a.id
  limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- 4. Source summary joined to the existing source policy tier.
create or replace function public.editor_source_summary(p_days integer default 30)
returns table (
  source_name text, policy_tier text, articles bigint, published bigint, confirmed bigint,
  needs_review bigint, corrections bigint, last_published_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)));
begin
  if not private.trust_is_editor() then
    raise exception 'Editor/admin required' using errcode = '42501';
  end if;
  return query
  select left(coalesce(nullif(btrim(a.source_name::text), ''), '(unattributed)'), 160),
    (select sp.tier::text from public.source_policy sp
      where sp.source_key = public.wrldline_source_key(max(a.source_name::text), max(a.source_url::text))),
    count(*), count(*) filter (where a.editorial_status = 'published'),
    count(*) filter (where a.editorial_status = 'published' and a.editorial_trust_status = 'confirmed'),
    count(*) filter (where a.editorial_status = 'published' and a.trust_needs_review),
    count(*) filter (where a.corrected_at is not null and a.corrected_at >= since),
    max(a.published_at) filter (where a.editorial_status = 'published')
  from public.articles a
  where a.published_at >= since or a.editorial_status in ('draft','review')
  group by 1
  order by 3 desc, 1
  limit 200;
end;
$$;

revoke all on function public.editor_newsroom_overview(integer), public.editor_article_queue(text, text, text, integer, integer),
  public.editor_source_summary(integer) from public, anon;
grant execute on function public.editor_newsroom_overview(integer), public.editor_article_queue(text, text, text, integer, integer),
  public.editor_source_summary(integer) to authenticated, service_role;

commit;
