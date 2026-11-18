# WRLDLINE Production Stabilization & Release Readiness

**Snapshot:** 2026-11-18 14:16 UTC  
**Repository baseline:** `main` at `40e6e1fe0b5576db07b47a0b0fa3fa4d1f60d5d5`  
**Supabase project:** `vmaxbnogmmfyrcucapnq`  
**Cloudflare Worker:** `wrldline-jobs`

## Hosting and live-site verification

Cloudflare account inspection found zero Cloudflare Pages projects. The active `al-ghaib.us.ci` zone is a full zone on the Free Website plan, and its apex DNS record is a proxied CNAME to `bader11pq-sys.github.io`. There is no `www.al-ghaib.us.ci` DNS record. The observed hosting topology is therefore GitHub Pages as the origin behind Cloudflare DNS/proxy, not Cloudflare Pages.

A direct HTTP check of the public site from the inspection environment could not complete because external DNS resolution failed in that environment. This is **not** evidence that the production website is down. The exact GitHub Pages deployment commit was not independently verified through the available GitHub connection, so the live front-end artifact is not yet tied to the repository commit in this report. Browser CI passed against its isolated local server; it is not a live production browser smoke test.

## Scope and safety

This phase is being prepared on a dedicated GitHub branch. No production Worker, queue, Cron, Supabase function, migration, secret, or row was changed. Queue delivery remains paused as observed; do not unpause until the failure mode and backlog/DLQ disposition have been reviewed.

## Verified production findings

### Cloudflare Queues

All four production queues reported `settings.delivery_paused = true` in the Cloudflare Queue API. The four consumers still exist, are attached to `wrldline-jobs`, and route failed messages to `wrldline-jobs-dead-letter`. The Cloudflare account audit log records successful `patch_queue` actions setting `delivery_paused=true` at 2026-11-17 15:09:08.283Z (breaking), 15:09:10.117Z (general), 15:09:11.378Z (translation), and 15:19:30.575Z (classification). The audit record confirms the setting change but does not provide an operational reason.

Observed metrics at 2026-11-18 14:16:53 UTC:

| Queue | Backlog | Bytes | Oldest message (UTC) | Approx. age |
|---|---:|---:|---|---:|
| general | 505 | 51,005 | 2026-11-17 10:15:35 | 28h 01m |
| breaking | 733 | 74,766 | 2026-11-17 13:56:38 | 24h 20m |
| classification | 1,494 | 161,352 | 2026-11-16 15:13:15 | 47h 03m |
| translation | 279 | 29,295 | 2026-11-18 05:45:32 | 8h 31m |
| dead-letter | 1,429 | 150,975 | unavailable (Cloudflare returned timestamp 0) | unknown |

Queue consumer settings remain batch_size=1, max_retries=3, retry_delay=30 seconds, max_concurrency=1, max_wait_time_ms=1000. All four Cron schedules exist. Worker settings show log sampling at 20% and trace sampling at 10%; sampled logs must not be treated as a complete event count.

### Worker release

Cloudflare reports Worker deployment version 7 (`9c39fcc5-405c-4d7c-a54b-6dbe33c514df`), deployed 2026-11-15 03:46:52 UTC. The deployed `worker.js` content was compared byte-for-byte with `main:cloudflare/workers/wrldline-jobs/worker.js` and matched. Worker observability is enabled, with log sampling at 20% and trace sampling at 10%.

### Worker-to-Supabase authentication contract

The deployed Worker calls `wrldline-news-ingest` and `classify-news-worker` with the `x-wrldline-cron-secret` header. Both deployed functions validate that header through `public.verify_wrldline_cron_secret(p_secret)`. The database verifier compares the supplied value with the Vault entry named `wrldline_news_cron_secret_20261113`; one entry with that name exists.

Cloudflare Worker version 7 records the annotation `Updated secret: WRLDLINE_CRON_SECRET` at 2026-11-15 03:46:50 UTC, while the Supabase verifier continues to reference the dated Vault entry. This makes secret-value drift a strong candidate explanation for the repeated 401 responses, but the mismatch is **not confirmed** because the Cloudflare secret value is not readable through the metadata/API inspection and no secret values were retrieved. The values must be compared securely by an authorized operator without exposing them in logs or chat. The common actor type for the four queue-pause audit events is `user`; the audit entries do not state the reason for pausing.

### Supabase

Project status: `ACTIVE_HEALTHY`. The deployed `ops-dashboard` function exists and is `ACTIVE`, version 6, with JWT verification enabled. Its deployed source was retrieved read-only.

The deployed function currently:
- returns `classification_24h: {}` rather than live `classification_queue_stats()`;
- does not return `ingestion.last_success_at` or `ingestion.last_failure_at`;
- does not return Cloudflare queue metrics;
- returns HTTP 502 when any one of its parallel metric queries fails, obscuring otherwise available metrics.

The live `classification_queue_stats()` RPC returned:

`pending=8756, processing=0, failed=45, expired=51427, classified=2105, needs_review=21, oldest_pending_age_minutes=5038672`.

The oldest pending timestamp is `2017-04-20T12:24:43Z`. This extreme age must be investigated as stale/corrupt queue state or historic published content. Do not mass-delete, expire, or reclassify records without an explicit retention and editorial policy.

The latest recorded ingestion run timestamps in `news_ingestion_runs` were on 2026-11-17 around 14:57 UTC, while this inspection occurred on 2026-11-18 around 14:16 UTC. This suggests ingestion telemetry has gone stale for roughly 23 hours and should be reconciled with logs before declaring an ingest outage.

### Repository drift

The GitHub `main` branch is at `40e6e1f`. The phase-A/C/D commits referenced in the supplied local-only report (`c0ca129`, `f017b65`, `5ea74f8`) were not found in the remote repository or its only listed branch. Do not assume those local changes are in production or GitHub main.

## Additional stabilization findings (2026-11-18 14:28 UTC)

### Current Cloudflare queue snapshot

A fresh read at `2026-11-18T14:28:42Z` confirmed that all four delivery queues remain paused. Backlog values moved slightly from the earlier snapshot:

| Queue | Delivery paused | Backlog | Oldest message (UTC) | Approx. age |
|---|---:|---:|---|---:|
| general | yes | 504 | 2026-11-17 11:27:35 | 27h 01m |
| breaking | yes | 739 | 2026-11-17 13:54:38 | 24h 34m |
| classification | yes | 1,497 | 2026-11-16 15:01:15 | 47h 27m |
| translation | yes | 281 | 2026-11-17 15:25:32 | 23h 03m |
| dead-letter | n/a | 1,429 | 2026-11-15 14:09:23 | 72h 19m |

Total observed backlog: 4,450 messages. DLQ timestamp is available in this snapshot; it is not zero/unknown. Queue counts are approximate and may move while paused or while producers continue to enqueue.

### Supabase scheduled jobs are disabled

The live `cron.job` table reports these jobs as `active=false`:

| Job | Schedule | Target Edge Function |
|---|---|---|
| `wrldline-newsdata-sync` | every 15 minutes | `newsdata-integration` |
| `wrldline-notifications-every-minute` | every minute | `notification-dispatch` |
| `wrldline-source-freshness` | every 15 minutes | `source-freshness` |

All three SQL commands send `x-wrldline-cron-secret` and reference the same Vault entry name used by `verify_wrldline_cron_secret`. No secret values were read. The deployed Cloudflare `wrldline-jobs` Worker does not contain tasks for these three functions; it only schedules general, breaking, classification, and translation.

Run-history evidence:
- NewsData sync: 4 `job startup timeout` failures in the inspected 24-hour window (14:45–15:30 UTC on 2026-11-17). Its migration `20261114041500_schedule_newsdata_sync_every_15_minutes.sql` explicitly creates a 15-minute job, so the current inactive state plus the 2026-11-13 last article fetch is an operational gap to resolve after authentication and scheduler health are verified.
- Source freshness: the same 4 startup-timeout failures. However, project documentation explicitly defines source-freshness scheduling as an operator-selected option among pg_cron/pg_net, Cloudflare, or an opt-in GitHub Actions workflow guarded by `FRESHNESS_MONITOR_ENABLED=true`. The pg_cron row is inactive; whether another approved scheduler is enabled was not verified. Treat this as a monitoring-coverage gap until the chosen scheduler is confirmed, not proof that a required job was unexpectedly disabled.
- Notifications: 49 failed pg_cron runs (`job canceled` / `job startup timeout`) and 19 successful pg_cron command runs. The live `notification_runtime` row is `push_enabled=true`, `email_enabled=false`, with `enabled_at=2026-11-15 04:56:50 UTC`; thus push dispatch is intended to be enabled while email remains off. The one-minute dispatch Cron is currently inactive, and Edge logs independently show 15 HTTP 401 responses from `notification-dispatch`. A successful pg_cron/net.http_post enqueue is not proof that the Edge Function accepted or completed delivery.

### Freshness gap

The private `source_freshness_metrics` table had 1,128 rows, but its latest `checked_at` was 2026-11-17 13:15:04 UTC. At the new inspection, that is more than 25 hours old. The snapshot contained 22 healthy, 228 error, and 492 stale sources. The remaining statuses were not rolled into those three counts.

The NewsData catalog contains 200 configured sources, but the most recent `newsdata_fetched_at` on articles was 2026-11-13 23:21:01 UTC. The NewsData source catalog's latest update was 2026-11-14 03:15:32 UTC. The deployed `newsdata-integration` function is ACTIVE v12, but its cron job is disabled.

### Cron secret self-verification and API-key compatibility

A read-only SQL diagnostic confirmed exactly one Vault row named `wrldline_news_cron_secret_20261113` and `public.verify_wrldline_cron_secret(the_same_vault_value)` returned `true`. This proves the current Vault entry is internally consistent with the verifier. It does **not** prove that Cloudflare sends the same bytes, that pg_net transmits the header as expected, or that each Edge Function's server-side database API key is accepted.

The Supabase project exposes an active `default` publishable key and an active legacy `anon` key. No secret key value or service key was read. Current Supabase guidance says new Edge Functions receive `SUPABASE_SECRET_KEYS` as a JSON dictionary and `SUPABASE_PUBLISHABLE_KEYS`, alongside the legacy `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`. Supabase states that legacy `anon`/`service_role` keys are deprecated by the end of 2026. See:
- [Migrate to publishable and secret API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [Edge Function environment variables](https://supabase.com/docs/guides/functions/secrets)
- [Authorization and apikey headers](https://supabase.com/docs/guides/functions/auth-headers)

The repository currently has inconsistent server-key handling:
- `classify-news-worker`, `translate-articles`, and the shared notification environment resolver can parse `SUPABASE_SECRET_KEYS.default` as a fallback.
- `wrldline-news-ingest`, `newsdata-integration`, `source-freshness/index.ts`, and the current `ops-dashboard` source rely on `SUPABASE_SERVICE_ROLE_KEY` and/or a singular `SUPABASE_SECRET_KEY`; they do not consistently parse the documented JSON dictionary.
- The raw PostgREST helpers in ingestion, NewsData, and source freshness build both `apikey` and `Authorization: Bearer` from the same server key. Supabase's new `sb_secret_...` values are not JWTs and should be sent in `apikey`, not as a Bearer JWT. The legacy JWT-based `service_role` key can continue using the existing Bearer pattern until migration.

This is a concrete compatibility gap and a possible contributor to internal RPC 401s **if** the functions have begun using a new `sb_secret_...` key or the legacy key has been disabled. It is not yet proven to be the current cause: the actual Edge Function environment values were not inspected, and the Vault self-check was successful. Before rotating/deactivating any key, standardize a single server-key resolver and header policy across all Edge Functions, then test it in a non-production environment with the exact key type. Do not print key values or send new secret keys as Bearer tokens.

### PostgREST saturation explains part of the apparent 401 storm
The same PostgreSQL window also contains SQLSTATE `57014` cancellations outside WRLDLINE's own ingestion queries: PostgREST repeatedly timed out on `SELECT name FROM pg_timezone_names` (11 events), its schema/introspection CTE (6), and Realtime subscription publication queries (at least 8 across both subscription-manager processes). A `postgres_exporter` `pg_stat_statements` rollup and a management health-count query also timed out. This shows a broad database responsiveness problem across platform/system and application requests, rather than evidence of one bad cron secret or a single missing index. It does not establish the exact underlying cause (CPU, I/O, locks, memory, connection pool, or provider resource ceiling); no resource attribution is made without service metrics.


A follow-up query of the PostgREST access logs found, in the same one-hour incident window (2026-11-17 14:30–15:30 UTC):
- `POST /rpc/verify_wrldline_cron_secret`: 1,382 HTTP 503 responses between 15:05:19Z and 15:28:26Z, and 17 HTTP 504 responses between 14:38:13Z and 14:57:10Z.
- All PostgREST endpoints combined in that hour: 2,618 HTTP 503, 69 HTTP 504, and 141 HTTP 500 responses.

The log identifies the verifier callers as `service_role`, so those requests passed gateway key recognition and reached the RPC endpoint. The separate Vault self-check returned true. This materially weakens the theory that all observed Edge 401s were simply a bad cron secret. In several deployed Edge functions, any non-2xx response or RPC error from `verify_wrldline_cron_secret` was collapsed into `401 Unauthorized`. Therefore historical Edge 401 counts may include verifier-service 503/504 outages, not only invalid secrets.

The PR now standardizes the distinction:
- A successful verifier request returning JSON `true` authorizes.
- A successful verifier request returning JSON `false` returns HTTP 401.
- A transport, HTTP, JSON-decoding, or PostgREST RPC error returns HTTP 503 and a generic, non-sensitive verifier-unavailable message.

This change does not fix the underlying PostgREST saturation. It prevents future monitoring from misclassifying an infrastructure outage as invalid caller credentials and preserves a retriable service-failure signal. The affected functions have not been deployed to production.

### Invocation failures by deployed function version

The historical Supabase Edge request window (2026-11-17 14:30 UTC through 2026-11-18 14:30 UTC) reported:

| Function version recorded in Edge logs | HTTP status | Requests |
|---|---:|---:|
| `wrldline-news-ingest` v60 | 200 | 6 |
| `wrldline-news-ingest` v60 | 401 | 117 |
| `wrldline-news-ingest` v60 | 500 | 9 |
| `wrldline-news-ingest` v60 | 504 | 8 |
| `wrldline-news-ingest` v60 | 546 | 21 |
| `classify-news-worker` v37 | 401 | 145 |
| `classify-news-worker` v37 | 500 | 12 |
| `classify-news-worker` v37 | 504 | 1 |
| `classify-news-worker` v37 | 546 | 7 |
| `notification-dispatch` v2 | 401 | 15 |

These are invocation counts, not counts of unique articles. The errors are historical: the ingest function has since been deployed as v62, but queue delivery is still paused, so v62 has not yet been validated through a new queue-driven run. Supabase's HTTP 546 guidance describes a function resource limit (CPU or memory); the retained logs do not identify which resource was exhausted. HTTP 504 is a request timeout, not an authentication error.

### Database timeouts and query evidence

The historical application logs contain 9 `statement_timeout` events and 4 `worker_busy` translation skips. The breaking scan in deployed ingest v60 selected up to 2,000 recent published articles and filtered candidate titles in JavaScript; several executions failed with Postgres SQLSTATE `57014` during that scan or during run-log insertion. Translation lock acquisition also timed out.

A read-only `EXPLAIN (FORMAT JSON)` of the current breaking scan query selects `idx_articles_published`. `pg_stat_statements` reports 2,842 calls for the matching query shape, 656,168.87 ms total execution time, and 230.88 ms mean execution time. This is not evidence that an additional index is required: the planner uses the publication index and the average is low compared with the outlier timeout. Do not add indexes or raise statement timeouts without examining slow-query outliers and current v62 behavior.

### Supabase advisor summary

The live advisors returned no health lints, plus items that require a deliberate security/performance review:
- Security: one mutable function search_path warning, 9 anon-callable and 13 authenticated-callable SECURITY DEFINER RPC warnings, an Auth leaked-password-protection recommendation, and 22 RLS-enabled tables with no policies. Some are intentionally private operational tables with revoked grants; public news RPCs may be intentionally SECURITY DEFINER. Audit each function/table against the expected data-access contract before changing grants.
- Performance: 4 foreign keys without covering indexes, 11 RLS init-plan recommendations, 19 unused-index observations, and 2 multiple-permissive-policy warnings on `article_claims` and `article_evidence`.

No advisor-driven SQL change was applied. Unused indexes should not be dropped during incident recovery.

### pg_cron startup failures and concurrency configuration
The global `cron.launch_active_jobs` setting is `on`, but all six existing `cron.job` rows are individually `active=false`. This is therefore not a global pg_cron launch switch being turned off. The project migrations show that NewsData sync and notification/source-freshness jobs were created; the source-freshness migration explicitly leaves scheduler selection to an operator. A read-only `pg_stat_statements` search found known schedule/unschedule migration calls but no normalized `UPDATE cron.job SET active=false` statement. The inspected PostgreSQL logs also did not show a matching cron-job mutation statement. The disabling actor and reason remain unknown; do not infer that the current account user disabled them.


A 48-hour aggregation of `cron.job_run_details` shows repeated startup timeouts across both WRLDLINE and platform maintenance jobs:

| Job | 48h failed with startup timeout | Succeeded | Other failures |
|---|---:|---:|---:|
| notifications (every minute) | 939 | 551 | 1 canceled |
| NewsData sync (15m) | 86 | 13 | 0 |
| source freshness (15m) | 86 | 13 | 0 |
| audience retention (hourly) | 14 | 11 | 0 |
| security counters (hourly) | 18 | 7 | 0 |
| daily briefing | 1 | 0 | 0 |

All six jobs currently show `active=false`. The pg_cron error text `job startup timeout` indicates that a job did not complete startup before its deadline; it does not by itself prove whether the reason was connection pressure, process scheduling, or another resource bottleneck. The notification job also had one `job canceled` run.

The current settings snapshot is:
- `cron.max_running_jobs=32`
- `cron.use_background_workers=off` (pg_cron uses client sessions rather than its background-worker mode)
- `max_connections=60`
- `max_worker_processes=6`
- `statement_timeout=120000ms`
- `work_mem=2184kB`

These values create a plausible concurrency/connection-pressure risk, but there is no captured `too many connections` or connection-slot error in the inspected PostgreSQL logs. The database snapshot shortly after the incident had only 6 sessions and 0 active queries; that later snapshot does not rule out earlier pressure. Do not increase `cron.max_running_jobs`, alter worker settings, or raise timeouts without a resource-time-series review and a controlled test. The same startup timeout across audience retention and security maintenance means the incident is not isolated to WRLDLINE's news pipeline.

Useful current references:
- [pg_cron runtime configuration and startup state](https://github.com/citusdata/pg_cron/blob/main/src/pg_cron.c)
- [Supabase PostgREST error codes](https://supabase.com/docs/guides/api/rest/postgrest-error-codes), including database connection/resource 503s and pool acquisition 504s.

### Current database snapshot

A short read-only activity snapshot at `2026-11-18 14:44:27 UTC` showed 6 other database sessions and 0 active queries at that instant. PostgreSQL cumulative counters since the last statistics reset (`2026-10-29 12:49:05 UTC`) showed 6,434 temp files / 14 GB written and 5 deadlocks. This is not enough to attribute the historical 503/57014 incident to a single resource. The zero-active query count is only a point-in-time observation; the cumulative temporary-write count warrants query-plan and workload review.

### Deno checker dependency pin
The first Deno run after dependency pinning reached the restored `ops-dashboard` source and found 13 strict type errors: implicit-any function parameters, an `unknown` caught error's `message` property, implicit-any query result callbacks, and an inferred classification stats type missing `pending`. The branch now uses explicit row/result types for feeds, ingestion runs, provider states, query results, and classification stats; caught values are handled as `unknown` safely. A fresh Deno type-check on the newest commit is pending.


The Code Quality job completed all 146 Node tests successfully, then Deno type-check stopped before reaching most Edge Functions because the npm registry lookup for `@supabase/storage-js@2.119.1` returned a missing tarball. The published Supabase JS and Storage SDK release displayed by npm is `2.119.0`. The branch now pins the five generic `npm:@supabase/supabase-js@2` imports to `2.119.0`, matching the already-pinned shared notification SDK and avoiding floating minor/patch resolution. Deno type-check must be rerun to confirm this removes the external resolution failure and to expose any real type errors.

### PR code refinement

The PR's `ops-dashboard` source no longer runs a second full-table `articles` count as a fallback when `classification_queue_stats()` fails. It now reports the classification metric as unavailable instead of adding another broad count query during a database incident. The helper and contract tests also keep translation success from being misreported as ingestion success.

## Changes prepared in this branch

- Restore a reviewable source file for the deployed `ops-dashboard` function.
- Add a pure metrics helper for classification statistics, ingestion success/failure timestamps, and merged provider cooldowns.
- Return partial monitoring data with explicit availability/degraded status instead of turning every noncritical metric read error into a total 502.
- Include the live classification RPC metrics in the dashboard response.
- Explicitly mark Cloudflare queue metrics as unavailable from this function; never report an absent Cloudflare integration as a zero backlog.
- Add dependency-free Node contract tests for those helper functions.
- Keep all changes un-deployed and out of the production database.

## Release blockers and next tasks

### P0 — Restore safe queue processing
1. Identify who/what paused all four production queues and why.
2. Reconcile the Worker-to-Edge Function authentication contract without exposing or copying secret values.
3. Inspect and classify the 1,429 DLQ messages by redacted failure reason, queue, age, and payload schema.
4. Decide whether and how to replay valid DLQ messages; do not blindly replay.
5. Resume queues only after a controlled approval, with backlog, retry rate, 401/5xx, and DLQ growth monitored.

### P0 — Repair classification data hygiene
1. Investigate the 2017 oldest-pending record and whether stale items are eligible for expiry or retention cleanup.
2. Identify why there are 8,756 pending items and zero processing items.
3. Review recent `classification_last_error` rows and provider responses.
4. Prove progress using consecutive snapshots: pending decreases, classified increases, oldest age decreases, and deferred=0 or declines.

### P1 — Prove ingestion and translation
1. Reconcile stale `news_ingestion_runs` with Supabase Edge logs and Worker telemetry.
2. Confirm translation pipeline execution is intentionally enabled/disabled and align Worker queue behavior with that policy.
3. Require actual processed/translated counts; HTTP 200 alone is not success.

### P1 — Release evidence
1. Publish the repo changes only after PR review and CI.
2. Deploy `ops-dashboard` only after matching the function source, review JWT/role checks, and passing a privileged admin smoke test.
3. Add Cloudflare Queue metrics to the dashboard through a least-privilege server-side integration or an explicit operational API; do not expose Cloudflare API tokens to the browser.
4. Verify current migrations, deployed function versions, Worker version, bindings, queues, schedules, and website deployment against one commit.
5. Test Stripe in sandbox end-to-end and verify server-side entitlement enforcement before any paid launch.

## Correlated shutdown timeline and scheduler/consumer split

### Confirmed administrative Cron disable

The unified PostgreSQL log records a successful administrative SQL statement at 2026-11-17 15:39:15.901 UTC (logged at 15:39:56.929 UTC, duration 29.548 seconds) issuing six calls to `cron.alter_job(job_id, active=false)` for job IDs 4, 7, 9, 10, 11, and 12. The statement metadata identifies application `mgmt-api`, database role `postgres`, and source `POST /mcp`. This confirms an explicit authenticated administrative action—not pg_cron spontaneously switching off. The available record does not contain a human email/name or reason; do not attribute it to a specific person.

### Correlated events before the disable

Cloudflare Worker observability contains 20 sampled OTel error records for `wrldline-jobs fetch 401` in the inspected 24-hour window, concentrated from 2026-11-17 15:04:46Z through 15:16:58Z. The spans show calls to both `wrldline-news-ingest` and `classify-news-worker`. It also contains one `fetch 546` record for `classify-news-worker` beginning 15:01:50Z and lasting about 150 seconds. These are sampled telemetry records (Worker log head-sampling configured at 20%), not guaranteed total invocation counts. In the same period, PostgREST verifier requests returned 503/504. Queue-delivery pause audit actions then occurred between 15:09:08Z and 15:19:30Z. The exact operator rationale is not present in the inspected audit records.

The sequence is consistent with an operational response to Supabase/Edge invocation failures, but it does not establish the decision-maker's intent:
1. 15:01:50Z: a classification Edge invocation ended with HTTP 546 after ~150 seconds.
2. 15:04:46Z–15:16:58Z: sampled Worker calls to ingest/classification returned HTTP 401.
3. 15:05:19Z–15:28:26Z: the cron-verifier PostgREST RPC returned 1,382 HTTP 503 and 17 HTTP 504 in the recorded one-hour window.
4. 15:09:08Z–15:19:30Z: four Cloudflare queue delivery-pause actions were recorded.
5. 15:39:15Z: one administrative SQL command marked all six pg_cron jobs inactive.

### The producer scheduler is still running while queue consumers are paused

The deployed `wrldline-jobs` Worker still has four Cron Triggers configured:
- every minute: enqueue classification
- every 2 minutes: enqueue breaking
- every 3 minutes: enqueue general
- every 5 minutes: enqueue translation

A fresh Cloudflare Workers Observability query showed successful scheduled invocations (`outcome=ok`) for these triggers through 2026-11-18 14:56:38Z. The deployed queue configuration has one consumer per main queue, each with batch size 1, max concurrency 1, max retries 3, and retry delay 30 seconds. All four consumer deliveries remain paused. Producer Cron triggers and consumer delivery are separate controls; pausing delivery does not stop the scheduled producer from adding messages.

The configured schedule rates sum to about 2.03 messages/minute, or approximately 122 scheduled messages/hour when every trigger succeeds, excluding retries. That explains how the backlog can continue to grow while delivery is paused. At 2026-11-18 15:01:05Z the main queues held 3,046 messages (general 509, breaking 750, classification 1,499, translation 288) plus 1,429 in DLQ, for 4,475 total. This is a time-specific snapshot; counts can change as scheduled producers continue.

### DLQ payload and traceability gap

A non-destructive preview of 15 DLQ messages found only `task`, `scheduled_at`, and `enqueued_at` in their payloads. There is no stored failure status, error code, retry history, or source message ID in those payloads. The DLQ has no consumer configured. Blind replay is unsafe.

The deployed Worker source also omitted Cloudflare `message.id` from failure/success/network log fields, making it difficult to correlate a particular DLQ item with its original processing failure. The PR branch now adds `message_id` to invalid-message, healthcheck, missing-secret, success, HTTP-failure, and network-failure log entries and adds tests for success (200), HTTP failure (401), and network failure paths. This is a source-only change pending review and deployment; it does not retroactively add metadata to the existing DLQ backlog.

### Controlled recovery order

Do not resume all consumers at once. First review and retain the existing DLQ sample/export; verify current deployed Worker version and exact queue/consumer settings; deploy the message-ID logging change; confirm Supabase verifier health and Edge smoke tests in a controlled path. Then, with an authorized operator decision, temporarily pause/reduce producer Cron triggers to prevent further backlog growth, selectively unpause one main queue at a time with low concurrency, monitor status/error and backlog age, and only then restore its producer schedule. Treat classification, translation, breaking, and general as separate rollouts. Leave the DLQ untouched until redacted reasons and replay eligibility are understood. Separately restore NewsData and notification Cron jobs only after verifier and endpoint validation; choose exactly one source-freshness scheduler.

## Latest operational snapshot (2026-11-18 14:54:26 UTC)

The final read-only check during this phase still showed all four production delivery queues paused, all six observed pg_cron rows individually inactive, and the classification backlog unchanged.

| Queue | Paused | Backlog | Oldest message (UTC) | Age |
|---|---:|---:|---|---:|
| general | yes | 512 | 2026-11-18 00:45:35 | 14h 08m |
| breaking | yes | 746 | 2026-11-17 20:22:39 | 18h 31m |
| classification | yes | 1,496 | 2026-11-16 15:08:15 | 47h 46m |
| translation | yes | 286 | 2026-11-18 06:50:33 | 8h 03m |
| dead-letter | n/a | 1,429 | 2026-11-15 14:29:56 | 72h 24m |

Total observed queue backlog: 4,469 messages including DLQ. The classification RPC remained at pending 8,756, processing 0, failed 45, expired 51,427, classified 2,105, needs_review 21, with oldest pending record 2017-04-20.

All six tracked cron rows remained `active=false`: notification dispatch, NewsData sync, source freshness, audience retention, security counters, and daily briefing. No scheduler was re-enabled.

## CI verification (current PR head: 2026-11-18)

The latest CI runs for the PR head completed successfully:
- Ops dashboard contract workflow: success.
- WRLDLINE Code Quality: success, including all Supabase Edge Deno type checks, protected-endpoint/consent tests, disposable-database editorial/newsletter RLS checks, and asset/JSON validation.
- WRLDLINE Production Readiness: success, including mocked consent/mobile/network-failure browser regressions. The optional source-freshness workflow job was skipped because its opt-in environment was not enabled.
- CodeQL: success.
- WRLDLINE Backup Restore Drill: synthetic encrypted fixture restore succeeded. The manual real-production-backup job was skipped; no real production backup was downloaded or restored.

These are CI and synthetic-fixture results. They do not establish a live-site HTTP/browser smoke test, a production data restore, or production worker/queue recovery.

## Local verification

Run:

```bash
node --test tests/ops-dashboard-metrics.test.mjs tests/cron-auth.test.mjs
```

This test suite covers helper behavior only. It is not an end-to-end Supabase, Cloudflare, auth, or browser deployment test.
