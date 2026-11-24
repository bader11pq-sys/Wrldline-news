-- A public, read-only change signal. No article fields travel over Realtime.
begin;

create index if not exists articles_public_breaking_recent_idx
  on public.articles (published_at desc, id)
  where editorial_status = 'published' and is_breaking
    and audience_lane in ('arabic', 'world') and newsdata_only is not true;

create or replace function public.public_breaking_feed(p_limit integer default 8, p_since timestamptz default null)
returns table (
  id uuid, title text, summary text, image_url text, lang text, source_language text,
  category text, source_name text, source_url text, url text, published_at timestamptz,
  is_breaking boolean, content_type text, verification text, correction_note text,
  corrected_at timestamptz, audience_lane text
)
language sql stable security definer set search_path to 'pg_catalog'
as $function$
  select a.id, left(a.title::text, 1000), left(a.summary::text, 1200),
    left(a.image_url::text, 4096), a.lang::text, a.source_language::text,
    a.category::text, left(a.source_name::text, 300), left(a.source_url::text, 4096),
    left(a.url::text, 4096), a.published_at::timestamptz, a.is_breaking,
    a.content_type::text, a.verification::text, left(a.correction_note::text, 4000),
    a.corrected_at::timestamptz, a.audience_lane::text
  from public.articles a
  where a.editorial_status = 'published' and a.is_breaking
    and a.audience_lane in ('arabic', 'world') and a.newsdata_only is not true
    and a.published_at <= now() and (p_since is null or a.published_at >= p_since)
  order by a.published_at desc, a.id asc
  limit greatest(1, least(coalesce(p_limit, 8), 30));
$function$;
comment on function public.public_breaking_feed(integer, timestamptz) is
  'Published breaking stories from the approved Arabic and international lanes, newest first.';
revoke all on function public.public_breaking_feed(integer, timestamptz) from public;
grant execute on function public.public_breaking_feed(integer, timestamptz) to anon, authenticated, service_role;

create table if not exists public.breaking_feed_revision (
  id boolean primary key default true check (id),
  revision bigint not null default 0
);
insert into public.breaking_feed_revision (id) values (true) on conflict do nothing;
alter table public.breaking_feed_revision enable row level security;
revoke all on table public.breaking_feed_revision from public, anon, authenticated;
grant select on table public.breaking_feed_revision to anon, authenticated;
drop policy if exists breaking_feed_revision_read on public.breaking_feed_revision;
create policy breaking_feed_revision_read on public.breaking_feed_revision
  for select to anon, authenticated using (true);

create or replace function private.signal_live_breaking()
returns trigger language plpgsql security definer set search_path to 'pg_catalog'
as $function$
declare
  current_time_utc timestamptz := statement_timestamp();
  old_visible boolean := false;
  new_visible boolean := false;
  changes_alert boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_visible := old.editorial_status = 'published' and old.is_breaking
      and old.audience_lane in ('arabic', 'world') and old.newsdata_only is not true
      and old.published_at > current_time_utc - interval '15 minutes'
      and old.published_at <= clock_timestamp();
  end if;
  if tg_op <> 'DELETE' then
    new_visible := new.editorial_status = 'published' and new.is_breaking
      and new.audience_lane in ('arabic', 'world') and new.newsdata_only is not true
      and new.published_at > current_time_utc - interval '15 minutes'
      and new.published_at <= clock_timestamp();
  end if;
  -- Keep ordinary dashboard editing intact. A browser editor cannot set/clear
  -- the flag, re-date or release an alert, or alter an alert while it is live.
  if tg_op = 'INSERT' then
    changes_alert := new.is_breaking is true;
  elsif tg_op = 'UPDATE' then
    changes_alert := (old.is_breaking is true) is distinct from (new.is_breaking is true)
      or (new.is_breaking is true and
        (old.editorial_status, old.published_at, old.audience_lane, old.newsdata_only) is distinct from
        (new.editorial_status, new.published_at, new.audience_lane, new.newsdata_only));
  end if;
  if (changes_alert or old_visible or new_visible)
    and (current_setting('role',true) in ('anon','authenticated') or auth.jwt()->>'role' in ('anon','authenticated'))
    and (coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' or not exists (
      select 1 from auth.users u where u.id = auth.uid() and u.raw_app_meta_data->>'role' = 'admin'
    )) then
    raise exception 'Admin access required for breaking news' using errcode = '42501';
  end if;
  if old_visible or new_visible then
    update public.breaking_feed_revision set revision = revision + 1 where id;
  end if;
  return null;
end
$function$;
revoke all on function private.signal_live_breaking() from public, anon, authenticated;
drop trigger if exists signal_live_breaking on public.articles;
create trigger signal_live_breaking
  after insert or delete or update of title, summary, published_at, editorial_status, is_breaking,
    audience_lane, newsdata_only, source_name, source_url, url, image_url, category, lang,
    source_language, content_type, correction_note, corrected_at, verification on public.articles
  for each row execute function private.signal_live_breaking();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='breaking_feed_revision') then
    alter publication supabase_realtime add table public.breaking_feed_revision;
  end if;
end
$$;

commit;
