# Cloudflare production changes — 2026-11-24

All changes were made through the Cloudflare API with authenticated access and verified against production. No secret values were read, printed or changed.

| # | Change | Why (evidence) | Verification | Rollback |
|---|---|---|---|---|
| 1 | `wrldline-jobs`: removed the `* * * * *` cron (classification producer). `*/5 * * * *` (translation) kept. | Classification is retired (backend returns 410) yet the producer enqueued about 5,350 messages per day into a queue whose consumer only produced errors and filled the dead-letter queue (2,285 messages, no consumer). | `GET /workers/scripts/wrldline-jobs/schedules` returns only `*/5 * * * *`. | `PUT .../schedules` with `[{"cron":"* * * * *"},{"cron":"*/5 * * * *"}]` |
| 2 | Zone ruleset `http_response_headers_transform`, rule `4cf86beb…`: excluded `/section/*` from the legacy CSP overwrite. | `/section/politics` was served the weak legacy CSP although the public Worker emits a strict one. | `curl -I /section/politics` now returns the strict `default-src 'self'; script-src 'self'…`; page renders at 390px; `/` unchanged. Only console message: Cloudflare Web Analytics beacon blocked by CSP (same as `/news/`). | Re-PATCH the expression without the `/section/` clause. |
| 3 | `news-global-api` Worker replaced by a 410 stub (`cloudflare/workers/news-global-api/worker.js`). Secret binding kept. | Its raw-table query returned 401/42501 since anon table privileges were revoked; no repository consumer references it. | `api.al-ghaib.us.ci/rest/v1/articles` → 410 with pointer to `/news/`; other paths 404. | Upload previous source from git history (`git show 0de28b9:cloudflare/workers/news-global-api/worker.js`). |

Not changed (needs an owner decision or is higher risk): dead-letter queue contents (retained for inspection, never replayed), HSTS, `www` DNS, `wrldline-public` source drift reconciliation.
