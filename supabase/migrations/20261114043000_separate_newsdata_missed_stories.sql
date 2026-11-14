alter table public.articles
  add column if not exists newsdata_only boolean not null default false;

update public.articles
set newsdata_only = true,
    is_breaking = false
where newsdata_article_id is not null
  and guid = newsdata_article_id
  and coalesce(source_name, '') <> '';

create index if not exists articles_newsdata_only_published_idx
  on public.articles (published_at desc)
  where newsdata_only = true and editorial_status = 'published';