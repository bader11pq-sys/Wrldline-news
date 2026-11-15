# WRLDLINE Cloudflare Jobs

This Worker moves the scheduling and buffering of the existing WRLDLINE news jobs to Cloudflare Queues. Supabase Edge Functions remain the execution layer and PostgreSQL remains the source of truth.

## Queues

| Queue | Supabase function | Payload | Intended schedule |
|---|---|---|---|
| `wrldline-news-general` | `wrldline-news-ingest` | `{ "mode": "general" }` | Every 3 minutes |
| `wrldline-news-breaking` | `wrldline-news-ingest` | `{ "mode": "breaking" }` | Every 2 minutes |
| `wrldline-news-classification` | `classify-news-worker` | `{}` | Every minute |
| `wrldline-news-translation` | `wrldline-news-ingest` | `{ "mode": "translation" }` | Every 5 minutes |

All queues use one consumer at a time, batch size 1, three retries, 30-second base retry delay, and the shared `wrldline-jobs-dead-letter` queue.

## Required Worker secrets

Set these in Cloudflare Dashboard → Workers & Pages → `wrldline-jobs` → Settings → Variables and Secrets → Add secret:

- `WRLDLINE_CRON_SECRET`: copy the value of the existing Supabase Vault secret `wrldline_news_cron_secret_20261113`.

The publishable API key is already configured as a non-secret Worker binding because it is a public client key. Never use a Supabase service-role or secret key in this Worker. Do not put the cron secret in this repository or in frontend code.

## Production cutover status — verified 15 November 2026

The Cloudflare cutover is already active in production; do not repeat it or enable duplicate Supabase schedules.

- `wrldline-jobs` has four active Cron Triggers: `* * * * *` (classification), `*/2 * * * *` (breaking), `*/3 * * * *` (general ingestion), and `*/5 * * * *` (translation draft generation).
- All four queues have a single serialized consumer using `wrldline-jobs`; the dead-letter queue is configured. Queue metrics were checked and showed no sustained backlog; short-lived one-message backlogs can appear between scheduled triggers and consumers.
- The `WRLDLINE_CRON_SECRET` secret binding and `SUPABASE_PUBLISHABLE_KEY` binding are present on the Worker. The secret value must never be put in this repository or exposed to a browser.
- Cloudflare-to-Supabase requests were observed successfully for `wrldline-news-ingest` and `classify-news-worker` (HTTP 200). Ingestion summaries reported successful general/breaking runs, and the translation mode generated review drafts.
- The duplicate Supabase Cron classifier job was removed after Cloudflare classification calls were confirmed. The remaining Supabase Cron jobs are support tasks only: audience retention, daily global briefing, NewsData sync, notification dispatch, security counter retention, and source freshness. Do not remove these without a separate review.

To audit the live schedule, inspect the Worker Cron Triggers and each queue consumer, then compare with `cron.job`. Never run the same ingestion/classification/translation schedule in both Cloudflare and Supabase Cron at the same time.

## Safety

- The Worker never stores article data or replaces Supabase.
- It only calls the existing authenticated internal Edge Function endpoints.
- Queue delivery is at-least-once; consumers are serialized per queue and use the existing ingestion upsert and translation worker lock.
- Failed jobs are retried and then routed to the shared dead-letter queue.
- The /health route returns only service and queue names.
