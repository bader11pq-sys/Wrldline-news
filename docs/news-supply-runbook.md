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

## Acceptance before changing a scheduler or importer

- Start with `node --test tests/newsdata-sync-fixture.test.mjs` on the CI Node version. It uses the real Edge handler and mocked upstream and persistence, exercising insert, replay, timeout, and recovery. It does not exercise actual database constraints or public visibility. Confirm those separately in a disposable staging environment. Do not create live fixture articles or trigger production `mode: sync` for a diagnosis.
- Verify the legacy commands and Worker routing with `node --test tests/source-catalog.test.js tests/rss-retirement.test.mjs`. Both legacy Cloudflare queue names and their old scheduled routes must drop without a network call, even if the global producer switch is on. Translation in explicitly selected `translation` mode must still route in the fixture.
- If a production change is eventually approved, record a backup/rollback point, change only the confirmed active path, and verify a new receipt and public visibility in separate steps. Do not introduce duplicate schedulers or re-enable RSS as a fallback.
