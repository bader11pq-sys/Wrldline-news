
alter table public.articles
  add column if not exists newsdata_article_id text,
  add column if not exists newsdata_categories text[] not null default '{}',
  add column if not exists newsdata_ai_tags jsonb not null default '[]'::jsonb,
  add column if not exists newsdata_sentiment text,
  add column if not exists newsdata_datatype text,
  add column if not exists newsdata_fetched_at timestamptz;

create unique index if not exists articles_newsdata_article_id_uidx
  on public.articles (newsdata_article_id)
  where newsdata_article_id is not null;

create index if not exists articles_newsdata_fetched_at_idx
  on public.articles (newsdata_fetched_at desc)
  where newsdata_fetched_at is not null;

create table if not exists public.newsdata_sources (
  source_id text primary key,
  source_name text not null,
  source_url text,
  country text,
  language text,
  categories text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.newsdata_sources enable row level security;
revoke all on public.newsdata_sources from anon, authenticated;
