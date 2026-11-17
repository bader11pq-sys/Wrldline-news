-- Keep the correlated public homepage translation projection bounded and index-backed.
-- This index contains only rows the public RPC is allowed to expose.
begin;

create index if not exists article_translations_published_article_idx
  on public.article_translations (article_id, lang)
  where translation_status = 'published'
    and nullif(btrim(title), '') is not null;

commit;
