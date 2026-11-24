-- Defense in depth: anon/authenticated never need TRUNCATE, TRIGGER, REFERENCES or MAINTAIN
-- on application tables. TRUNCATE bypasses RLS; the others allow DDL-adjacent side effects.
-- Row-level SELECT/INSERT/UPDATE/DELETE grants (governed by RLS) are NOT changed here.
-- Rollback: docs/security/db-privilege-hardening-2026-11-24.md
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLE %s FROM anon, authenticated', r.tbl);
  END LOOP;
END $$;

-- Future tables must not inherit the same grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLES FROM anon, authenticated;

-- Internal lock table: fail closed (no client policy; owner/service paths unaffected).
ALTER TABLE IF EXISTS private.breaking_monitor_lock ENABLE ROW LEVEL SECURITY;

-- Missing FK-covering indexes (tables are empty or tiny at audit time, so a plain build is safe).
CREATE INDEX IF NOT EXISTS article_translations_reviewed_by_idx ON public.article_translations (reviewed_by);
CREATE INDEX IF NOT EXISTS notification_deliveries_article_id_idx ON public.notification_deliveries (article_id);
CREATE INDEX IF NOT EXISTS notification_deliveries_newsletter_id_idx ON public.notification_deliveries (newsletter_id);
CREATE INDEX IF NOT EXISTS notification_deliveries_push_subscription_id_idx ON public.notification_deliveries (push_subscription_id);
