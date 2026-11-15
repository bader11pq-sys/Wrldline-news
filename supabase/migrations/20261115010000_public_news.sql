-- Public article SSR: explicit projections only. No table grants or account-policy changes.
-- Apply as database owner after reviewing the live schema and removing anonymous INSERT.
begin;

create index if not exists articles_public_id_idx on public.articles(id)
  where editorial_status = 'published' and published_at is not null;
create index if not exists articles_public_publication_idx on public.articles(published_at desc, id)
  where editorial_status = 'published' and published_at is not null;

create or replace function public.public_news_article(p_id uuid)
returns table (
  id uuid, title text, summary text, image_url text, author jsonb,
  lang text, category text, country text, event_country text, source_language text,
  source_name text, source_url text, url text, published_at timestamptz,
  is_breaking boolean, verification text, correction_note text, corrected_at timestamptz
)
language sql stable security definer set search_path = pg_catalog
as $$
  select a.id, left(a.title::text, 1000), left(a.summary::text, 12000),
    left(a.image_url::text, 4096), to_jsonb(a.author), a.lang::text, a.category::text,
    a.country::text, a.event_country::text, a.source_language::text,
    left(a.source_name::text, 300), left(a.source_url::text, 4096), left(a.url::text, 4096),
    a.published_at::timestamptz, a.is_breaking, a.verification::text,
    left(a.correction_note::text, 4000), a.corrected_at::timestamptz
  from public.articles a
  where a.id = p_id and a.editorial_status = 'published'
    and a.published_at is not null and a.published_at <= now()
  limit 1;
$$;

create or replace function public.public_news_recent(
  p_limit integer default 100, p_before timestamptz default now(),
  p_since timestamptz default null, p_offset integer default 0
)
returns table (
  id uuid, title text, summary text, image_url text, author jsonb,
  lang text, category text, country text, event_country text, source_language text,
  source_name text, source_url text, url text, published_at timestamptz,
  is_breaking boolean, verification text, correction_note text, corrected_at timestamptz
)
language sql stable security definer set search_path = pg_catalog
as $$
  select a.id, left(a.title::text, 1000), left(a.summary::text, 12000),
    left(a.image_url::text, 4096), to_jsonb(a.author), a.lang::text, a.category::text,
    a.country::text, a.event_country::text, a.source_language::text,
    left(a.source_name::text, 300), left(a.source_url::text, 4096), left(a.url::text, 4096),
    a.published_at::timestamptz, a.is_breaking, a.verification::text,
    left(a.correction_note::text, 4000), a.corrected_at::timestamptz
  from public.articles a
  where a.editorial_status = 'published' and a.published_at is not null
    and a.published_at <= least(coalesce(p_before, now()), now())
    and (p_since is null or a.published_at >= p_since)
  order by a.published_at desc, a.id asc
  limit greatest(1, least(coalesce(p_limit, 100), 1000))
  offset greatest(0, least(coalesce(p_offset, 0), 50000000));
$$;

-- Minimal sitemap projection; UUID keyset order has no timestamp tie ambiguity.
create or replace function public.public_news_sitemap(p_after uuid default null)
returns table (id uuid, published_at timestamptz, corrected_at timestamptz)
language sql stable security definer set search_path = pg_catalog
as $$
  select a.id, a.published_at::timestamptz, a.corrected_at::timestamptz
  from public.articles a
  where a.editorial_status = 'published' and a.published_at is not null
    and a.published_at <= now() and (p_after is null or a.id > p_after)
  order by a.id asc
  limit 1000;
$$;

-- Numbered sitemap pages use the last UUID of the preceding 1,000-row chunk.
-- The first page has a null cursor, and a terminal exact chunk adds no empty page.
-- Each call returns at most 1,000 boundaries; the worker explicitly paginates the index.
create or replace function public.public_news_sitemap_index(
  p_page integer default null, p_offset integer default 0
)
returns table (page bigint, after_id uuid)
language sql stable security definer set search_path = pg_catalog
as $$
  with ranked as (
    select a.id, row_number() over (order by a.id asc) as position,
      count(*) over () as total
    from public.articles a
    where a.editorial_status = 'published' and a.published_at is not null
      and a.published_at <= now()
  ), boundaries as (
    select 1::bigint as page, null::uuid as after_id
    union all
    select r.position / 1000 + 1, r.id
      from ranked r where r.position % 1000 = 0 and r.position < r.total
  )
  select b.page, b.after_id from boundaries b
  where p_page is null or b.page = p_page
  order by b.page asc
  limit 1000 offset greatest(0, least(coalesce(p_offset, 0), 50000));
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default; explicitly remove that default.
revoke all on function public.public_news_article(uuid) from public, anon, authenticated;
revoke all on function public.public_news_recent(integer,timestamptz,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.public_news_sitemap(uuid) from public, anon, authenticated;
revoke all on function public.public_news_sitemap_index(integer,integer) from public, anon, authenticated;
grant execute on function public.public_news_article(uuid) to anon, authenticated;
grant execute on function public.public_news_recent(integer,timestamptz,timestamptz,integer) to anon, authenticated;
grant execute on function public.public_news_sitemap(uuid) to anon, authenticated;
grant execute on function public.public_news_sitemap_index(integer,integer) to anon, authenticated;

comment on function public.public_news_article(uuid) is 'Public published summary projection for SSR; excludes received dates, private account data, AI confidence, ingestion diagnostics and scraped full text.';
comment on function public.public_news_sitemap_index(integer,integer) is 'Numbered UUID-keyset sitemap boundaries; read p_offset chunks when index exceeds the PostgREST per-response cap.';
commit;
