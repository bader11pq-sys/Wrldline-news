-- Remove table-level anonymous mutation privileges; ingestion retains INSERT only.
revoke update, delete on table public.articles from anon;
grant select, insert on table public.articles to anon;
grant select, insert, update, delete on table public.articles to authenticated;

revoke update, delete on table public.article_translations from anon;
grant select, insert on table public.article_translations to anon;
grant select, insert, update on table public.article_translations to authenticated;
