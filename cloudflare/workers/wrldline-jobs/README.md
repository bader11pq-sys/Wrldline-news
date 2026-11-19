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


## Latest read-only production and monetization recheck — 2026-11-19 06:18 UTC

This snapshot supersedes the older point-in-time status sections above. It was collected with read-only Supabase SQL, Edge Function log queries, and Cloudflare Queue/Worker GET endpoints. No production queue, Worker, Cron, Edge Function, secret, migration, or database setting was changed.

### Deployed Worker and producer gates

- Cloudflare currently routes 100% of `wrldline-jobs` traffic to **version 15** (deployment created 2026-11-18 17:45:34 UTC).
- All four Cron Triggers remain configured: classification every minute, breaking every 2 minutes, general ingestion every 3 minutes, and translation every 5 minutes. A configured trigger does not mean its producer is enabled.
- The deployed Worker bindings are intentionally fail-closed: `WRLDLINE_PRODUCERS_ENABLED=false`; `WRLDLINE_GENERAL_PRODUCER_ENABLED=true`; `WRLDLINE_BREAKING_PRODUCER_ENABLED=false`; `WRLDLINE_CLASSIFICATION_PRODUCER_ENABLED=false`; `WRLDLINE_TRANSLATION_PRODUCER_ENABLED=false`.
- The deployed Worker source checks the global opt-in OR the individual pipeline opt-in before enqueueing. This is a **General-only recovery**, not a failed classification consumer. The current `main` branch Worker source does not yet contain these guards; this release-readiness branch does. Keep PR #48 open until its code and production evidence are reconciled and reviewed.

### Current Cloudflare Queue metrics

| Queue | Delivery paused | Backlog | Notes |
|---|---:|---:|---|
| `wrldline-news-general` | no | 0 | General producer is enabled |
| `wrldline-news-classification` | no | 0 | Classification producer is disabled |
| `wrldline-news-breaking` | yes | 349 | Producer disabled |
| `wrldline-news-translation` | yes | 144 | Producer disabled |
| `wrldline-jobs-dead-letter` | no consumer | 1,429 | No DLQ consumer |

Total observed queue depth: **1,922 messages**. The classification queue's zero backlog does not mean classification completed: its producer is disabled, while eligible rows remain pending in Supabase. The deployed Worker also acknowledges and skips scheduled queue envelopes older than 15 minutes; do not expect old scheduler ticks to replay useful work. Do not unpause queues or replay DLQ messages as a bulk action.

### RSS and classification state in Supabase

- The canonical RSS set contains **80 active feeds**. At the snapshot, zero active feeds were stale by more than two hours and zero had a current `last_error`; latest feed fetch was 2026-11-19 06:15:50 UTC.
- In the previous 24 hours there were **254 general ingestion runs**, latest finished 06:15:50 UTC; 415,333 parsed items were reported in aggregate. The ingestion-run counters totalled 19,241 successful source attempts and 1,079 failed source attempts (approximately 5.3% of those attempts failed). Mean run time was 14.6 seconds. Continue to monitor source failures even though the current feed rows are fresh.
- The most recent `classify-news-worker` request was 2026-11-18 17:39:29 UTC. The latest `classify-news` request was 17:39:23 UTC. No later classifier invocation appeared in the last-24-hour Edge log aggregation.
- Pending classification rows by receipt age: **149 within 60 minutes**, **4,518 between 1 and 24 hours**, and **7,630 between 1 and 7 days**. The production classifier contract only permits stories published in the previous 60 minutes (with its documented future-clock tolerance). Only the 149 fresh rows are potentially eligible; older rows must be expired/left out of LLM processing, not bulk-replayed.

### NewsData and support schedulers

- The latest `newsdata_fetched_at` across articles was 2026-11-17 11:22:26 UTC; zero rows recorded a NewsData fetch in the last 24 hours.
- All six WRLDLINE support `pg_cron` jobs were inactive at the read: NewsData sync, notification dispatch, source freshness, audience retention, security counters, and daily global briefing. There were no cron job runs in the last 24 hours.
- `notification_runtime.email_enabled=false` and `push_enabled=true`. Newsletter confirmation/sending must remain unavailable until email and its scheduled dispatcher are deliberately restored and tested.

### Commercial and audience baseline

- The deployed `audience-events` Edge Function is active and the table contains 51 collected events; latest received event was 2026-11-18 16:21:11 UTC.
- In the last 30 days, the consented-event sample contained 34 homepage page views across 12 sessions. This is not total traffic or unique people. No sponsorship-contact, newsletter-signup, or Plus-interest event was recorded.
- `contact_messages`, `newsletter_subscribers`, `newsletter_optins`, and `audience_plus_verifications` had zero rows. The two subscription rows were both `free/inactive`; no paid Plus activation or collected revenue was evidenced.
- The advertiser page is not yet represented as a distinct page in the client analytics page map, so its page views can fall into `other`. Add an `advertise` page key consistently in the browser mapper, collector validation, database constraint/migration, and tests before relying on sponsor-page conversion metrics.

### Release and next actions

1. Keep General ingestion as the only enabled producer while its source quality and latency are monitored.
2. Diagnose the classification worker's no-write authentication path and provider route with a controlled, single-message canary before enabling its producer. The pending backlog older than 60 minutes is not an LLM backfill target.
3. Review redacted DLQ message reasons/schema before deciding whether any fresh message is safe to replay; never bulk-replay all 1,429 messages.
4. Repair and verify NewsData sync authorization/scheduling before enabling only that support job. Keep notification email disabled until delivery credentials and a real confirmation cycle are proven.
5. Add the advertiser-page analytics taxonomy and end-to-end form test in a reviewed code change; do not insert synthetic events or contact records into production to make metrics look healthy.
6. Keep PR #48 in draft until the production queue/auth findings, browser smoke test, authenticated admin smoke test, and real backup/restore requirements have been resolved. Synthetic restore CI is not a real production backup restore.



## Fresh classification eligibility and source recheck — 2026-11-19 06:26 UTC

This recheck corrects the earlier use of `received_at` as a proxy for classification eligibility. The classifier contract is based on **publication time**, not when the row arrived in Supabase.

- Pending rows with `published_at` inside the allowed window (last 60 minutes, with a five-minute future-clock tolerance): **83**.
- Pending rows received in the last hour: **155**. Of these, 83 are in the publication-time window; receipt time alone overstates the eligible count.
- Pending rows with `published_at` older than 60 minutes: **12,240**. Do not bulk-backfill these through Groq/NVIDIA or any other LLM. They should follow the existing expiry policy.
- General ingestion continues: latest run finished at 2026-11-19 06:24:50 UTC. The 24-hour run counters showed 420,513 parsed items, 19,480 successful source attempts, and 1,080 failed source attempts. Parsed items are pipeline counters, not unique published stories.
- The 80-feed active catalog has one unresolved source: Kuwait News Agency (`كونا`, `https://www.kuna.net.kw/rss`) has no successful fetch timestamp and reports `Feed returned no parseable RSS/Atom entries`. The other 79 active sources had no stale/error flag in this read. Validate KUNA's official feed format or replace it with a verified official endpoint; do not silently remove it without recording the source decision.
- Fresh Cloudflare queue metrics: General 0, classification 0, breaking 349 (paused), translation 138 (paused), DLQ 1,429 (no consumer). Total **1,916**. Classification queue empty means its producer is disabled, not that the 83 currently eligible articles have been processed.
- All six support `pg_cron` jobs remain inactive. NewsData has not updated its article fetch timestamp since 2026-11-17 11:22:26 UTC; email delivery remains disabled. Do not enable either support job until its authentication and endpoint are validated.

No production settings or records were changed during this recheck.


## Classification auth-only canary — 2026-11-19 06:28 UTC

A single explicit `{task:"auth-check", scheduled_at:<current ISO timestamp>}` message was submitted to `wrldline-news-classification` while its consumer was unpaused and the classification producer remained disabled.

- Cloudflare accepted the one-message request.
- Supabase Edge logs recorded `POST /functions/v1/classify-news-worker` with HTTP **200**, function version **40**, execution time **725 ms**, at 2026-11-19 06:28:00 UTC.
- The deployed function's `auth-check` branch validates the cron secret and returns before expiry, claim, provider calls, article writes, or any classification RPC.
- The classification queue returned to **0** messages after the canary.
- No article was selected or modified; no LLM provider was called. This proves the Worker-to-Edge auth path only. It does **not** prove Groq/NVIDIA availability, a successful classification, or backlog recovery.

The per-pipeline classification producer remains disabled. The next controlled test, if authorized, is a one-article canary restricted to a record whose `published_at` is inside the 60-minute policy window, followed by verification of the stored result and provider attribution. Do not enable the recurring classification schedule based on this auth-only result.
