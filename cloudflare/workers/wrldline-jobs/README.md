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

## Current production state — verified 18 November 2026

The Worker deployment and the queue consumers are in different states. Do not infer consumer health from the existence of Cron Triggers.

- Deployed Worker: `wrldline-jobs` version 7, 100% traffic, deployed 2026-11-15 03:46:52 UTC. The four Cron Triggers remain configured: every minute (classification), every 2 minutes (breaking), every 3 minutes (general), every 5 minutes (translation). Cloudflare observed successful scheduled invocations through 2026-11-18 14:56:38 UTC.
- Main queue delivery: all four consumers currently have `delivery_paused=true`. Their consumer configuration remains serialized (batch size 1, max concurrency 1, three retries, 30-second base retry delay). Do not unpause all four together.
- Fresh queue snapshot at 2026-11-18 15:13:46 UTC: general 513, breaking 756, classification 1,496, translation 289, and DLQ 1,429 (4,483 total). The four main queues contain 3,054 messages. The DLQ has no consumer.
- Six support `pg_cron` jobs are inactive: NewsData sync, notification dispatch, source freshness, audience retention, security counters, and daily global briefing. PostgreSQL audit logs show an explicit administrative statement called `cron.alter_job(..., active=false)` for all six on 2026-11-17 15:39:15.901 UTC. The record does not identify the human operator or reason.
- Because the Cloudflare producer schedules remain active while main queue delivery is paused, new scheduled messages can continue to accumulate. The nominal schedule rate is about 122 messages/hour, before retries.

### Producer pause switch in the review branch

The current source in this branch supports an optional non-secret Worker variable:

- Set `WRLDLINE_PRODUCERS_ENABLED=false` to make the scheduled handler return before enqueueing any message.
- If the variable is absent, scheduling remains enabled for backwards compatibility.
- The deployed v7 Worker does **not** contain this code yet and does not read this variable. Setting the variable against v7 alone will not stop producers.
- This switch is not configured in production. It becomes usable only after the reviewed Worker code is deployed. Do not upload or deploy this branch merely to set the variable.

### Required recovery sequence

1. Resolve the Supabase 503/504 verifier outage and validate the cron secret against Vault without displaying either value.
2. Review DLQ samples/export and message eligibility; do not bulk replay.
3. Review and deploy the message-ID logging and producer-switch change.
4. With an authorized operator decision, pause producers before draining old backlogs; monitor each queue independently.
5. Unpause one queue at a time at low concurrency, confirm its handler and backlog trend, and only then restore its producer schedule.
6. Restore NewsData and notification support jobs after auth and endpoint smoke tests. Choose exactly one source-freshness scheduler and prevent duplicate pg_cron/Cloudflare/GitHub scheduling.

The November 18 queue metrics are point-in-time evidence, not a promise that the backlog will remain constant. Re-read queue metrics immediately before every recovery action.

## Safety

- The Worker never stores article data or replaces Supabase.
- It only calls the existing authenticated internal Edge Function endpoints.
- Queue delivery is at-least-once; consumers are serialized per queue and use the existing ingestion upsert and translation worker lock.
- Failed jobs are retried and then routed to the shared dead-letter queue.
- The /health route returns only service and queue names.
