-- WRLDLINE personal library, followed topics and editorial workflow
create table if not exists public.user_saved_articles (
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, article_id)
);
create index if not exists user_saved_articles_article_idx on public.user_saved_articles(article_id);

create table if not exists public.user_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('category','country')),
  target_value text not null check (length(btrim(target_value)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_value)
);
create index if not exists user_follows_user_type_idx on public.user_follows(user_id, target_type);

alter table public.user_saved_articles enable row level security;
alter table public.user_follows enable row level security;
grant select, insert, delete on public.user_saved_articles to authenticated;
grant select, insert, delete on public.user_follows to authenticated;

drop policy if exists "Users read own saved articles" on public.user_saved_articles;
create policy "Users read own saved articles" on public.user_saved_articles
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users save own articles" on public.user_saved_articles;
create policy "Users save own articles" on public.user_saved_articles
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users remove own saved articles" on public.user_saved_articles;
create policy "Users remove own saved articles" on public.user_saved_articles
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users read own follows" on public.user_follows;
create policy "Users read own follows" on public.user_follows
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users create own follows" on public.user_follows;
create policy "Users create own follows" on public.user_follows
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users remove own follows" on public.user_follows;
create policy "Users remove own follows" on public.user_follows
  for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.articles
  add column if not exists editorial_status text not null default 'published'
  check (editorial_status in ('draft','review','published','rejected'));

-- Public ingestion bots use the publishable key for INSERT only. Editorial changes
-- require a trusted app_metadata role; never trust user-editable user_metadata.
drop policy if exists "public read articles" on public.articles;
drop policy if exists "Enable insert for all" on public.articles;
drop policy if exists "Allow anon update" on public.articles;
drop policy if exists "Allow anon delete" on public.articles;
create policy "Public read published articles" on public.articles
  for select to anon, authenticated using (editorial_status = 'published');
create policy "Editors read all articles" on public.articles
  for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('editor','admin'));
create policy "News bots insert published articles" on public.articles
  for insert to anon with check (editorial_status = 'published');
create policy "Editors insert articles" on public.articles
  for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('editor','admin'));
create policy "Editors update articles" on public.articles
  for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('editor','admin'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('editor','admin'));
create policy "Editors delete articles" on public.articles
  for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('editor','admin'));

drop policy if exists "public read translations" on public.article_translations;
drop policy if exists "Allow insert translations" on public.article_translations;
drop policy if exists "Allow update translations" on public.article_translations;
create policy "Public read published translations" on public.article_translations
  for select to anon, authenticated
  using (exists (select 1 from public.articles a where a.id = article_id and a.editorial_status = 'published'));
create policy "Editors read all translations" on public.article_translations
  for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('editor','admin'));
create policy "Translation bot inserts translations" on public.article_translations
  for insert to anon
  with check (exists (select 1 from public.articles a where a.id = article_id and a.editorial_status = 'published'));
create policy "Editors insert translations" on public.article_translations
  for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('editor','admin'));
create policy "Editors update translations" on public.article_translations
  for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('editor','admin'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('editor','admin'));
