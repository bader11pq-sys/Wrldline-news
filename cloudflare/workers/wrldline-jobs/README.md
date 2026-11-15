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

- `SUPABASE_PUBLISHABLE_KEY`: copy the value of the existing Supabase Vault secret `wrldline_news_publishable_key_20261113`.
- `WRLDLINE_CRON_SECRET`: copy the value of the existing Supabase Vault secret `wrldline_news_cron_secret_20261113`.

Do not put either value in this repository or in frontend code.

## Activation order

1. Add the two secrets above.
2. Enable these Cron Triggers on the Worker:
   - `* * * * *`
   - `*/2 * * * *`
   - `*/3 * * * *`
   - `*/5 * * * *`
3. Confirm queue messages are consumed and Supabase functions return successful responses.
4. Only after successful verification, unschedule Supabase Cron jobs `wrldline-general-ingestion`, `wrldline-breaking-ingestion`, and `wrldline-ai-classification-worker` (job IDs 1, 2, and 8 at the time of rollout). Do not remove other Cron jobs.
5. Translation currently has no active row in `cron.job`; the 5-minute Cloudflare trigger activates the existing `translation` mode after verification.

## Safety

- The Worker never stores article data or replaces Supabase.
- It only calls the existing authenticated internal Edge Function endpoints.
- Queue delivery is at-least-once; consumers are serialized per queue and use the existing ingestion upsert and translation worker lock.
- Failed jobs are retried and then routed to the shared dead-letter queue.
- The /health route returns only service and queue names.
