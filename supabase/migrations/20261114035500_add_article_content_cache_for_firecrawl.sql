create table if not exists public.article_content_cache (
  article_id uuid primary key references public.articles(id) on delete cascade,
  source_url text not null,
  content_markdown text not null,
  provider text not null default 'firecrawl',
  scraped_at timestamptz not null default now()
);
create index if not exists article_content_cache_scraped_at_idx
  on public.article_content_cache (scraped_at desc);
alter table public.article_content_cache enable row level security;
revoke all on table public.article_content_cache from anon, authenticated;
grant all on table public.article_content_cache to service_role;
