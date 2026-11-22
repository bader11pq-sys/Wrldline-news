begin;

-- Keep all existing list/feed contracts bounded. A reader opens one UUID at a time.
create or replace function public.public_article_reading(p_id uuid, p_lang text default null)
returns table (id uuid, body text, lang text, complete boolean)
language sql stable security definer set search_path = pg_catalog
as $$
  select a.id, left(coalesce(t.summary, a.summary::text), 1000000),
    coalesce(t.lang::text, nullif(a.source_language::text,''), nullif(a.lang::text,''), 'ar'),
    coalesce(length(coalesce(t.summary, a.summary::text)), 0) <= 1000000
  from public.articles a
  left join lateral (
    select at.summary::text, at.lang
    from public.article_translations at
    where at.article_id = a.id and p_lang in ('ar','en') and at.lang = p_lang
      and at.translation_status = 'published'
      and nullif(btrim(at.title::text),'') is not null
      and nullif(btrim(at.summary::text),'') is not null
    limit 1
  ) t on true
  where a.id = p_id and a.editorial_status = 'published'
    and a.published_at is not null and a.published_at <= now()
  limit 1;
$$;

revoke all on function public.public_article_reading(uuid,text) from public;
grant execute on function public.public_article_reading(uuid,text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
