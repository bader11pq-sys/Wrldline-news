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

- Deployed Worker: `wrldline-jobs` version 7, 100% traffic, deployed 2026-11-15 03:46:52 UTC. The four Cron Triggers remain configured: every minute (classification), every 2 minutes (breaking), every 3 minutes (general), every 5 minutes (translation). Cloudflare telemetry observed successful scheduled invocations through 2026-11-18 15:26:16 UTC.
- Main queue delivery: all four consumers currently have `delivery_paused=true`. Their consumer configuration remains serialized (batch size 1, max concurrency 1, three retries, 30-second base retry delay). Do not unpause all four together.
- Fresh queue snapshot at 2026-11-18 15:26:23 UTC: general 511, breaking 745, classification 1,504, translation 292, and DLQ 1,429 (4,481 total). The four main queues contain 3,052 messages. The DLQ has no consumer.
- Six support `pg_cron` jobs are inactive: NewsData sync, notification dispatch, source freshness, audience retention, security counters, and daily global briefing. PostgreSQL audit logs show an explicit administrative statement called `cron.alter_job(..., active=false)` for all six on 2026-11-17 15:39:15.901 UTC. The record does not identify the human operator or reason.
- Because the Cloudflare producer schedules remain active while main queue delivery is paused, new scheduled messages can continue to accumulate. The nominal schedule rate is about 122 messages/hour, before retries. Supabase reports 8,756 classification items pending: 8,609 (98.3%) were published within the last seven days, while 103 are older than 30 days. Prioritize the recent feed under low concurrency; separately review older items without bulk-deleting them.

### Producer pause switch in the review branch

The current source in this branch uses a fail-closed, explicit opt-in:

- Set `WRLDLINE_PRODUCERS_ENABLED=true` only after the queue consumers, Supabase verifier, and backlog recovery checks pass.
- If the variable is absent or set to anything other than `true`, the scheduled handler returns before enqueueing any message and records a `producers_paused` event.
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


## Read-only recheck — 2026-11-18 16:24:09 UTC

A second, later Cloudflare API read confirms the four main queues are still paused and the DLQ still has no consumer:

| Queue | Delivery paused | Backlog | Oldest message (UTC) |
|---|---:|---:|---|
| general | yes | 509 | 2026-11-17 11:27:35 |
| breaking | yes | 748 | 2026-11-17 13:56:38 |
| classification | yes | 1,487 | 2026-11-16 15:11:15 |
| translation | yes | 300 | 2026-11-18 09:55:32 |
| dead-letter | no consumer | 1,429 | 2026-11-15 13:59:51 |

Total: **4,473 messages** (3,044 in the main queues and 1,429 in DLQ). The four Worker Cron schedules are still configured. The deployed version remains the pre-guard Worker version, so the branch's `WRLDLINE_PRODUCERS_ENABLED` fail-closed guard is not active in production. Do not assume setting that variable alone can pause version 7.

No queue delivery was resumed, no Cron schedule was changed, and no DLQ message was replayed during this read-only recheck. The PR branch now also includes a reviewed Supabase service-key compatibility helper; it is not deployed. New `sb_secret_...` keys must use `apikey` only, with no Authorization Bearer copy. Legacy `service_role` keys remain supported during the migration window. Do not rotate or deactivate keys as part of queue recovery.



## Worker release candidate — not deployed

Cloudflare version upload created **version 8** (`6db110f6-27e4-436d-be87-58f61db5d536`) at 2026-11-18 16:38:53 UTC. It contains the fail-closed producer switch and message-ID logging from this branch. Cloudflare confirmed the queue bindings, publishable-key binding, and existing `WRLDLINE_CRON_SECRET` binding were retained.

The deployed version remains **version 7** at 100% traffic. Version 8 is an uploaded candidate only: it has not been deployed and receives no production traffic. The switch is intentionally fail-closed: without `WRLDLINE_PRODUCERS_ENABLED=true`, scheduled invocations do not enqueue new messages. Do not set it to `true` until consumer recovery is explicitly approved and validated.

## Separate urgent-source and SMS pipeline

The GitHub Actions workflow `.github/workflows/breaking.yml` remains a dedicated scheduled path (every five minutes) in addition to the Cloudflare queue system. It runs `bot-breaking.js` against the 20 Arabic urgent-source monitors in the canonical catalog, upserts recent urgent articles, then calls `telnyx-gateway` to dispatch opted-in SMS. This is not the same operation as the Cloudflare breaking queue consumer, which scans already-ingested articles and flags urgent titles but does not send SMS.

Do not remove the GitHub schedule until the dedicated urgent-source collection and SMS delivery are replaced and tested. The current Telnyx sender claims an article by setting `sms_notification_sent_at` before contacting the provider; provider failures may therefore leave an article marked as sent without a retry. A future queue-based SMS migration needs per-recipient idempotency and retry-safe delivery state.

