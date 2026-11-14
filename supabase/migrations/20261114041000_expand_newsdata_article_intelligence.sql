alter table public.articles
  add column if not exists newsdata_keywords text[] not null default '{}',
  add column if not exists newsdata_ai_summary text,
  add column if not exists newsdata_regions jsonb not null default '[]'::jsonb,
  add column if not exists newsdata_organizations jsonb not null default '[]'::jsonb,
  add column if not exists newsdata_symbols text[] not null default '{}',
  add column if not exists newsdata_sentiment_stats jsonb,
  add column if not exists newsdata_source_priority integer;

drop index if exists public.articles_newsdata_article_id_uidx;
create index if not exists articles_newsdata_article_id_idx
  on public.articles (newsdata_article_id)
  where newsdata_article_id is not null;
