-- WRLDLINE authenticated newsroom access and personal notification preferences
-- News ingestion remains INSERT-only for the anonymous publishable pipeline.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  followed_categories text[] not null default '{}',
  followed_countries text[] not null default '{}',
  notify_breaking boolean not null default true,
  notify_categories text[] not null default '{}',
  notify_countries text[] not null default '{}',
  browser_notifications boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
grant select, insert, update on public.user_preferences to authenticated;
revoke all on public.user_preferences from anon;

drop policy if exists "Users read own preferences" on public.user_preferences;
create policy "Users read own preferences" on public.user_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users create own preferences" on public.user_preferences;
create policy "Users create own preferences" on public.user_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users update own preferences" on public.user_preferences;
create policy "Users update own preferences" on public.user_preferences
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.set_user_preferences_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists user_preferences_updated_at on public.user_preferences;
create trigger user_preferences_updated_at before update on public.user_preferences
for each row execute procedure public.set_user_preferences_updated_at();

-- A new account starts with sensible breaking-news defaults and no topic filter.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'inactive')
  on conflict (user_id) do nothing;
  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Remove anonymous reads from every dynamic newsroom feed. Anonymous ingestion is
-- deliberately retained below; it does not grant anonymous SELECT access.
drop policy if exists "Public read published articles" on public.articles;
drop policy if exists "Public read published non-Telegram articles" on public.articles;
drop policy if exists "Authenticated read published or editorial articles" on public.articles;
drop policy if exists "Authenticated read published non-Telegram or editorial articles" on public.articles;
create policy "Authenticated read published or editorial articles" on public.articles
  for select to authenticated
  using (
    (editorial_status = 'published'
      and lower(coalesce(url,'') || ' ' || coalesce(source_url,'') || ' ' || coalesce(source_name,'')) !~ '(t\\.me|telegram\\.me|telegram)')
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin')
  );

drop policy if exists "Public read translations" on public.article_translations;
drop policy if exists "Public read published translations" on public.article_translations;
drop policy if exists "Authenticated read published or editorial translations" on public.article_translations;
create policy "Authenticated read published translations" on public.article_translations
  for select to authenticated
  using (
    exists (select 1 from public.articles a where a.id = article_id and a.editorial_status = 'published')
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin')
  );

drop policy if exists "Public read Telegram ticker" on public.telegram_breaking_items;
create policy "Authenticated read Telegram ticker" on public.telegram_breaking_items
  for select to authenticated using (true);

-- Keep the write path used by the ingestion worker and the editor role intact.
grant insert on public.articles to anon;
grant select on public.articles to authenticated;
grant select on public.article_translations to authenticated;
grant select on public.telegram_breaking_items to authenticated;

-- Realtime is used by the open newsroom session to surface matching alerts.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_preferences') then
    alter publication supabase_realtime add table public.user_preferences;
  end if;
end $$;
