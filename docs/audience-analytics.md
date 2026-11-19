# WRLDLINE privacy-first audience analytics

## Status and scope

Implemented locally for the existing GitHub Pages / static vanilla JavaScript site. No git commits, pushes, remote migrations, Edge Function deployment, production data reads or writes, or MCP operations were performed. The configured collector URL is concrete, but configuration is **not evidence of deployment or live collection**:

`https://vmaxbnogmmfyrcucapnq.supabase.co/functions/v1/audience-events`

This module measures **consenting browsers and sessions only**. It cannot report all visitors, unique people, total readership, or cross-device identity. Returning-browser measurement has a separate, unchecked-by-default opt-in. There is no GA4 integration, third-party tracking script, fingerprint, or service-role credential in the client.

## Files owned by this module

- `analytics.js`: consent UI, settings reopening, consent-only events, active reading, transport and withdrawal.
- `analytics-config.js`: public collector URL, publishable key, bounded client identifier settings. `Object.assign` preserves injected overrides such as `endpoint: '/__analytics'`.
- `audience.html`, `audience.js`, `audience.css`: protected RTL editorial dashboard.
- `supabase/functions/audience-events/{index.ts,handler.ts,validation.ts,config.toml}`: endpoint and independent validator. The nested TOML documents the setting; Supabase CLI does not automatically consume it there.
- `supabase/migrations/20261115040000_audience_analytics.sql`: private tables, service-only ingestion and verification RPCs, editor/admin aggregate RPC, cleanup function and conditional pg_cron job.
- `tests/audience-client.test.cjs`, `tests/audience-dashboard.test.cjs`, `tests/audience-collector.test.ts`, `tests/audience-sql.test.cjs`: isolated fixtures.
- `docs/audience-analytics.md`: this documentation.

No changes to article/account RLS, admin integration, article script, sharing, service worker, auth guard, root configuration, route manifests, README, or root planning files are owned here.

## Consent and client behavior

The public API remains `window.WRLDLINE_ANALYTICS.track(name, parameters)`. Events before consent or after rejection are **discarded**, not queued. Accepting creates a new session and sends a fresh page view immediately. Old blanket consent from the previous implementation is not reused because the new measurement purpose includes reading and optional browser linkage.

Consent is stored as version 2 under `wrldline:analytics-consent-v2`, expiring after 180 days. Returning-browser permission is separate. There are no identifiers before consent; accepting without returning permission creates only a session identifier. A visible settings button is added, and a delegated listener also handles parent-provided `[data-analytics-settings]` buttons added later.

`withdraw()` / `setConsent('denied')` clears pending events, removes session/browser and legacy analytics identifiers, clears timers and measurement listeners, aborts in-flight `fetch` requests, and ignores stale responses. It does not replay events after reacceptance. There is no persistent queue, automatic retry, sendBeacon, or keepalive request that would intentionally continue after withdrawal. A request already received by the server cannot be recalled. Withdrawal stops new collection; it does **not** claim to delete past retained events immediately. Consent changes propagate across tabs via the storage event. Settings UI listeners remain available when measurement is off.

Application transport uses `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`. No application event fields or application logs store email, phone, account ID, search text, article title, raw referrer, full URL, URL query, IP, or user agent. Anonymous events contain random UUIDs and finite classifications. Provider infrastructure may have its own request logging; operations must configure and document that separately rather than claim that application field exclusion disables upstream logs.

## Events and integration contract

Supported event names: `page_view`, `view_article`, `article_read`, `engagement`, `signup`, `outbound_source_click`, `search`, `market_view`, `newsletter_signup`, `sponsor_contact`, `plus_interest`.

Allowed parameter values are enums, booleans, bounded integers and article UUIDs. Arbitrary strings, source-domain strings, titles, search terms and destination URLs are dropped by the client and rejected by the collector if supplied directly. Page identity is a finite enum, not a full path. Supported page keys include `home`, `news`, `account`, `advertise`, `markets`, `map`, `history`, `newsletter`, `contact`, `about`, `privacy`, `terms`, `sources`, `briefing`, and `other`. The advertiser page has its own `advertise` key so sponsorship-page visits can be distinguished from general or unknown pages. Article references must resolve to an existing **published** article on ingestion; unpublished/nonexistent references are ignored. The category for article-linked events is derived from the database rather than trusted from the browser.

Existing `track('view_article', ...)` hooks still work. Existing `wrldline:article-opened` events start active reading using the article UUID and category only. Optional `wrldline:article-closed` events or explicit `endArticle()` immediately finalize duration. Disconnected, hidden or off-screen content pauses measurement even without a close hook.

Canonical server-rendered `/news/{uuid}` pages automatically start measurement after consent when their article element has `data-article-id`:

```html
<article data-article-id="ARTICLE_UUID" data-category="politics">...</article>
```

`main[data-article-id]` and `[data-audience-article][data-article-id]` are also supported. Include `/analytics-config.js` before `/analytics.js`. No title enters event parameters. For custom rendering, call `beginArticle({ article_id, category }, element)` once the content is visible; call `track('view_article', { article_id, category })` if the application has not already sent it.

Active time is sampled every second and reported in roughly 15-second increments. It counts only a visible article in a visible, focused document and stops after 60 seconds without interaction. Deltas are capped at two seconds to avoid counting suspended/throttled intervals. Visibility/focus changes and article closure finalize pending seconds. Very short fragments under one second are omitted. Active duration is a browser approximation, not proof of attention or comprehension. Scroll depth measures the scroll container (not exact text completion).

Parent-owned success hooks, not click intent, should call:

```js
// Only after successful application operations, never with user details:
WRLDLINE_ANALYTICS.track('signup', { signup_type: 'account' });
WRLDLINE_ANALYTICS.track('newsletter_signup');
WRLDLINE_ANALYTICS.track('engagement', { article_id, engagement_type: 'save' });
WRLDLINE_ANALYTICS.track('engagement', { article_id, engagement_type: 'share' });
WRLDLINE_ANALYTICS.track('engagement', { engagement_type: 'follow' });
// Intent, NOT purchase:
WRLDLINE_ANALYTICS.track('plus_interest', { plan: 'monthly' });
```

Allowed engagement types: `scroll_50`, `scroll_90`, `share`, `save`, `follow`, `reaction`. Automatic scroll events are included. Signups are reported successful application events, not server-attested new-account or delivery receipts. Newsletter signup is not a claim that an email was sent. No email/SMS sending occurs in this module.

### PLUS verification and paid conversion honesty

After checkout return and **after the trusted subscription row has been refreshed by the existing billing webhook**, parent account code may call:

```js
await WRLDLINE_ANALYTICS.confirmPlus(session.access_token);
// Or no argument when WRLDLINE_AUTH.getAccessToken is available.
```

The endpoint validates the JWT through Supabase Auth. It passes the verified user ID only to a service-only SQL RPC, which checks the existing subscription: `plan='plus'`, `status='active'`, nonempty provider subscription ID, and a future current period end. Trialing, expired, missing-provider, or browser-asserted payment status cannot become a verified observation. No user ID or raw provider subscription ID is stored in analytics. A SHA-256 digest of the provider subscription ID deduplicates observations during retention. This digest is pseudonymous billing linkage, not anonymous aggregate data; its access and retention are protected accordingly.

The dashboard distinguishes measured PLUS interest, successful signup events, and server-verified active PLUS observations. It separately shows a current subscription snapshot across **all accounts**, clearly not the consent cohort. Verification is first observation within retained history, not original purchase date; re-observation after retention may create another observation. This is deliberately not called a paid conversion.

**Activation blocker for true paid conversions:** the existing subscriptions schema contains active/trial status but no settled invoice, paid amount, first payment timestamp, or verified consent-linked conversion ledger. Active subscriptions can involve trials, free pricing/coupons, or other cases that are not proof of money received. This implementation returns `paid_receipt_verified: false` and `paid_conversion_available: false`; it does not fabricate a paid conversion or divide unrelated global billing counts by consented interest. Add trusted webhook-written settled payment evidence in a separately authorized upgrade before offering paid conversion metrics. Existing billing credentials/webhook operation must also be verified by the parent. Browser `plus_paid`/`paid_conversion` events are rejected.

## Endpoint contract and abuse protections

`verify_jwt=false` is required for consented anonymous event collection. This does not grant anonymous database reads or writes; the function validates its own body, origin and consent first. Verification operations still require a validated user JWT.

Example anonymous envelope (not the former flat event format):

```json
{
  "version": 1,
  "consent": true,
  "operation": "events",
  "events": [{
    "event_id": "11111111-1111-4111-8111-111111111111",
    "name": "page_view",
    "session_id": "22222222-2222-4222-8222-222222222222",
    "occurred_at": "2026-11-15T04:00:00.000Z",
    "page": "home",
    "device_type": "desktop",
    "locale": "ar",
    "referrer_category": "direct"
  }]
}
```

Body timestamps must be within the previous 24 hours or at most one minute ahead. Maximum streamed body size is 16 KiB, including requests without Content-Length. Batches hold 1–10 events from one session. Unknown keys, duplicate event IDs within a batch, invalid UUIDs, arbitrary classifications and incorrectly typed fields are rejected. Event IDs are also primary keys for durable retry deduplication. Reading increments are 1–60,000 ms.

Origin checks are exact allowlist matches; missing origin, `null`, suffix spoofing and wildcard origins are not allowed. CORS replies contain only the matched origin and have no credential allowance. Only POST JSON is accepted. Origin configuration defaults to empty/fail-closed. The edge isolate caps 600 requests/minute and 60 events/session/minute with a bounded map. The database atomically enforces 5,000 accepted-budget events/hour globally, 120/session/hour and at most one hour of reported active time/session/hour, across edge isolates. The client independently caps 30 events/minute and 40 pending events. No IP-based identifier or rate table is stored. Rate records have bounded cardinality because new sessions consume the finite global allowance. There is no dynamic SQL built from event fields, JSON parameter archive, uncontrolled referrer dimension, or client-specified table/column.

Anonymous consent declarations cannot cryptographically prove genuine human consent, and nonbrowser clients can spoof Origin and random IDs. CORS is not authentication or a bot defense. The finite budgets bound stored abuse, but a determined attacker can exhaust them. Parent should configure Cloudflare/WAF and provider request limits without persisting IPs into analytics; do not treat these protections as unlimited DDoS resistance. Rate-limit drops and no-retry behavior mean the dashboard is a sample, not lossless telemetry.

## Protected dashboard and database access

`audience.html` is a static noindex/noarchive shell without embedded private data. It validates the current account through Auth and only calls `audience_dashboard(p_days)`; it never selects raw analytics, accounts or subscriptions directly. The RPC independently checks `auth.uid()` and the **signed `app_metadata.role`** for editor/admin. `user_metadata` is not authorization. Allowed windows are 1, 7 or 30 days. Aggregate lists have fixed limits. The dashboard safely renders article titles with textContent and canonical `/news/{uuid}` links, and clears rendered metrics on signout and pagehide.

All analytics tables have RLS enabled and all raw-table permissions revoked from anonymous and authenticated clients, including editors. No raw event SELECT policy exists. Only server service role can ingest or inspect raw events. Only editor/admin callers can receive the secure aggregate RPC. The migration does not grant public article SELECT or change existing protected account rows.

Returning browsers are opt-in random browser IDs with more than one measured session in the selected retained window. They are not returning people. When the dashboard window is 30 days, the browser-linked subsection still has at most seven days of linkage because older identifiers are scrubbed. Reading averages are totals per article per reading session, not averages of heartbeat fragments.

## Exact retention / privacy-policy wording

| Item | Behavior |
| --- | --- |
| Browser-local consent decision | Expires after 180 days; renewed choice required afterward. Rejection stores only the choice. |
| Browser-local session UUID | sessionStorage, rotated after 30 minutes without measured event activity and removed on withdrawal/tab closure. |
| Optional browser-local UUID | localStorage, new random ID after at most 7 days; removed on withdrawal or disabling returning measurement. No eager deletion can run while the site is closed: expired local storage is removed/replaced at the next use. |
| Events and subscription verification observations | Deleted once older than 30 days by hourly cleanup. |
| Server-side browser ID linkage | Cleared from retained event/verification records once older than 7 days by hourly cleanup. |
| Rate-limit buckets | Removed hourly after they are older than 2 hours. Hour-aligned records can remain up to roughly 3 hours plus scheduling lag. |

The migration schedules `wrldline-audience-retention` at minute 17 of every hour if pg_cron is already enabled. Actual deletion/scrubbing can lag the 30-day/7-day threshold by up to the hourly cadence plus failures; do not describe this as instant deletion. Verify job success operationally. If pg_cron is missing, migration warns and no job is installed; enable native scheduling and install/verify the job **before activation**. The dashboard's `cron_installed` flag indicates extension availability only, not proof of successful cleanup runs. Withdrawal does not delete already stored pseudonymous records; those expire under this retention rule. An expired seven-day browser key can remain in dormant local storage until the site is next opened, but it is not reused for measurement.

## Parent-only activation checklist

1. Inspect and apply `20261115040000_audience_analytics.sql` to the intended project. Verify required existing subscription columns (`user_id`, `plan`, `status`, `stripe_subscription_id`, `current_period_end`) and article columns (`id`, `title`, `category`, `editorial_status`). No migration was applied by this subtask.
2. Set Edge Function environment `AUDIENCE_ALLOWED_ORIGINS=https://al-ghaib.us.ci` (comma-separated additional exact HTTPS origins only when authorized). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are server environment values, never client secrets. The function fails closed without an allowlist.
3. Parent must merge the function TOML block into root `supabase/config.toml` or explicitly deploy `audience-events` using `--no-verify-jwt`. Nested `audience-events/config.toml` alone is **not** an active root CLI configuration. Deploy the endpoint only after the migration and retention job are verified.
4. Confirm hourly pruning exists and succeeds. Add alerts for failed cleanup, global-budget exhaustion and collector unavailability. No scheduled Manus task or sandbox daemon is used as production retention.
5. Add the protected audience navigation link from admin; update route manifest if maintained by parent; exclude the dashboard from public sitemap/SEO surfaces. Review service-worker caching so authenticated aggregates are never cached. All collector replies are `Cache-Control: no-store`; account content protection remains separate.
6. Keep config before analytics script on relevant public/account/article pages, retaining injectability for fixtures. Parent-provided footer selector is already handled.
7. Hook successful signup/save/share/follow operations and call `confirmPlus` only after trusted billing refresh. Legacy hooks remain supported; no hook code outside assigned files was edited.
8. Update privacy policy with the precise retention and withdrawal limitations above. Review provider request logs. Verify editorial roles are in signed app metadata and refresh role-bearing JWTs.
9. True paid-receipt conversions remain intentionally unavailable until trusted payment evidence exists. Nothing here claims real email/SMS sending or credential-backed checkout operation.

## Local checks and reproducibility

No screenshots or production data were used. Deno check passes for the complete endpoint and its imports; Node syntax checks pass for the client, configuration and dashboard. Tests use mocked handlers/network, VM/JSDOM documents and a fresh in-memory PostgreSQL-compatible PGlite fixture with isolated article/subscription records and simulated Auth claims, never live Supabase.

Check-only tooling was installed under `/tmp/wrldline-audience-checks`, outside the repository. The SQL fixture executes the actual migration, checks grants/RLS-denied raw access, protected role gates, ingestion deduplication, category derivation, unpublished-article exclusion, atomic budgets, billing verification, reading averages and pruning. It validates the no-pg_cron branch; native cron scheduling still needs parent live verification. No claim of live Auth/JWT/Edge platform integration is made from simulated fixtures.

```sh
node --check analytics.js
node --check analytics-config.js
node --check audience.js
npm exec --yes --package=deno -- deno check supabase/functions/audience-events/index.ts
npm exec --yes --package=deno -- deno test tests/audience-collector.test.ts

# Dependencies are test tooling only; do not install into the deployed repository.
npm install --prefix /tmp/wrldline-audience-checks --no-save --ignore-scripts \
  jsdom@26.1.0 @electric-sql/pglite@0.3.14
NODE_PATH=/tmp/wrldline-audience-checks/node_modules node --test \
  tests/audience-client.test.cjs tests/audience-dashboard.test.cjs tests/audience-sql.test.cjs
```

Current fixture result: **19 passing tests** (6 Deno collector + 6 client + 2 dashboard + 5 SQL), zero failures. Existing parent browser tests should keep the `[data-consent='granted']` / `[data-consent='denied']` selectors (preserved). Collector mocks must inspect `body.events[].name`, not the old flat `body.event`; an OPTIONS or empty 204 response is not an event and should not increment event counts. Post-consent dispatch is immediate; pre-consent dispatch remains zero.


## Parent deployment note

The collector uses the exact production origin `https://al-ghaib.us.ci` when `AUDIENCE_ALLOWED_ORIGINS` is absent. An explicit empty override remains closed. Supabase CLI gateway configuration is checked in at `supabase/config.toml`; this does not disable the collector's consent/body/budget/Origin validation. Actual applied/deployed state is recorded separately in the final parent deployment report.
