-- "ما الجديد في هذا الخبر": short dated updates attached to a published story,
-- shown on the public article page without re-publishing or changing its URL.
create table if not exists public.article_updates (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  kind text not null default 'update' check (kind in ('update','development','correction','clarification')),
  body text not null check (char_length(btrim(body)) between 3 and 1200),
  source_url text check (source_url is null or (char_length(source_url) <= 2048 and source_url ~ '^https?://[^/@[:space:]]+([/?#][^[:space:]]*)?$')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists article_updates_article_idx on public.article_updates (article_id, created_at desc);

alter table public.article_updates enable row level security;
revoke all on public.article_updates from public, anon, authenticated;
grant select, insert, delete on public.article_updates to authenticated;
grant all on public.article_updates to service_role;

drop policy if exists article_updates_editor_read on public.article_updates;
drop policy if exists article_updates_editor_insert on public.article_updates;
drop policy if exists article_updates_editor_delete on public.article_updates;
create policy article_updates_editor_read on public.article_updates for select to authenticated using (private.trust_is_editor());
create policy article_updates_editor_insert on public.article_updates for insert to authenticated with check (private.trust_is_editor());
create policy article_updates_editor_delete on public.article_updates for delete to authenticated using (private.trust_is_editor());

-- A correction is also recorded on the article itself, so the existing correction banner,
-- feeds and change log stay consistent.
create or replace function private.article_update_sync_correction()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.kind = 'correction' then
    update public.articles set correction_note = left(new.body, 1200), corrected_at = new.created_at
    where id = new.article_id;
  end if;
  return new;
end $$;
revoke all on function private.article_update_sync_correction() from public, anon, authenticated;
drop trigger if exists article_updates_sync_correction on public.article_updates;
create trigger article_updates_sync_correction after insert on public.article_updates
  for each row execute function private.article_update_sync_correction();

-- Public read: only for stories the reader can already open.
create or replace function public.public_article_updates(p_id uuid)
returns table (id uuid, kind text, body text, source_url text, created_at timestamptz)
language sql stable security definer set search_path = pg_catalog as $$
  select u.id, u.kind, u.body, u.source_url, u.created_at
  from public.article_updates u
  join public.articles a on a.id = u.article_id
  where u.article_id = p_id
    and a.editorial_status = 'published' and a.published_at <= now()
    and a.audience_lane in ('arabic','world')
  order by u.created_at desc
  limit 30;
$$;
revoke all on function public.public_article_updates(uuid) from public;
grant execute on function public.public_article_updates(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
