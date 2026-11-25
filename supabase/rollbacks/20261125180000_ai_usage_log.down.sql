-- Rollback for 20261125180000_ai_usage_log.sql. Drops only objects introduced by that migration.
-- ai_provider_cooldowns is intentionally NOT dropped: it pre-exists in production and is used by live functions.
-- Export first if the usage history matters:  \copy public.ai_usage_log to 'ai_usage_log.csv' csv header
drop function if exists public.ai_usage_prune(interval);
drop view if exists public.ai_usage_daily;
drop table if exists public.ai_usage_log;
