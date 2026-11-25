-- Personalised feed: topic/interest follows, opt-in reading history, per-user limits.
-- Reuses user_follows, user_saved_articles and user_preferences (no duplicate systems).
-- Privacy: reading history is stored only after the reader opts in
-- (user_preferences.personalize_from_history) and holds article id + timestamps only.
-- Rollback: supabase/rollbacks/20261126010000_personalized_feed.down.sql
begin;

-- 1. Follow targets: add curated topics and free-text interests.
alter table public.user_follows drop constraint if exists user_follows_target_type_check;
alter table public.user_follows
  add constraint user_follows_target_type_check
  check (target_type in ('category','country','topic','interest'));

-- 2. Abuse limit: at most 200 follows per reader.
create or replace function public.enforce_user_follow_limit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.user_follows where user_id = new.user_id) >= 200 then
    raise exception 'follow limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists user_follows_limit on public.user_follows;
create trigger user_follows_limit before insert on public.user_follows
  for each row execute function public.enforce_user_follow_limit();

-- 3. Consent flag (default OFF): whether reading history is recorded and used for ranking.
alter table public.user_preferences
  add column if not exists personalize_from_history boolean not null default false;

-- 4. Reading history.
create table if not exists public.user_reading_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  first_read_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  read_count integer not null default 1 check (read_count between 1 and 1000),
  primary key (user_id, article_id)
);
create index if not exists user_reading_history_recent_idx on public.user_reading_history(user_id, last_read_at desc);
create index if not exists user_reading_history_article_idx on public.user_reading_history(article_id);

alter table public.user_reading_history enable row level security;
revoke all on public.user_reading_history from anon, public;
grant select, delete on public.user_reading_history to authenticated;

drop policy if exists "Users read own reading history" on public.user_reading_history;
create policy "Users read own reading history" on public.user_reading_history
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users delete own reading history" on public.user_reading_history;
create policy "Users delete own reading history" on public.user_reading_history
  for delete to authenticated using ((select auth.uid()) = user_id);
-- No INSERT/UPDATE policy: writes go through record_article_read(), which enforces consent.

-- 5. Consent-enforcing writer with a hard cap of 500 remembered articles per reader.
create or replace function public.record_article_read(p_article_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_enabled boolean;
begin
  if v_user is null then return false; end if;
  select personalize_from_history into v_enabled from public.user_preferences where user_id = v_user;
  if coalesce(v_enabled, false) is not true then return false; end if;
  if not exists (select 1 from public.articles a where a.id = p_article_id and a.editorial_status = 'published') then
    return false;
  end if;
  insert into public.user_reading_history (user_id, article_id)
  values (v_user, p_article_id)
  on conflict (user_id, article_id) do update
    set last_read_at = now(), read_count = least(public.user_reading_history.read_count + 1, 1000);
  delete from public.user_reading_history h
   where h.user_id = v_user
     and h.article_id in (select article_id from public.user_reading_history
                           where user_id = v_user order by last_read_at desc offset 500);
  return true;
end;
$$;

create or replace function public.clear_reading_history()
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.user_reading_history where user_id = (select auth.uid());
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.record_article_read(uuid) from public, anon;
revoke all on function public.clear_reading_history() from public, anon;
grant execute on function public.record_article_read(uuid) to authenticated;
grant execute on function public.clear_reading_history() to authenticated;

-- 6. Turning the consent flag off wipes what was remembered.
create or replace function public.wipe_history_when_consent_withdrawn()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.personalize_from_history is true and new.personalize_from_history is false then
    delete from public.user_reading_history where user_id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function public.wipe_history_when_consent_withdrawn() from public, anon, authenticated;
drop trigger if exists user_preferences_wipe_history on public.user_preferences;
create trigger user_preferences_wipe_history after update of personalize_from_history on public.user_preferences
  for each row execute function public.wipe_history_when_consent_withdrawn();

commit;
