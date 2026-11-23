-- WRLDLINE · public read follow-ups
--
-- Why this migration exists (measured on production, 23 Nov 2026):
--   * /news/ and /section/* waited 3.4 s on public_related_articles, which used
--     a LATERAL join per candidate row. Rewritten as two bounded index lookups.
--   * The homepage breaking and exclusive modules returned HTTP 500 whenever
--     public_home_news_recent_v3 crossed the anon statement timeout, because a
--     flag-filtered projection cannot use the lane index. They now have their
--     own compact feeds and matching partial indexes (~0.5 s, stable).
--   * public_source_directory applied a regex to every published row (3.07 s
--     cold). The Telegram filter now uses strpos() on a precomputed haystack.
--   * The public sitemap index needed an index-only scan, so the published
--     lane filter gets a covering index.
--
-- Contract, column names and column order are unchanged for every function.
-- No table data is modified. Safe to re-run.
begin;

-- 1. Covering index so the sitemap index reads page boundaries without heap IO.
create index if not exists articles_public_sitemap_cover_idx
  on public.articles (id) include (published_at)
  where editorial_status = 'published' and audience_lane in ('arabic', 'world');

-- 2. Partial indexes for the two homepage flag feeds.
create index if not exists articles_lane_breaking_published_idx
  on public.articles (published_at desc)
  where editorial_status = 'published' and is_breaking and audience_lane = 'arabic';

create index if not exists articles_lane_exclusive_published_idx
  on public.articles (published_at desc)
  where editorial_status = 'published' and is_exclusive and audience_lane in ('arabic', 'world');

-- 3. Related stories: resolve the category once, then one bounded ordered scan.
create or replace function public.public_related_articles(p_id uuid, p_limit integer default 4)
returns table (
  id uuid,
  title text,
  image_url text,
  published_at timestamptz,
  category text,
  source_name text,
  audience_lane text
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_category text;
begin
  select a.category::text into v_category from public.articles a where a.id = p_id;
  if v_category is null then
    return;
  end if;
  return query
    select a.id,
           left(a.title::text, 1000),
           left(a.image_url::text, 4096),
           a.published_at::timestamptz,
           a.category::text,
           left(a.source_name::text, 300),
           a.audience_lane::text
    from public.articles a
    where a.editorial_status = 'published'
      and a.published_at is not null
      and a.published_at <= now()
      and a.audience_lane in ('arabic', 'world')
      and a.id <> p_id
      and lower(a.category::text) = lower(v_category)
    order by a.published_at desc, a.id asc
    limit greatest(1, least(coalesce(p_limit, 4), 8));
end;
$function$;
comment on function public.public_related_articles(uuid, integer) is
  'Up to 8 same-category published stories; two bounded index lookups, no LATERAL.';
revoke all on function public.public_related_articles(uuid, integer) from public;
grant execute on function public.public_related_articles(uuid, integer) to anon, authenticated, service_role;

-- 4. Breaking feed: Arabic lane only, per the breaking-news source policy.
create or replace function public.public_breaking_feed(p_limit integer default 8, p_since timestamptz default null)
returns table (
  id uuid,
  title text,
  summary text,
  image_url text,
  lang text,
  source_language text,
  category text,
  source_name text,
  source_url text,
  url text,
  published_at timestamptz,
  is_breaking boolean,
  content_type text,
  verification text,
  correction_note text,
  corrected_at timestamptz,
  audience_lane text
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select a.id,
         left(a.title::text, 1000),
         left(a.summary::text, 1200),
         left(a.image_url::text, 4096),
         a.lang::text,
         a.source_language::text,
         a.category::text,
         left(a.source_name::text, 300),
         left(a.source_url::text, 4096),
         left(a.url::text, 4096),
         a.published_at::timestamptz,
         a.is_breaking,
         a.content_type::text,
         a.verification::text,
         left(a.correction_note::text, 4000),
         a.corrected_at::timestamptz,
         a.audience_lane::text
  from public.articles a
  where a.editorial_status = 'published'
    and a.published_at is not null
    and a.published_at <= now()
    and a.is_breaking = true
    and a.audience_lane = 'arabic'
    and (p_since is null or a.published_at >= p_since)
  order by a.published_at desc, a.id asc
  limit greatest(1, least(coalesce(p_limit, 8), 30));
$function$;
comment on function public.public_breaking_feed(integer, timestamptz) is
  'Arabic-lane breaking stories, newest first; backed by a partial index.';
revoke all on function public.public_breaking_feed(integer, timestamptz) from public;
grant execute on function public.public_breaking_feed(integer, timestamptz) to anon, authenticated, service_role;

-- 5. Exclusive feed: Arabic plus verified international, per the publication gate.
create or replace function public.public_exclusive_feed(p_limit integer default 5)
returns table (
  id uuid,
  title text,
  summary text,
  image_url text,
  lang text,
  source_language text,
  category text,
  source_name text,
  source_url text,
  url text,
  published_at timestamptz,
  is_breaking boolean,
  content_type text,
  verification text,
  correction_note text,
  corrected_at timestamptz,
  audience_lane text
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select a.id,
         left(a.title::text, 1000),
         left(a.summary::text, 1200),
         left(a.image_url::text, 4096),
         a.lang::text,
         a.source_language::text,
         a.category::text,
         left(a.source_name::text, 300),
         left(a.source_url::text, 4096),
         left(a.url::text, 4096),
         a.published_at::timestamptz,
         a.is_breaking,
         a.content_type::text,
         a.verification::text,
         left(a.correction_note::text, 4000),
         a.corrected_at::timestamptz,
         a.audience_lane::text
  from public.articles a
  where a.editorial_status = 'published'
    and a.published_at is not null
    and a.published_at <= now()
    and a.is_exclusive = true
    and a.audience_lane in ('arabic', 'world')
  order by a.published_at desc, a.id asc
  limit greatest(1, least(coalesce(p_limit, 5), 30));
$function$;
comment on function public.public_exclusive_feed(integer) is
  'Exclusive stories for the homepage module; backed by a partial index.';
revoke all on function public.public_exclusive_feed(integer) from public;
grant execute on function public.public_exclusive_feed(integer) to anon, authenticated, service_role;

-- 6. Source directory: substring filters instead of per-row regular expressions.
create or replace function public.public_source_directory(p_hours integer default 72, p_limit integer default 300)
returns table (
  source_name text,
  source_url text,
  source_language text,
  source_scope text,
  article_count bigint,
  latest_published_at timestamptz,
  correction_count bigint
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  with scoped as (
    select coalesce(nullif(btrim(a.source_name::text), ''), 'المصدر غير متاح') as source_name,
           a.source_url::text as source_url,
           coalesce(nullif(btrim(a.source_language::text), ''), 'unknown') as source_language,
           coalesce(nullif(btrim(a.source_scope::text), ''), 'unknown') as source_scope,
           a.published_at::timestamptz as published_at,
           a.correction_note::text as correction_note,
           lower(coalesce(a.url, '') || ' ' || coalesce(a.source_url, '') || ' ' || coalesce(a.source_name, '')) as haystack
    from public.articles a
    where a.editorial_status = 'published'
      and a.audience_lane in ('arabic', 'world')
      and a.published_at is not null
      and a.published_at <= now()
      and a.published_at >= now() - (greatest(1, least(coalesce(p_hours, 72), 72)) * interval '1 hour')
  )
  select s.source_name,
         case
           when max(s.source_url) ~* '^https?://[^/@[:space:]]+([/?#][^[:space:]]*)?$' then left(max(s.source_url), 4096)
           else null
         end,
         max(s.source_language),
         max(s.source_scope),
         count(*)::bigint,
         max(s.published_at),
         count(*) filter (where nullif(btrim(s.correction_note), '') is not null)::bigint
  from scoped s
  where strpos(s.haystack, 't.me') = 0
    and strpos(s.haystack, 'telegram') = 0
  group by s.source_name
  order by count(*) desc, max(s.published_at) desc, s.source_name asc
  limit greatest(1, least(coalesce(p_limit, 300), 300));
$function$;
comment on function public.public_source_directory(integer, integer) is
  'Publisher directory for the last N hours; Telegram mirrors excluded with strpos, not regex.';
revoke all on function public.public_source_directory(integer, integer) from public;
grant execute on function public.public_source_directory(integer, integer) to anon, authenticated, service_role;

commit;
