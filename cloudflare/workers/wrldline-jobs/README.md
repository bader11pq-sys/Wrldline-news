# WRLDLINE Cloudflare Jobs

This Worker moves the scheduling and buffering of the existing WRLDLINE news jobs to Cloudflare Queues. Supabase Edge Functions remain the execution layer and PostgreSQL remains the source of truth.

## Queues

| Queue | Supabase function | Payload | Intended schedule |
|---|---|---|---|
| `wrldline-news-general` | **Paused** | Legacy RSS ingestion disabled | Disabled |
| `wrldline-news-breaking` | **Paused** | Legacy RSS ingestion disabled | Disabled |
| `wrldline-news-classification` | `classify-news-worker` | `{}` | Every minute |
| `wrldline-news-translation` | `wrldline-news-ingest` | `{ "mode": "translation" }` | Every 5 minutes |

All queues use one consumer at a time, batch size 1, three retries, 30-second base retry delay, and the shared `wrldline-jobs-dead-letter` queue.

## Required Worker secrets

Set these in Cloudflare Dashboard → Workers & Pages → `wrldline-jobs` → Settings → Variables and Secrets → Add secret:

- `WRLDLINE_CRON_SECRET`: copy the value of the existing Supabase Vault secret `wrldline_news_cron_secret_20261113`.

The publishable API key is already configured as a non-secret Worker binding because it is a public client key. Never use a Supabase service-role or secret key in this Worker. Do not put the cron secret in this repository or in frontend code.

## Production cutover record

The production system was updated on 21 November 2026 to permanently stop legacy RSS ingestion. Do not re-enable the general or breaking queues.

- `wrldline-jobs` has only two active Cron Triggers: `* * * * *` (classification) and `*/5 * * * *` (translation draft generation). The `*/2` breaking and `*/3` general triggers were removed.
- The classification and translation queues remain enabled. Delivery for `wrldline-news-general` and `wrldline-news-breaking` is paused, and their queue mappings were removed from the Worker so legacy messages cannot invoke the RSS ingestion function.
- The `WRLDLINE_CRON_SECRET` secret binding and `SUPABASE_PUBLISHABLE_KEY` binding are present on the Worker. The secret value must never be put in this repository or exposed to a browser.
- Cloudflare-to-Supabase requests continue only for supported classification and translation work. General and breaking ingestion are rejected by the Edge Function with HTTP 410 and are no longer scheduled or consumed.
- The duplicate Supabase Cron classifier job was removed after Cloudflare classification calls were confirmed. Other jobs, including NewsData sync, are outside this Worker. Check the actual scheduler inventory before declaring them active or adding another instance.

To audit the live schedule, inspect the Worker Cron Triggers and queue delivery settings, then compare with `cron.job`. Never re-enable the general or breaking queues while RSS ingestion remains disabled.

## Safety

- The Worker never stores article data or replaces Supabase.
- It only calls the existing authenticated internal Edge Function endpoints.
- Queue delivery is at-least-once; consumers are serialized per queue and use the existing ingestion upsert and translation worker lock.
- Failed jobs are retried and then routed to the shared dead-letter queue.
- The /health route returns only service and queue names.
