-- WRLDLINE source contract guard
-- 2026-11-14
--
-- Older clients (the deployed Edge Function, cached GitHub Actions runners)
-- may still send category='world', country='غير محدد'/'دولي', or infer the
-- language from the headline. This trigger is a database-level safety net.
-- It does not override an explicit AI decision: the category fallback only
-- applies on INSERT or while the article is still pending.

begin;

create or replace function public.enforce_article_source_contract()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  feed_category text;
  feed_lang text;
  feed_scope text;
begin
  select f.category, f.lang, f.source_scope
    into feed_category, feed_lang, feed_scope
  from public.feeds f
  where (new.feed_id is not null and f.id = new.feed_id)
     or f.url = new.source_url
     or f.name = new.source_name
  order by
    (new.feed_id is not null and f.id = new.feed_id) desc nulls last,
    (f.url = new.source_url) desc nulls last
  limit 1;

  -- A general feed must not become "world" just because the old parser
  -- defaulted to it. A specific section wins. AI decisions are preserved.
  if new.category = 'world'
     and feed_category is not null
     and feed_category <> 'world'
     and (tg_op = 'INSERT' or new.ai_classification_status = 'pending') then
    new.category := feed_category;
  end if;

  -- The publisher's declared language is authoritative. The old parser
  -- inferred it from the headline; replace that inference on INSERT.
  if tg_op = 'INSERT'
     and feed_lang in ('ar','en')
     and (new.source_language is null or new.source_language = '' or new.language_detection in ('detected','unknown','legacy')) then
    new.source_language := feed_lang;
    new.lang := feed_lang;
    new.language_detection := 'declared';
  end if;

  -- Source scope is a publisher attribute. Fill it when the client omitted it.
  if tg_op = 'INSERT'
     and new.source_scope = 'unknown'
     and feed_scope in ('local','national','regional','international','cross-border') then
    new.source_scope := feed_scope;
  end if;

  -- Pseudo-countries are never event countries.
  if new.country in ('دولي','غير محدد') then
    new.country := null;
  end if;
  if new.country = 'دولي' and new.source_scope = 'unknown' then
    new.source_scope := 'international';
  end if;
  if new.event_country in ('دولي','غير محدد') then
    new.event_country := null;
  end if;
  if new.source_country in ('دولي','غير محدد') then
    new.source_country := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_article_source_contract on public.articles;
create trigger trg_enforce_article_source_contract
before insert or update of category, country, event_country, source_country, source_language, source_scope
on public.articles
for each row execute function public.enforce_article_source_contract();

commit;
