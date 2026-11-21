-- Correct NewsData records that were marked classified by ingestion
-- without ever receiving AI output. The AI window is one hour; keep their
-- published articles intact and mark only their AI work as expired.
BEGIN;

UPDATE public.articles
SET
  ai_classification_status = 'expired',
  classification_claimed_at = NULL,
  classification_retry_after = NULL,
  classification_last_error = 'Not AI-classified: source publication time was outside the one-hour classification window at ingestion.'
WHERE newsdata_article_id IS NOT NULL
  AND received_at >= now() - interval '48 hours'
  AND published_at < now() - interval '1 hour'
  AND ai_classification_status = 'classified'
  AND ai_country_code IS NULL
  AND ai_confidence IS NULL
  AND ai_summary IS NULL
  AND ai_risk_level = 'unknown';

COMMIT;
