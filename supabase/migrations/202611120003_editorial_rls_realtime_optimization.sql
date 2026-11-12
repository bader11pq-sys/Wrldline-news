-- Consolidate authenticated read policies and avoid per-row JWT evaluation.
drop policy if exists "Editors read all articles" on public.articles;
drop policy if exists "Public read published articles" on public.articles;
create policy "Authenticated read published or editorial articles" on public.articles
  for select to authenticated
  using (
    editorial_status = 'published'
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin')
  );
create policy "Public read published articles" on public.articles
  for select to anon using (editorial_status = 'published');

drop policy if exists "Editors insert articles" on public.articles;
create policy "Editors insert articles" on public.articles
  for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin'));
drop policy if exists "Editors update articles" on public.articles;
create policy "Editors update articles" on public.articles
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin'))
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin'));
drop policy if exists "Editors delete articles" on public.articles;
create policy "Editors delete articles" on public.articles
  for delete to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin'));

drop policy if exists "Editors read all translations" on public.article_translations;
drop policy if exists "Public read published translations" on public.article_translations;
create policy "Authenticated read published or editorial translations" on public.article_translations
  for select to authenticated
  using (
    exists (select 1 from public.articles a where a.id = article_id and a.editorial_status = 'published')
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin')
  );
create policy "Public read published translations" on public.article_translations
  for select to anon
  using (exists (select 1 from public.articles a where a.id = article_id and a.editorial_status = 'published'));

drop policy if exists "Editors insert translations" on public.article_translations;
create policy "Editors insert translations" on public.article_translations
  for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin'));
drop policy if exists "Editors update translations" on public.article_translations;
create policy "Editors update translations" on public.article_translations
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin'))
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin'));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_saved_articles') then
    alter publication supabase_realtime add table public.user_saved_articles;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_follows') then
    alter publication supabase_realtime add table public.user_follows;
  end if;
end $$;
