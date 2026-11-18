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
Historical diagnostic (resolved): the first Deno run after restoring `ops-dashboard` found 13 strict type errors involving implicit-any callbacks and unsafe `unknown` handling. The branch added explicit row/result types and safe caught-error handling. The completed Code Quality run on code head `403be590` subsequently passed Deno type-check for every Supabase Edge Function.


Historical dependency-resolution issue (resolved): an earlier Code Quality run stopped during Deno checking after a registry 404 for `@supabase/storage-js@2.119.1`. The branch pins six Supabase JS imports to `2.119.0`. The later complete Code Quality run on `403be590` passed all Deno Edge Function checks and 151 Node tests (151 passed, 0 failed).

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
1. The pending backlog is predominantly recent: 8,609/8,756 (98.3%) of published pending articles are from the last seven days; only 103 are older than 30 days (78 older than one year). Prioritize the recent window under low concurrency and separately inspect/age-review the 103 older records, including the 2017 oldest item.
2. Determine why 8,756 pending and zero processing remain after queue delivery resumes; prove progress from consecutive snapshots rather than relying on Worker HTTP 200 alone.
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

## Public homepage RPC timeout findings and frontend resilience

A user-facing home feed trace on 2026-11-18 at 10:03:48–10:03:52 UTC showed two HTTP 500 responses from `public_home_news_recent_v2`. PostgreSQL recorded SQLSTATE `57014` (`canceling statement due to statement timeout`) for both PostgREST calls; the API trace reported an upstream duration around 3.0–4.1 seconds. The same browser session had successful calls before and immediately after the two failures. This is a transient public-feed timeout, not a missing RPC or API-key rejection.

The role-specific timeouts are:
- `anon`: 3 seconds
- `authenticated`: 8 seconds
- current diagnostic `postgres` session: 2 minutes

This matters because the public home page normally calls the RPC as `anon`. The errors therefore match the 3-second public role budget. A read-only `EXPLAIN` showed the published article scan uses `articles_public_publication_idx` and the per-article translation lookup uses `article_translations_published_article_idx`; no sequential scan was selected for the standard recent feed. The current tables contain approximately 56.9k live articles and 5.1k translations, with 62,354 published articles and 2,838 published translations meeting the public title/status filter.

A controlled, read-only execution of the homepage RPC with 80 rows under `SET ROLE anon` and `statement_timeout='3s'` returned 80 rows in 5.182 ms at the time of inspection (1,548 shared buffer hits). Another run under the same role/budget returned in 5.295 ms. This confirms the query can be very fast when the database is quiet; it does **not** invalidate the captured historical timeout. A separate `EXPLAIN (ANALYZE, BUFFERS)` of the exact main-feed predicate (`newsdata_only=false`) returned 80 rows in 6.514 ms with 265 shared buffer hits; it used the same publication and translation indexes and filtered `NOT newsdata_only`. No new index was added. `pg_stat_statements` still shows high variance across parameterized call shapes: one 51-call shape averaged 420.64 ms (max 2,461.76 ms), a 21-call shape averaged 747.14 ms (max 2,798.20 ms), and a 24-call shape averaged 281.68 ms (max 2,328.23 ms). Do not raise the public timeout or add indexes without a representative load test.

### Frontend mitigation added in this PR

The homepage now stores the last successful public feed response (including public supplemental rows) in per-tab `sessionStorage` for three minutes. If the first/main RPC fails and there are no in-memory articles, it restores that recent public snapshot, keeps rendering the page, displays the original successful-update time, and explicitly labels the content as a saved snapshot while live refresh is unavailable. It does not issue an automatic retry, so a database incident cannot be amplified by retry traffic. Storage failures are fail-soft and never block the live request. The cache contains only rows returned by the public published-news RPC, not user profiles, saved items, or private editorial data.

The app shell/service worker cache was bumped to v62 so clients can receive this frontend change. The PR also adds a browser-regression case that seeds a recent public feed snapshot, simulates a Supabase 503, and checks that the cached story remains visible and clearly labeled. This is branch-only until reviewed and deployed.

### Related access-control result

The same browser session received `permission denied for table article_change_log` (SQLSTATE `42501`) when an unauthenticated browser queried the editorial change log. Repository migrations/docs intentionally reserve that audit table for editors/admins. Treat this as an expected access-control denial unless an authorized editor session is independently shown; do not grant public/anon access or weaken its RLS.

## Supabase new API key migration gate (separate from the November outage)

Supabase's current migration guide (updated 2026-10-29) states that legacy `anon` and `service_role` keys are deprecated by the end of 2026; new `sb_publishable_...` and `sb_secret_...` keys coexist with legacy keys during migration. It specifies that Edge Functions receive the new keys as JSON maps in `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS`, keyed by names such as `default`. A new secret key is not a JWT and must be sent in `apikey` only; putting it in `Authorization: Bearer` causes JWT parsing failure. See:
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- https://supabase.com/docs/guides/functions/auth

### Current Edge gateway authentication mode

The Supabase Edge Function inventory reports `verify_jwt=false` for both deployed `wrldline-news-ingest` v62 and `classify-news-worker` v37. The deployed Cloudflare Worker calls those functions with its publishable key on `apikey` and the separate `x-wrldline-cron-secret` header; it does not send a user JWT. Thus the Worker→Edge gateway contract is intentionally custom-header based, and the in-handler Vault-backed verifier is the actual authorization gate. This matches the Supabase recommended pattern for a function that performs its own caller authentication with `verify_jwt=false`; it does not prove the cron secret itself matched at the time of the incident.

### Observed WRLDLINE compatibility gaps

- The deployed functions remain unchanged: `wrldline-news-ingest` v62, `classify-news-worker` v37, `newsdata-integration` v12, and `source-freshness` v1 still have the legacy/singular key parsing and/or Bearer-header behavior described above. No production Edge Function was deployed during this phase.
- This PR now adds `supabase/functions/_shared/service-key.mjs` to resolve an explicit `SUPABASE_SECRET_KEY`, then `SUPABASE_SECRET_KEYS.default`, then the legacy `SUPABASE_SERVICE_ROLE_KEY` fallback. It detects the new `sb_secret_...` format, emits `apikey` without a Bearer header for that key, and supplies a `supabase-js` fetch adapter that removes the automatically generated Authorization API-key header.
- The review branch applies that helper to ingest, NewsData, classification worker/function, translation, source-freshness, notification server helpers, daily briefing, and Telnyx. Internal classification and translation endpoints accept a trusted worker key through `apikey` or the existing legacy Bearer form, while retaining editor/admin user-session authorization.
- `tests/service-key.test.mjs` exercises named and legacy key resolution, apikey-only headers, removal of Authorization for new secret keys, legacy Bearer compatibility, and negative cases.

The new branch tests address the identified source-level compatibility gaps in those paths; they do **not** prove the runtime key type currently installed in Supabase or that it caused the November outage. Other server integrations (including Stripe and several AI provider health checks) still need their own caller/callee audit before legacy-key deactivation. No secret value was read or changed, no runtime key was rotated, and no legacy key was disabled.

### Safe migration sequence before the legacy-key deprecation date

1. Inventory every Supabase server caller and classify its credential contract: user JWT, service secret on `apikey`, or WRLDLINE's custom cron-secret RPC. Do not conflate those credentials.
2. Implement `sb_secret` support with `apikey` only. For Edge Functions, use `@supabase/server` with `auth: 'secret'` when the function is supposed to authenticate a secret-key caller; retain the separate WRLDLINE cron-secret check where required.
3. For internal function-to-function calls, update both caller and callee together. Do not send an `sb_secret` value on `Authorization: Bearer`, and do not treat a publishable key as an admin credential.
4. Add tests for legacy JWT mode and new secret-key mode, including negative tests proving an `sb_secret` value never appears in an Authorization header.
5. Deploy to a controlled environment, verify ingest → classification → translation and NewsData/notifications, then observe real request success and RLS/authorization behavior.
6. Only after every server caller is accounted for and observed successfully should the legacy `service_role` key be deactivated. Do not remove it as part of the current queue recovery.

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

The current 100%-deployed Worker version is v7 (Cloudflare deployment created 2026-11-15 03:46:52Z). Its version metadata records an update to the `WRLDLINE_CRON_SECRET` binding on 2026-11-15 03:46:50Z. The deployed bindings include all four queue producers, `SUPABASE_PUBLISHABLE_KEY`, and the secret binding `WRLDLINE_CRON_SECRET`; no secret value was read. This proves the binding exists, not that its value matches the Supabase Vault entry. The Worker sends the publishable key in `apikey` and the cron value in `x-wrldline-cron-secret`. A value comparison remains a release prerequisite and must be performed without displaying either secret.

### The producer scheduler is still running while queue consumers are paused

The deployed `wrldline-jobs` Worker still has four Cron Triggers configured:
- every minute: enqueue classification
- every 2 minutes: enqueue breaking
- every 3 minutes: enqueue general
- every 5 minutes: enqueue translation

A fresh Cloudflare Workers Observability query showed successful scheduled invocations (`outcome=ok`) for these triggers through 2026-11-18 14:56:38Z. The deployed queue configuration has one consumer per main queue, each with batch size 1, max concurrency 1, max retries 3, and retry delay 30 seconds. All four consumer deliveries remain paused. Producer Cron triggers and consumer delivery are separate controls; pausing delivery does not stop the scheduled producer from adding messages.

The configured schedule rates sum to about 2.03 messages/minute, or approximately 122 scheduled messages/hour when every trigger succeeds, excluding retries. That explains how the backlog can continue to grow while delivery is paused. At 2026-11-18 15:01:05Z the main queues held 3,046 messages (general 509, breaking 750, classification 1,499, translation 288) plus 1,429 in DLQ, for 4,475 total. This is a time-specific snapshot; counts can change as scheduled producers continue.

### Producer circuit breaker added in the PR branch

The `wrldline-jobs` source now supports an opt-in producer circuit breaker: when the plain-text Worker variable `WRLDLINE_PRODUCERS_ENABLED` is exactly `false`, the scheduled handler records a `producers_paused` event and returns before sending to any queue. When the variable is absent, legacy scheduling remains enabled for backwards compatibility. Tests cover both states and assert that the paused path sends zero messages.

This is a code-only safety control in the review branch. The variable has **not** been set in the deployed Cloudflare Worker, and no Worker upload or Cron Trigger change was made. After review/deployment, an authorized operator can use this control to stop new producer messages while inspecting/draining existing queues, without changing consumer delivery settings.

### DLQ payload and traceability gap

A non-destructive preview of 15 DLQ messages found only `task`, `scheduled_at`, and `enqueued_at` in their payloads. There is no stored failure status, error code, retry history, or source message ID in those payloads. The DLQ has no consumer configured. Blind replay is unsafe.

The deployed Worker source also omitted Cloudflare `message.id` from failure/success/network log fields, making it difficult to correlate a particular DLQ item with its original processing failure. The PR branch now adds `message_id` to invalid-message, healthcheck, missing-secret, success, HTTP-failure, and network-failure log entries and adds tests for success (200), HTTP failure (401), and network failure paths. This is a source-only change pending review and deployment; it does not retroactively add metadata to the existing DLQ backlog.

### Controlled recovery order

Do not resume all consumers at once. First review and retain the existing DLQ sample/export; verify current deployed Worker version and exact queue/consumer settings; deploy the message-ID logging change; confirm Supabase verifier health and Edge smoke tests in a controlled path. Then, with an authorized operator decision, temporarily pause/reduce producer Cron triggers to prevent further backlog growth, selectively unpause one main queue at a time with low concurrency, monitor status/error and backlog age, and only then restore its producer schedule. Treat classification, translation, breaking, and general as separate rollouts. Leave the DLQ untouched until redacted reasons and replay eligibility are understood. Separately restore NewsData and notification Cron jobs only after verifier and endpoint validation; choose exactly one source-freshness scheduler.

## Latest operational snapshot (2026-11-18 16:24:09 UTC)

A fresh read-only snapshot shows all four main delivery queues remain paused. Their registered consumers still exist, but delivery is disabled. The dead-letter queue still has no consumer.

| Queue | Delivery paused | Backlog | Oldest message (UTC) |
|---|---:|---:|---|
| general | yes | 509 | 2026-11-17 11:27:35 |
| breaking | yes | 748 | 2026-11-17 13:56:38 |
| classification | yes | 1,487 | 2026-11-16 15:11:15 |
| translation | yes | 300 | 2026-11-18 09:55:32 |
| dead-letter | no consumer | 1,429 | 2026-11-15 13:59:51 |

Total observed backlog: **4,473 messages** (3,044 across the four main queues, plus 1,429 in DLQ). No queue was resumed and no message was replayed. The four Worker Cron schedules remain configured. The deployed Worker is still version 7 and does not contain the fail-closed producer switch from this PR, so the schedules can continue enqueueing while delivery is paused.

The classification RPC remains pending 8,756, processing 0, failed 45, expired 51,427, classified 2,105, and needs_review 21. The oldest pending row remains dated 2017-04-20. The latest `newsdata_fetched_at` in articles is **2026-11-17 11:22:26 UTC** (not the earlier November 13 value in this report).

Source freshness has not advanced since **2026-11-17 13:15:04 UTC**: 22 healthy, 366 no-new-news, 228 error, 492 stale, and 20 not initialized. All 1,128 source metrics still share that same last checked timestamp. The 200-row NewsData source registry's latest update was 2026-11-14 03:15:32 UTC.

All six tracked `pg_cron` jobs remain `active=false`: notification dispatch, NewsData sync, source freshness, audience retention, security counters, and daily briefing. No scheduler was re-enabled. Classification backlog age buckets previously measured on published pending rows remain the operational recovery guide: 8,609/8,756 (98.3%) are within seven days and 103 are older than 30 days. Prioritize recent news under low concurrency; isolate the older tail for editorial review rather than bulk-deleting or reclassifying it.

## CI verification (tested source head: `c096c158b06167cbf2a9083730d3cbf9481bfd11`)

All required code and security checks for this source head completed successfully:
- **WRLDLINE Code Quality:** success. JavaScript syntax, all Node test modules (including the new Supabase service-key/auth-header tests), every Supabase Edge Function Deno type-check, protected-endpoint/consent tests, disposable-database editorial/newsletter RLS tests, JSON validation, and local HTML asset checks passed.
- **WRLDLINE Production Readiness:** browser regression job passed, including consent, mobile layout/analytics, outage layout/briefing duplication, anonymous account/admin protection, and cached-homepage recovery on a mocked Supabase RPC 503.
- **CodeQL:** success.
- **Ops dashboard contract:** success.
- **WRLDLINE Backup Restore Drill:** synthetic encrypted fixture restore succeeded. The manual real-production-backup job was skipped; no production backup was downloaded or restored.
- The optional source-freshness job was skipped because its protected opt-in environment was not enabled.

The checks prove the branch code and test fixtures pass in CI. They do **not** establish live-site HTTP/browser availability, a real production backup restore, successful cron-secret equality between Cloudflare and Vault, or queue/NewsData recovery in production. No production Worker, queue setting, Supabase Edge Function, cron schedule, migration, secret, or database row was changed during this continuation. The latest documentation update will trigger a documentation-only CI refresh.

## Local verification

Run:

```bash
node --test tests/ops-dashboard-metrics.test.mjs tests/cron-auth.test.mjs tests/service-key.test.mjs
```

This test suite covers helper behavior only. It is not an end-to-end Supabase, Cloudflare, auth, or browser deployment test.



### Cloudflare Worker candidate prepared — not deployed

A release-candidate version was uploaded through the Cloudflare **Version Upload** API on 2026-11-18 16:38:53 UTC:

- Worker: `wrldline-jobs`
- Candidate: **version 8**, `6db110f6-27e4-436d-be87-58f61db5d536`
- Candidate annotation: fail-closed producer circuit breaker; uploaded but not deployed.
- The API confirmed the four queue bindings, `SUPABASE_PUBLISHABLE_KEY`, and the existing `WRLDLINE_CRON_SECRET` binding are retained. The secret's value was not read or exposed.
- The deployed Worker remains **version 7** (`9c39fcc5-405c-4d7c-a54b-6dbe33c514df`) at 100% traffic. Its source does not contain `WRLDLINE_PRODUCERS_ENABLED`.
- No deployment or traffic shift was created. The four Cron schedules remain configured, and main queue delivery remains paused.

If version 8 is later deployed while `WRLDLINE_PRODUCERS_ENABLED` is absent, its scheduled handler fails closed and does not enqueue new work. Do not set that variable to `true` until a controlled consumer recovery is ready. The candidate must still be explicitly approved for deployment.

### Breaking-source/SMS workflow distinction

The `main` branch retains the independent five-minute GitHub Actions breaking desk. The PR branch now documents, rather than disables, this schedule: it retrieves 20 urgent Arabic sources and then dispatches opted-in SMS. The Cloudflare queue's breaking task only flags articles already ingested. This distinction is necessary because disabling `breaking.yml` before replacing the SMS path would remove the current scheduled SMS dispatcher.

## Additional producer and queue hygiene findings (2026-11-18)

### Dedicated GitHub breaking/SMS path

The default `main` branch still defines `.github/workflows/breaking.yml` on a five-minute schedule (`2-59/5 * * * *`), as well as push and manual triggers. This is a separate urgent-source collector, not merely a second Cloudflare queue producer:

- `bot-breaking.js` reads the canonical 80-source catalog, selects the 20 Arabic breaking monitors, fetches their Google News/Telegram streams, and upserts recent urgent items as `is_breaking=true`.
- The workflow then calls `telnyx-gateway` with `action=dispatch_breaking` to deliver opted-in SMS.
- The Cloudflare breaking queue task is different: it scans recently ingested articles and flags urgent titles; it does not itself call the Telnyx SMS action.

Therefore the GitHub workflow may continue delivering urgent-source ingestion and SMS while the Cloudflare queue consumers are paused. Do not remove its schedule until a tested replacement for both the dedicated monitor feed and SMS dispatch exists. Its schedule is not included in the Cloudflare queue rate estimate above.

### SMS delivery reliability caveat

The deployed `telnyx-gateway` currently sets `sms_notification_sent_at` before attempting the provider sends. That prevents concurrent duplicate claims, but it can also leave an article marked as sent when a provider call fails. The GitHub workflow additionally treats the SMS dispatch failure as a non-fatal fallback message, so an unsuccessful call may not fail the workflow. Before migrating SMS dispatch into Cloudflare Queues, implement per-recipient delivery state/idempotency and retry-safe claiming. Do not change the current sending path as part of queue recovery.

### Classification backlog hygiene

A fresh database query found 8,756 pending classification rows and **zero** published pending rows within the last hour. All 8,756 are therefore outside the one-hour AI window and are due to the existing idempotent `expire_stale_classification_queue()` maintenance RPC on the next successful classification-worker run. The function marks them `expired`; it does not delete articles. The published-age distribution was: 20 in the last 24 hours (but none in the last hour), 8,589 between one and seven days, 44 between 7 and 30 days, 9 between 30 and 90 days, 16 between 90 days and one year, and 78 older than one year.

The oldest pending samples include archive/navigation items (for example, publisher pages titled “Business Wire - VentureBeat” and “Advertise With Us - Gujarat Samachar”) received on 2026-11-17 with 2017–2018 publication dates. This points to stale feed entries entering ingestion, not a backlog of 8,756 current stories. The existing `articles_classification_queue_idx` covers the status/publication filter; the expiry RPC should be run under one worker at low concurrency and monitored for completion before any attempt to classify recent stories. Do not delete these rows or reclassify the historical tail as a bulk operation.

