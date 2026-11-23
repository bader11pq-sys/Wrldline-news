-- WRLDLINE · section feed
--
-- /section/politics took 2.4 s server time on production. The query itself ran
-- in 14 ms, but it shipped 87 KB for 30 cards because every row carried a
-- summary capped at 12,000 characters and an ai_summary the worker never reads
-- (ai_summary is not in the worker's PUBLIC_FIELDS allowlist).
--
-- Two changes, no contract change: the column list, names and order stay the
-- same, so CREATE OR REPLACE is enough and the deployed worker keeps working.
--   * summaries are capped at 700 characters, the length a card can show;
--   * the category predicate becomes index-friendly, with a matching partial
--     index on the published Arabic and international lanes.
begin;

create index if not exists articles_public_section_idx
  on public.articles (lower(btrim(category::text)), published_at desc)
  where editorial_status = 'published' and audience_lane in ('arabic', 'world');

create or replace function public.public_section_feed(
  p_category text,
  p_limit integer default 30,
  p_before timestamptz default now(),
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  summary text,
  image_url text,
  lang text,
  category text,
  country text,
  source_name text,
  source_url text,
  url text,
  published_at timestamptz,
  is_breaking boolean,
  content_type text,
  ai_summary text,
  audience_lane text,
  author jsonb
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select a.id,
         left(a.title::text, 1000),
         left(a.summary::text, 700),
         left(a.image_url::text, 4096),
         a.lang::text,
         a.category::text,
         a.country::text,
         left(a.source_name::text, 300),
         left(a.source_url::text, 4096),
         left(a.url::text, 4096),
         a.published_at::timestamptz,
         a.is_breaking,
         a.content_type::text,
         left(a.ai_summary::text, 400),
         a.audience_lane::text,
         to_jsonb(a.author)
  from public.articles a
  where a.editorial_status = 'published'
    and a.published_at is not null
    and a.published_at <= least(coalesce(p_before, now()), now())
    and a.audience_lane in ('arabic', 'world')
    and a.category is not null
    and lower(btrim(a.category::text)) = lower(btrim(coalesce(p_category, '')))
  order by a.published_at desc, a.id asc
  limit greatest(1, least(coalesce(p_limit, 30), 60))
  offset greatest(0, least(coalesce(p_offset, 0), 50000));
$function$;
comment on function public.public_section_feed(text, integer, timestamptz, integer) is
  'Section page cards: 700-character summaries, index-friendly category match, newest first.';
revoke all on function public.public_section_feed(text, integer, timestamptz, integer) from public;
grant execute on function public.public_section_feed(text, integer, timestamptz, integer) to anon, authenticated, service_role;

commit;
