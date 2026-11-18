# WRLDLINE Cloudflare Jobs

This Worker moves the scheduling and buffering of the existing WRLDLINE news jobs to Cloudflare Queues. Supabase Edge Functions remain the execution layer and PostgreSQL remains the source of truth.

## Live recovery status — verified 18 November 2026, 17:40 UTC

This section is the current production snapshot. Older dated snapshots below are retained as history and must not be treated as current configuration.

- Deployed Worker: version 13, deployment `7d49ad4f-0c6c-4e24-b577-1b0875b6d23a`, 100% traffic. It has the global fail-closed producer switch, stale-message guard, no-write auth probes, and provider healthcheck routing. The independent per-pipeline producer switches described later are in this review branch but are **not yet deployed**.
- Current Edge Functions: `wrldline-news-ingest` v63, `classify-news-worker` v40, `classify-news` v103, and `ai-provider-healthcheck` v62.
- General queue: delivery paused, backlog 0. RSS collection is not running; the last successful general ingestion run fetched 80/80 sources and parsed 1,718 items at 16:51:43–16:51:51 UTC. No feed was fetched in the preceding 30 minutes at this snapshot.
- Classification queue: delivery enabled, backlog 0, one serialized consumer with batch size 1 and max concurrency 1. The worker claims one article per invocation to avoid request timeouts. At 17:39:46 UTC, the last-hour article statuses were 15 classified, 4 needs-review, 0 pending, 0 processing, and 0 failed.
- Breaking queue: paused, backlog 720. Translation queue: paused, backlog 288. Dead-letter queue: 1,429 messages and no consumer. Do not unpause these as part of a General-only recovery.
- All six WRLDLINE support `pg_cron` jobs remain inactive. Do not reactivate them until each task has one verified scheduler and its endpoint/auth checks pass.
- The global producer switch is fail-closed. No producer schedule is currently enabled in production. The current source branch adds independent `WRLDLINE_GENERAL_PRODUCER_ENABLED`, `WRLDLINE_BREAKING_PRODUCER_ENABLED`, `WRLDLINE_CLASSIFICATION_PRODUCER_ENABLED`, and `WRLDLINE_TRANSLATION_PRODUCER_ENABLED` switches; each is opt-in and missing values pause that pipeline.
- Provider diagnostics (small structured-output tests): Gemini, Groq, NVIDIA, and Bazaarlink passed; OpenRouter failed; Gonka returned 401; Firecrawl returned 402 because credits were exhausted. Provider preflight is not proof of every article-level request. The deployed classifier was aligned with the passing Groq/NVIDIA request formats and uses a one-article worker batch.

### General-only recovery sequence

1. Deploy the reviewed per-pipeline switch Worker with every producer switch false.
2. Unpause only `wrldline-news-general` and send one fresh `general` message. Confirm a completed `news_ingestion_runs` row, current source counts, and no unexpected queue retries.
3. Only after that canary succeeds, deploy/configure `WRLDLINE_GENERAL_PRODUCER_ENABLED=true`; keep the global switch false and the Breaking, Classification, and Translation producer switches false.
4. Confirm a subsequent scheduled General run succeeds. Keep Breaking and Translation paused, leave the DLQ untouched, and leave all six pg_cron jobs inactive.
5. Stop and roll back the General producer switch if ingestion errors, retry counts, or queue backlog rise unexpectedly.


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


## Safer backlog drain and cron authentication probe

The current review-branch Worker adds two recovery safeguards:

- Periodic queue messages older than **15 minutes** are acknowledged and logged as `stale_schedule_message_skipped`; messages with missing/invalid `scheduled_at` are acknowledged as invalid. These are scheduler envelopes only, not article records. Fresh producers remain disabled unless `WRLDLINE_PRODUCERS_ENABLED=true`.
- A one-off `{task:"auth-check", scheduled_at:"..."}` message is accepted only on `wrldline-news-general` and invokes `wrldline-news-ingest` with `{mode:"auth-check"}`. That mode performs the Vault-backed cron-secret check and returns before ingestion or writes.

The new unit tests assert no Supabase fetch occurs for stale/malformed messages and that the probe uses the publishable `apikey` plus `x-wrldline-cron-secret` header, without an Authorization Bearer key. This is a test-only guarantee until the reviewed Worker and Edge Function are deployed.

## Latest candidate — version 9 (uploaded, not deployed)

Cloudflare accepted release candidate version **9** (`7f219072-952d-4fa0-9088-956de7ef31ce`) at 2026-11-18 16:44:05 UTC. It includes the fail-closed producer switch, stale-tick guard, no-write auth probe, and message-ID logging. The API confirmed the four queue bindings, publishable API key binding and Cron secret binding were retained. The deployed Worker remains version 7 at 100% traffic; version 9 receives no traffic.

Do not deploy or shift traffic until an operator approves the production step. Once deployed, keep producers disabled; the General queue auth probe requires a separately approved single-queue unpause and one manual test message.

## Latest read-only queue snapshot — 2026-11-18 16:44:32 UTC

| Queue | Delivery paused | Backlog | Oldest message (UTC) |
|---|---:|---:|---|
| general | yes | 511 | 2026-11-17 19:15:35 |
| breaking | yes | 748 | 2026-11-17 14:24:38 |
| classification | yes | 1,496 | 2026-11-16 15:01:15 |
| translation | yes | 289 | 2026-11-17 15:05:33 |
| dead-letter | no consumer | 1,429 | 2026-11-15 14:23:23 |

All four main queues remain paused. Total backlog is 4,473 messages. The recent `peek` sample contained scheduled task envelopes only; it did not contain article payloads. No message was replayed or purged.
