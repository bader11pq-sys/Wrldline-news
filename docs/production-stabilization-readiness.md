# WRLDLINE Production Stabilization & Release Readiness

**Snapshot:** 2026-11-18 14:16 UTC  
**Repository baseline:** `main` at `40e6e1fe0b5576db07b47a0b0fa3fa4d1f60d5d5`  
**Supabase project:** `vmaxbnogmmfyrcucapnq`  
**Cloudflare Worker:** `wrldline-jobs`

## Scope and safety

This phase is being prepared on a dedicated GitHub branch. No production Worker, queue, Cron, Supabase function, migration, secret, or row was changed. Queue delivery remains paused as observed; do not unpause until the failure mode and backlog/DLQ disposition have been reviewed.

## Verified production findings

### Cloudflare Queues

All four production queues reported `settings.delivery_paused = true` in the Cloudflare Queue API. The four consumers still exist, are attached to `wrldline-jobs`, and route failed messages to `wrldline-jobs-dead-letter`.

Observed metrics at 2026-11-18 14:16:53 UTC:

| Queue | Backlog | Bytes | Oldest message (UTC) | Approx. age |
|---|---:|---:|---|---:|
| general | 505 | 51,005 | 2026-11-17 10:15:35 | 28h 01m |
| breaking | 733 | 74,766 | 2026-11-17 13:56:38 | 24h 20m |
| classification | 1,494 | 161,352 | 2026-11-16 15:13:15 | 47h 03m |
| translation | 279 | 29,295 | 2026-11-18 05:45:32 | 8h 31m |
| dead-letter | 1,429 | 150,975 | unavailable (Cloudflare returned timestamp 0) | unknown |

Queue consumer settings remain batch_size=1, max_retries=3, retry_delay=30 seconds, max_concurrency=1, max_wait_time_ms=1000. All four Cron schedules exist. Worker settings show log sampling at 20% and trace sampling at 10%; sampled logs must not be treated as a complete event count.

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

## Local verification

Run:

```bash
node --test tests/ops-dashboard-metrics.test.mjs
```

This test suite covers helper behavior only. It is not an end-to-end Supabase, Cloudflare, auth, or browser deployment test.
