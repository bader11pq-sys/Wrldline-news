-- Human editorial control for AI-assisted publications.
-- Policy: an AI provider may only create DRAFTS. Publishing an AI-generated publication
-- requires an authenticated editor/admin decision with a written note.
-- Existing published rows are preserved untouched (no silent withdrawal); only new
-- publish transitions or content changes by AI providers are blocked.
-- Rollback:
--   drop trigger if exists editorial_publication_human_gate on public.editorial_publications;
--   drop function if exists private.editorial_publication_human_gate();
--   drop function if exists public.review_editorial_publication(uuid,text,text);
--   drop policy if exists "Editors read all editorial publications" on public.editorial_publications;
--   (review columns are additive and can remain)

alter table public.editorial_publications
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists review_decision text;

alter table public.editorial_publications
  drop constraint if exists editorial_publications_review_decision_check;
alter table public.editorial_publications
  add constraint editorial_publications_review_decision_check
  check (review_decision is null or review_decision in ('approved','rejected'));

create index if not exists editorial_publications_reviewed_by_idx
  on public.editorial_publications (reviewed_by);
create index if not exists editorial_publications_draft_queue_idx
  on public.editorial_publications (updated_at desc) where status = 'draft';

create or replace function private.editorial_publication_human_gate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'published'
     and coalesce(lower(new.generated_by), '') ~ '^(groq|nvidia|gemini|openrouter|bazaarlink|gonka|deepl|ai)([^a-z].*)?$'
     and (tg_op = 'INSERT' or old.status is distinct from 'published' or new.content is distinct from old.content)
  then
    if not private.trust_is_editor()
       or nullif(btrim(coalesce(new.review_note, '')), '') is null
       or new.reviewed_by is distinct from auth.uid() then
      raise exception 'AI-generated publications require explicit human editorial review before publishing'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.editorial_publication_human_gate() from public, anon, authenticated;

drop trigger if exists editorial_publication_human_gate on public.editorial_publications;
create trigger editorial_publication_human_gate
  before insert or update on public.editorial_publications
  for each row execute function private.editorial_publication_human_gate();

-- Editors can see drafts (the public policy still exposes published rows only).
drop policy if exists "Editors read all editorial publications" on public.editorial_publications;
create policy "Editors read all editorial publications"
  on public.editorial_publications for select to authenticated
  using (auth.uid() is not null and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('editor', 'admin'));

create or replace function public.review_editorial_publication(p_id uuid, p_decision text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.editorial_publications;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not private.trust_is_editor() then
    raise exception 'Editor/admin required' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023';
  end if;
  if v_note is null or length(v_note) < 8 or length(v_note) > 2000 then
    raise exception 'A review note of 8-2000 characters is required' using errcode = '22023';
  end if;
  select * into r from public.editorial_publications where id = p_id for update;
  if not found then
    raise exception 'Publication not found' using errcode = 'P0002';
  end if;
  if r.status <> 'draft' then
    raise exception 'Only drafts can be reviewed (current status: %)', r.status using errcode = '22023';
  end if;
  update public.editorial_publications set
    status = case when p_decision = 'approve' then 'published' else 'archived' end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = v_note,
    review_decision = case when p_decision = 'approve' then 'approved' else 'rejected' end,
    published_at = case when p_decision = 'approve' then now() else published_at end,
    updated_at = now()
  where id = p_id;
  return jsonb_build_object('id', p_id, 'status', case when p_decision = 'approve' then 'published' else 'archived' end);
end;
$$;
revoke all on function public.review_editorial_publication(uuid, text, text) from public, anon;
grant execute on function public.review_editorial_publication(uuid, text, text) to authenticated;
