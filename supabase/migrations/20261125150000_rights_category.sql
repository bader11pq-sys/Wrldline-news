-- Allow 'rights' (الحقوق والحريات) as a real article/feed category.
-- Before this, the normalize triggers turned it into 'uncategorized', and
-- site_editor() rejected it, so the rights section stayed empty.
create or replace function public.normalize_article_category_value()
returns trigger language plpgsql set search_path = public as $$
declare value text;
begin
  value := lower(trim(coalesce(new.category, '')));
  if value = '' or value not in ('politics','economy','security','tech','sports','culture','health','science','environment','society','world','rights','uncategorized') then
    value := 'uncategorized';
  end if;
  new.category := value;
  return new;
end; $$;

create or replace function public.normalize_feed_category_value()
returns trigger language plpgsql set search_path = public as $$
declare value text;
begin
  value := lower(trim(coalesce(new.category, '')));
  if value = '' or value not in ('politics','economy','security','tech','sports','culture','health','science','environment','society','world','rights','uncategorized') then
    value := 'uncategorized';
  end if;
  new.category := value;
  return new;
end; $$;

-- Patch the category allow-list inside site_editor() without restating the function.
do $$
declare f record; def text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'site_editor' loop
    def := pg_get_functiondef(f.oid);
    if position('''society'',''uncategorized''' in def) > 0 and position('''rights''' in def) = 0 then
      execute replace(def, '''society'',''uncategorized''', '''society'',''rights'',''uncategorized''');
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
