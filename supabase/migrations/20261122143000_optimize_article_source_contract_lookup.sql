-- Optimize source lookup performed by enforce_article_source_contract on article inserts.
-- Keep feed resolution priority: feed_id, then source_url, then source_name.

create index if not exists feeds_name_idx on public.feeds (name);

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
  if new.feed_id is not null then
    select f.category, f.lang, f.source_scope
      into feed_category, feed_lang, feed_scope
    from public.feeds f
    where f.id = new.feed_id;
  end if;

  if not found and new.source_url is not null then
    select f.category, f.lang, f.source_scope
      into feed_category, feed_lang, feed_scope
    from public.feeds f
    where f.url = new.source_url;
  end if;

  if not found and new.source_name is not null then
    select f.category, f.lang, f.source_scope
      into feed_category, feed_lang, feed_scope
    from public.feeds f
    where f.name = new.source_name
    limit 1;
  end if;

  if new.category = 'world'
     and feed_category is not null
     and feed_category <> 'world'
     and (tg_op = 'INSERT' or new.ai_classification_status = 'pending') then
    new.category := feed_category;
  end if;

  if tg_op = 'INSERT'
     and feed_lang in ('ar','en')
     and (new.source_language is null or new.source_language = '' or new.language_detection in ('detected','unknown','legacy')) then
    new.source_language := feed_lang;
    new.lang := feed_lang;
    new.language_detection := 'declared';
  end if;

  if tg_op = 'INSERT'
     and new.source_scope = 'unknown'
     and feed_scope in ('local','national','regional','international','cross-border') then
    new.source_scope := feed_scope;
  end if;

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
