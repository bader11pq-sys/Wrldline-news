alter table public.articles
  add column if not exists is_exclusive boolean not null default false,
  add column if not exists exclusive_type text,
  add column if not exists exclusive_reason text,
  add column if not exists exclusive_confidence numeric;

create index if not exists articles_exclusive_published_idx
  on public.articles (published_at desc)
  where is_exclusive = true and editorial_status = 'published';

comment on column public.articles.is_exclusive is
  'True only when AI editorial review finds explicit evidence of original/exclusive reporting in the article itself; publisher reputation alone is insufficient.';
