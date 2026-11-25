-- Rollback for 20261126010000_personalized_feed.sql.
-- Topic/interest follows are removed so the original CHECK constraint can be restored.
begin;
drop trigger if exists user_preferences_wipe_history on public.user_preferences;
drop function if exists public.wipe_history_when_consent_withdrawn();
drop function if exists public.clear_reading_history();
drop function if exists public.record_article_read(uuid);
drop table if exists public.user_reading_history;
alter table public.user_preferences drop column if exists personalize_from_history;
drop trigger if exists user_follows_limit on public.user_follows;
drop function if exists public.enforce_user_follow_limit();
delete from public.user_follows where target_type in ('topic','interest');
alter table public.user_follows drop constraint if exists user_follows_target_type_check;
alter table public.user_follows
  add constraint user_follows_target_type_check check (target_type in ('category','country'));
commit;
