-- WRLDLINE · public read performance
--
-- Why this migration exists (measured on production, 23 Nov 2026):
--   * public_news_recent(p_limit => 1000) exceeded the anon statement timeout
--     (3s), so /news-sitemap.xml answered 503 to every crawler.
--   * public_news_sitemap_index() ranked the whole published archive with a
--     window function and also exceeded 3s, so /article-sitemap.xml was flaky.
--   * public_home_news_recent_v4 filtered with `audience_lane = ANY (CASE ...)`,
--     which the planner cannot turn into an index condition: 600 ms server time
--     versus 159 ms for the literal-lane v3. Every extra 500 ms is paid on a
--     mobile connection.
--
-- The fix keeps the same public contract but (a) gives list pages a narrow,
-- index-friendly projection, (b) gives the news sitemap a projection without
-- full article bodies, and (c) replaces the window-function sitemap index with
-- bounded index lookups. No table data is modified.

begin;

-- 1. Compact list feed for the public archive and section pages.
--    Only the fields a list card renders; summaries are capped at 700 chars so
--    a 50-item page stays small on mobile instead of shipping ~170 KB.
create or replace function public.public_news_list(
  p_limit integer default 50,
  p_before timestamp with time zone default now(),
  p_since timestamp with time zone default null,
  p_offset integer default 0,
  p_lane text default 'all'
) returns table (
  id uuid,
  title text,
  summary text,
  image_url text,
  lang text,
  category text,
  source_name text,
  source_url text,
  url text,
  published_at timestamp with time zone,
  content_type text,
  audience_lane text
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 5000000));
  v_before timestamptz := least(coalesce(p_before, now()), now());
  v_lane text := lower(coalesce(p_lane, 'all'));
begin
  -- Each branch carries a literal lane predicate so PostgreSQL can use
  -- articles_public_lane_published_idx instead of scanning the whole archive.
  if v_lane = 'arabic' then
    return query
      select a.id, left(a.title::text, 1000), left(a.summary::text, 700),
             left(a.image_url::text, 4096), a.lang::text, a.category::text,
             left(a.source_name::text, 300), left(a.source_url::text, 4096),
             left(a.url::text, 4096), a.published_at::timestamptz,
             a.content_type::text, a.audience_lane::text
      from public.articles a
      where a.editorial_status = 'published' and a.published_at is not null
        and a.audience_lane = 'arabic'
        and a.published_at <= v_before
        and (p_since is null or a.published_at >= p_since)
      order by a.published_at desc, a.id asc
      limit v_limit offset v_offset;
  elsif v_lane = 'world' then
    return query
      select a.id, left(a.title::text, 1000), left(a.summary::text, 700),
             left(a.image_url::text, 4096), a.lang::text, a.category::text,
             left(a.source_name::text, 300), left(a.source_url::text, 4096),
             left(a.url::text, 4096), a.published_at::timestamptz,
             a.content_type::text, a.audience_lane::text
      from public.articles a
      where a.editorial_status = 'published' and a.published_at is not null
        and a.audience_lane = 'world'
        and a.published_at <= v_before
        and (p_since is null or a.published_at >= p_since)
      order by a.published_at desc, a.id asc
      limit v_limit offset v_offset;
  elsif v_lane = 'leisure' then
    return query
      select a.id, left(a.title::text, 1000), left(a.summary::text, 700),
             left(a.image_url::text, 4096), a.lang::text, a.category::text,
             left(a.source_name::text, 300), left(a.source_url::text, 4096),
             left(a.url::text, 4096), a.published_at::timestamptz,
             a.content_type::text, a.audience_lane::text
      from public.articles a
      where a.editorial_status = 'published' and a.published_at is not null
        and a.audience_lane = 'leisure'
        and a.published_at <= v_before
        and (p_since is null or a.published_at >= p_since)
      order by a.published_at desc, a.id asc
      limit v_limit offset v_offset;
  else
    return query
      select a.id, left(a.title::text, 1000), left(a.summary::text, 700),
             left(a.image_url::text, 4096), a.lang::text, a.category::text,
             left(a.source_name::text, 300), left(a.source_url::text, 4096),
             left(a.url::text, 4096), a.published_at::timestamptz,
             a.content_type::text, a.audience_lane::text
      from public.articles a
      where a.editorial_status = 'published' and a.published_at is not null
        and a.audience_lane in ('arabic', 'world')
        and a.published_at <= v_before
        and (p_since is null or a.published_at >= p_since)
      order by a.published_at desc, a.id asc
      limit v_limit offset v_offset;
  end if;
end;
$function$;

comment on function public.public_news_list(integer, timestamp with time zone, timestamp with time zone, integer, text) is
  'Compact, index-friendly public list feed (arabic|world|leisure|all). Used by the public archive and section pages.';

revoke all on function public.public_news_list(integer, timestamp with time zone, timestamp with time zone, integer, text) from public;
grant execute on function public.public_news_list(integer, timestamp with time zone, timestamp with time zone, integer, text) to anon, authenticated, service_role;

-- 2. News sitemap source: identifiers, titles and dates only.
create or replace function public.public_news_sitemap_recent(
  p_hours integer default 48,
  p_limit integer default 1000
) returns table (
  id uuid,
  title text,
  lang text,
  published_at timestamp with time zone
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select a.id, left(a.title::text, 1000), a.lang::text, a.published_at::timestamptz
  from public.articles a
  where a.editorial_status = 'published'
    and a.published_at is not null
    and a.audience_lane in ('arabic', 'world')
    and a.published_at <= now()
    and a.published_at >= now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 48), 168)))
  order by a.published_at desc, a.id asc
  limit greatest(1, least(coalesce(p_limit, 1000), 1000));
$function$;

comment on function public.public_news_sitemap_recent(integer, integer) is
  'Google News sitemap source: at most 1000 identifiers from the last N hours, without article bodies.';

revoke all on function public.public_news_sitemap_recent(integer, integer) from public;
grant execute on function public.public_news_sitemap_recent(integer, integer) to anon, authenticated, service_role;

-- 3. Sitemap index without a window function over the whole archive.
create or replace function public.public_news_sitemap_index(
  p_page integer default null,
  p_offset integer default 0
) returns table (
  page bigint,
  after_id uuid
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_total bigint;
  v_pages bigint;
begin
  select count(*) into v_total
  from public.articles a
  where a.editorial_status = 'published'
    and a.published_at is not null
    and a.audience_lane in ('arabic', 'world')
    and a.published_at <= now();

  v_pages := greatest(1, (v_total + 999) / 1000);

  return query
    select g.page,
           case
             when g.page = 1 then null::uuid
             else (
               select a.id
               from public.articles a
               where a.editorial_status = 'published'
                 and a.published_at is not null
                 and a.audience_lane in ('arabic', 'world')
                 and a.published_at <= now()
               order by a.id
               limit 1 offset ((g.page - 1) * 1000 - 1)
             )
           end
    from generate_series(1, v_pages) as g(page)
    where p_page is null or g.page = p_page
    order by g.page
    limit 1000 offset greatest(0, least(coalesce(p_offset, 0), 50000));
end;
$function$;

comment on function public.public_news_sitemap_index(integer, integer) is
  'Sitemap page boundaries computed with bounded index lookups; page 1 has no boundary.';

revoke all on function public.public_news_sitemap_index(integer, integer) from public;
grant execute on function public.public_news_sitemap_index(integer, integer) to anon, authenticated, service_role;

commit;
