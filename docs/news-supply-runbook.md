# News supply runbook

## Scope

Keep legacy general and breaking RSS/Atom disabled, including Google News RSS fallbacks. Retain the archived catalog and previously published articles. Do not enable either retired queue, edit `feeds.active`, or invoke a retired collector to recover a NewsData gap. The classification and translation queues consume existing articles and are separate from news collection.

## Backtrack a NewsData gap without writing to production

1. **Confirm the scheduler, do not infer it.** The `20261114041500_schedule_newsdata_sync_every_15_minutes.sql` migration describes the intended `wrldline-newsdata-sync` job. A file in Git is not proof of an active deployed job. In the approved scheduler's interface, check last attempts and whether one or more timers target the NewsData sync function. In Supabase, get names, schedule, and active status only; do not export job command bodies, credentials, or request headers.
2. **Correlate separate clocks in UTC.** Compare the last scheduler attempt, last Edge request and sanitized `NEWSDATA_SUMMARY`/error outcome, latest stored receipt, and latest publicly visible NewsData story. Do not identify a cron timer from timestamps alone; other callers may exist. Mark missing or unavailable evidence explicitly.
3. **Classify the gap before remediation.** Use the following distinctions; no single HTTP status establishes a successful rotation or a new published story.

| Evidence | Next read-only check |
| --- | --- |
| Expected job missing or inactive; no matching Edge requests | Check the approved scheduler's deployment history and ownership. Eliminate the possibility of an existing alternate caller before proposing a replacement. |
| Job recorded, but no Edge request | Compare scheduler dispatch and HTTP delivery. A successful SQL/queue acknowledgement does not prove the Edge Function ran. |
| Edge request failed | Distinguish gateway authorization, provider quota/timeout, and database error using redacted status and counters; do not retry production blindly. |
| Successful handler with zero inserted rows | Compare `api_results`, `eligible_within_48h`, and `saved_or_updated`. Zero inserts can mean an empty response, filtered records, or existing URL conflicts. A response in the `health` or `sources` mode is not successful ingestion. |
| New receipts with no public appearance | Check publication time and editorial visibility. Do not expose review items or change their status to make a check pass. |

An approved operator can begin with these read-only PostgreSQL queries. The first result identifies candidates only, and the second samples receipts from the dedicated importer (the existing timestamp, not a read-time value). Neither establishes the exact last successful polling attempt.

```sql
begin read only;

select jobname, schedule, active
from cron.job
where jobname = 'wrldline-newsdata-sync';

select max(received_at) as latest_receipt,
       max(published_at) filter (where editorial_status = 'published') as latest_publish_time
from public.articles
where newsdata_article_id is not null
  and received_at >= now() - interval '24 hours';

rollback;
```

An empty or `null` result here means there is no matching observation in the sampled window, not proof of a provider outage. No monitoring job or alert is enabled by this runbook.

## Interpret a public homepage sample

- The normal homepage request uses `p_newsdata_only=false`. A row may still have a `newsdata_article_id`; the flag separates the legacy dedicated lane, not every import from that provider. The homepage's Missed stories section uses already loaded breaking and exclusive coverage, not the legacy lane. Do not use the presence or absence of its cards as a supply monitor.
- For a bounded reader-side observation, record the time in UTC, public RPC status, sample size, and the newest `published_at` and `newsdata_fetched_at` among the NewsData-tagged rows returned. `published_at` describes source publication. `newsdata_fetched_at` can come from the provider, and the public RPC does not return `received_at`. A timeout is a failed read, while a valid empty response is an empty sample. Neither says what the scheduler last did.
- A small, newest-first sample is not a database-wide maximum or an incident recovery signal. Record the fetch window and scope and correlate it with the approved control-plane observations above before closing the supply issue.

## Acceptance before changing a scheduler or importer

- Use `node --test tests/newsdata-sync-fixture.test.mjs` on the CI Node version with `@electric-sql/pglite` from `tests/reliability-tooling` on `NODE_PATH`. The in-memory HTTP fixtures exercise insert, replay, timeout, and recovery. A second test runs the same Edge handler against a disposable PostgreSQL engine with the real provider, lane and public-feed migrations. It exercises URL conflict handling, review and future-date exclusion, and normal vs. legacy lane visibility as `anon`. The base article schema, URL uniqueness and receipt default are fixture assumptions, and the PostgREST bridge is simulated. An actual staging check is still required to confirm deployed schema and end-to-end runtime. Do not create live fixture articles or trigger production `mode: sync` for a diagnosis.
- Verify the legacy commands and Worker routing with `node --test tests/source-catalog.test.js tests/rss-retirement.test.mjs`. Both legacy Cloudflare queue names and their old scheduled routes must drop without a network call, even if the global producer switch is on. Translation in explicitly selected `translation` mode must still route in the fixture.
- If a production change is eventually approved, record a backup/rollback point, change only the confirmed active path, and verify a new receipt and public visibility in separate steps. Do not introduce duplicate schedulers or re-enable RSS as a fallback.
