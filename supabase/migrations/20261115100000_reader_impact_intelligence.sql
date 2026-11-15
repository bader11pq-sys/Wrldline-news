-- WRLDLINE Phase 2: reader-facing context generated from the article itself.
-- This migration adds two bounded public fields without broadening table access
-- or changing the signatures of the existing public RPCs.
begin;

alter table public.articles
  add column if not exists ai_reader_impact text,
  add column if not exists ai_watch_next text;

comment on column public.articles.ai_reader_impact is
  'AI-assisted explanation of the supported relevance of this story to Arabic readers; not personal advice or human verification.';
comment on column public.articles.ai_watch_next is
  'AI-assisted, evidence-based signal to monitor next; must not invent dates or future events.';

create or replace function public.public_news_article_intelligence(p_id uuid)
returns table (
  id uuid,
  ai_summary text,
  ai_reader_impact text,
  ai_watch_next text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    a.id,
    left(a.ai_summary::text, 1200),
    left(a.ai_reader_impact::text, 900),
    left(a.ai_watch_next::text, 900)
  from public.articles a
  where a.id = p_id
    and a.editorial_status = 'published'
    and a.published_at is not null
    and a.published_at <= now()
  limit 1;
$$;

revoke all on function public.public_news_article_intelligence(uuid) from public;
grant execute on function public.public_news_article_intelligence(uuid) to anon, authenticated;

-- Versioned RPC preserves existing callers while adding two public, bounded fields.
create or replace function public.public_home_news_recent_v2(
  p_limit integer default 100,
  p_before timestamp with time zone default now(),
  p_since timestamp with time zone default null,
  p_offset integer default 0,
  p_newsdata_only boolean default null,
  p_is_breaking boolean default null,
  p_is_exclusive boolean default null
)
returns table (
  id uuid,
  title text,
  summary text,
  image_url text,
  lang text,
  category text,
  country text,
  event_country text,
  source_language text,
  source_scope text,
  language_detection text,
  source_name text,
  source_url text,
  url text,
  published_at timestamp with time zone,
  is_breaking boolean,
  verification text,
  correction_note text,
  corrected_at timestamp with time zone,
  media_type text,
  content_type text,
  sponsor_name text,
  sponsor_url text,
  ai_country_code text,
  ai_summary text,
  ai_reader_impact text,
  ai_watch_next text,
  ai_risk_level text,
  ai_risk_score integer,
  is_exclusive boolean,
  exclusive_type text,
  newsdata_article_id text,
  newsdata_categories text[],
  newsdata_ai_tags jsonb,
  newsdata_sentiment text,
  newsdata_ai_summary text,
  newsdata_fetched_at timestamp with time zone,
  newsdata_only boolean,
  article_translations jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    a.id,
    left(a.title::text, 1000),
    left(a.summary::text, 12000),
    left(a.image_url::text, 4096),
    a.lang::text,
    a.category::text,
    a.country::text,
    a.event_country::text,
    a.source_language::text,
    a.source_scope::text,
    a.language_detection::text,
    left(a.source_name::text, 300),
    left(a.source_url::text, 4096),
    left(a.url::text, 4096),
    a.published_at::timestamptz,
    a.is_breaking,
    a.verification::text,
    left(a.correction_note::text, 4000),
    a.corrected_at::timestamptz,
    a.media_type::text,
    a.content_type::text,
    left(a.sponsor_name::text, 300),
    left(a.sponsor_url::text, 4096),
    a.ai_country_code::text,
    left(a.ai_summary::text, 12000),
    left(a.ai_reader_impact::text, 900),
    left(a.ai_watch_next::text, 900),
    a.ai_risk_level::text,
    a.ai_risk_score,
    a.is_exclusive,
    a.exclusive_type,
    a.newsdata_article_id::text,
    a.newsdata_categories,
    a.newsdata_ai_tags,
    a.newsdata_sentiment::text,
    left(a.newsdata_ai_summary::text, 12000),
    a.newsdata_fetched_at::timestamptz,
    a.newsdata_only,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'lang', t.lang,
        'title', left(t.title::text, 1000),
        'summary', left(t.summary::text, 12000),
        'ai_summary', left(t.ai_summary::text, 12000),
        'translation_status', t.translation_status,
        'translation_source', t.translation_source
      ) order by t.lang)
      from public.article_translations t
      where t.article_id = a.id
        and t.translation_status = 'published'
        and nullif(btrim(t.title), '') is not null
    ), '[]'::jsonb)
  from public.articles a
  where a.editorial_status = 'published'
    and a.published_at is not null
    and a.published_at <= least(coalesce(p_before, now()), now())
    and (p_since is null or a.published_at >= p_since)
    and (p_newsdata_only is null or a.newsdata_only = p_newsdata_only)
    and (p_is_breaking is null or a.is_breaking = p_is_breaking)
    and (p_is_exclusive is null or a.is_exclusive = p_is_exclusive)
  order by a.published_at desc, a.id asc
  limit greatest(1, least(coalesce(p_limit, 100), 1000))
  offset greatest(0, least(coalesce(p_offset, 0), 50000000));
$$;

revoke all on function public.public_home_news_recent_v2(
  integer, timestamptz, timestamptz, integer, boolean, boolean, boolean
) from public;
grant execute on function public.public_home_news_recent_v2(
  integer, timestamptz, timestamptz, integer, boolean, boolean, boolean
) to anon, authenticated;

commit;
