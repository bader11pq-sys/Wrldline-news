# Database privilege hardening — 24 Nov 2026

Migration: `supabase/migrations/20261124090000_revoke_client_table_admin_privileges.sql`

## Pre-change snapshot (relacl, read from production before the change)
Tables where anon and/or authenticated held TRUNCATE/TRIGGER/REFERENCES/MAINTAIN:
article_translations, articles, contact_messages, daily_news_briefings, feeds, news_ingestion_runs,
newsletter_subscribers, profiles, source_policy, subscriptions, telegram_breaking_translations,
user_follows, user_phone_verifications, user_preferences, user_saved_articles, user_sms_preferences.
Effective grants were `Dxtm` (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) in addition to row DML.
RLS governs row DML; TRUNCATE is not governed by RLS.

## Rollback (not recommended; restores the weaker posture)
```sql
GRANT TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLE
  public.article_translations, public.articles, public.contact_messages, public.daily_news_briefings,
  public.feeds, public.news_ingestion_runs, public.newsletter_subscribers, public.profiles,
  public.source_policy, public.subscriptions, public.telegram_breaking_translations,
  public.user_follows, public.user_phone_verifications, public.user_preferences,
  public.user_saved_articles, public.user_sms_preferences TO authenticated;
-- anon had the same set on all of the above except daily_news_briefings and user_preferences.
ALTER TABLE private.breaking_monitor_lock DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS public.article_translations_reviewed_by_idx,
  public.notification_deliveries_article_id_idx, public.notification_deliveries_newsletter_id_idx,
  public.notification_deliveries_push_subscription_id_idx;
```
