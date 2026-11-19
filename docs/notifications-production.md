# WRLDLINE notification production handoff

Local implementation, 15 November 2026. **No migration, function deployment, production opt-in, push, email, or production test was performed by this module's author.** The parent owns deployment, Vault/RPC provisioning and activation. A queue acceptance response is not a delivery receipt.

## Scope and files

Browser files: `notification-config.js`, `notification-client.js`, `account-preferences.js`, notification-only portions of `account.html` / `account-preferences.css`, `newsletter.html`, `forms.js`, and `sw.js`. Backend files: `supabase/functions/notification-center/index.ts`, `notification-dispatch/index.ts`, `_shared/notifications/{core,server,adapters}.ts`, and migration `20261115020000_notifications.sql`. Tests are the `tests/notifications*` files.

The newsletter uses a **new `newsletter_optins` table**. Existing `newsletter_subscribers` rows—including rows whose legacy status is `active`—are not copied, confirmed, or sent email. The legacy live consent column is `consent_at`; this implementation never assumes `consented_at`. The migration revokes legacy anonymous/authenticated INSERT to prevent a direct-table bypass. Contact transport now uses the parent-owned `contact-submit` function and includes the existing checkbox's explicit consent and honeypot; it no longer inserts into `contact_messages` directly.

## Architecture

1. `notification-center` is the public configuration/consent endpoint and the verified-JWT push endpoint. It performs rate limiting through an atomic service-only RPC. Browser push subscribe/upsert/delete/status uses `db.auth.getUser(token)`, not decoded JWT claims. No service credentials enter browser code.
2. `push_subscriptions` is protected by owner RLS. Authenticated users can SELECT only their own safe metadata columns; endpoint and encryption keys cannot be selected. All subscription writes pass through the Edge handler's ownership and endpoint checks. A unique endpoint hash cannot be transferred between accounts by upsert.
3. New publication events feed a private `notification_events` table only when push is explicitly activated, publication/receipt is recent, and the publication is after activation. Historical/backfill articles, missing publication dates, ordinary corrections, metadata edits, and already-published updates do not create push events.
4. Private planner RPCs page at most 100 subscriptions per invocation and create unique ledger entries. Push dispatch rechecks publication status, age, preferences and subscription immediately before sending. Topic/category and country filters are conjunctive; topic lists OR within themselves. `event_country` wins when populated, otherwise `country` is used. Existing category/country values are preserved exactly—no covert taxonomy conversion is performed.
5. Newsletter signup records pending consent and queues a confirmation request only if real email configuration is available. Confirmation is explicit POST, single-use, and expires after 48 hours. Cadence, topics, countries, locale and consent timestamps are stored. The confirmation email states those choices. Anonymous signup cannot change an existing confirmed address's preferences. To change preferences, unsubscribe then opt in and confirm again.
6. Daily periods are the previous complete UTC day; weekly periods are the previous complete Monday-to-Monday UTC week. Only confirmed opt-ins are planned. Published stories must fall after both consent and activation and match selected country/topic filters. At most 20 articles appear; empty digests are cancelled. No public SELECT on `articles` is granted. `notification_digest_articles` is a **service-role-only explicit published projection**, separate from the parent's public article RPC.
7. `notification-dispatch` accepts POST authenticated by `x-wrldline-cron-secret` through the **existing service-only `verify_wrldline_cron_secret({p_secret})` RPC**. There is no extra cron-secret environment dependency. It plans bounded batches, claims at most 20 deliveries atomically via SKIP LOCKED, and runs at most four sending lanes.

## Production activation: parent only

Apply the unique migration against the documented live schema. The migration's runtime switches start **false** and do not schedule any cron job. Deploy both Edge functions with gateway JWT verification disabled, because `notification-center` must accept public double opt-in/config/one-click requests and `notification-dispatch` uses the existing application-native cron secret. The function itself still verifies every authenticated push action. Do not expose either function's service-role credentials.

For example, the parent may use Supabase CLI deployment flags:

```sh
supabase functions deploy notification-center --no-verify-jwt
supabase functions deploy notification-dispatch --no-verify-jwt
```

Required configuration:

| Setting | Production requirement |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge-injected server environment; never public secrets |
| `NOTIFICATIONS_ENABLED` | Defaults to `true` in this project; explicit `false` kills sending. Private database channel flags remain decisive. |
| `SITE_URL` | Defaults to `https://al-ghaib.us.ci`; a trailing slash is normalized. Other paths/query/fragments/credentials fail closed. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Environment first; missing fields resolved from service-only Vault RPC |
| `NOTIFICATION_TOKEN_SECRET` | Environment first; else Vault RPC; random secret at least 32 characters |
| `RESEND_API_KEY` | Actual Resend credential; **not presently supplied** |
| `NEWSLETTER_FROM` | Sender on a verified Resend domain; **not presently supplied** |

The parent's `notification_runtime_config()` RPC returns `{vapid_public_key,vapid_private_key,vapid_subject,notification_token_secret}` using the Vault secret names `wrldline_vapid_public_key`, `wrldline_vapid_private_key`, `wrldline_vapid_subject`, `wrldline_notification_token_secret`. It must remain executable **only by service_role**. The resolver caches Vault results for 60 seconds per server client. Public config returns only `push_ready`, `email_ready`, and the VAPID **public** key if ready. A cryptographically mismatched VAPID pair reports push unavailable. The subject can be `https://al-ghaib.us.ci/contact.html`.

Activation, after migration/deployment/configuration, is an explicit parent operation:

```sql
-- Enable push only. Do not turn email on without the real sender credentials.
update public.notification_runtime
set push_enabled = true, email_enabled = false, enabled_at = now()
where id = 1;
```

Keep `enabled_at` as the initial activation barrier if enabling email later; newsletter selection additionally requires fresh confirmed consent. After a prolonged outage, set the barrier to the new activation time if the intended policy is to discard the old backlog. Do not repopulate events from old articles. Setting either runtime switch false suppresses dispatch for that channel; setting `NOTIFICATIONS_ENABLED=false` is a global kill switch. Unsubscribe/Push deletion remain available while sending is disabled.

### Application-native cron

Use the existing `pg_cron` / `pg_net` / Vault mechanism or the already-owned Cloudflare `wrldline-jobs` scheduler. Do not create a Manus reminder or sandbox background daemon. The payload is `{}`; the header uses the existing application cron secret. Existing Vault name: `wrldline_news_cron_secret_20261113`. Do not print its decrypted value.

Parent-reviewed SQL example, **not executed by this module**:

```sql
select cron.schedule('wrldline-notifications-every-minute', '* * * * *', $job$
  select net.http_post(
    url := 'https://vmaxbnogmmfyrcucapnq.supabase.co/functions/v1/notification-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-wrldline-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'wrldline_news_cron_secret_20261113' limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 70000
  );
$job$);
```

Check for a same-named existing job before scheduling; replace rather than adding duplicate cron entries. An authenticated POST with `?action=health` only reports status and never plans/claims/sends. Public `GET ?action=config` or POST `{action:"config"}` never sends.

At one invocation per minute the cap is 20 deliveries/minute and one 100-recipient push fanout page per minute. Monitor ledger queue age and scale the invocation cadence/batch architecture deliberately for larger audiences. Push events expire after two hours; all deliveries stop retrying after 23 hours. This implementation intentionally avoids catch-up mailing of historical periods. No unbounded table reads or fanout occur in Edge code.

Parent should also load `notification-config.js` then `notification-client.js` on any additional page offering login/logout/account switching and call `WRLDLINE_NOTIFICATIONS.observeAuth(existingSupabaseClient)` there. `account.html` already does this and awaits `beforeLogout(db)` before signing out. If the parent introduces another sign-out control, it must invoke the same pre-logout hook. No edits to `script.js` or `auth-guard.js` were made by this module. The existing page-local `new Notification(...)` path in `script.js` belongs to the parent and should be retired or routed through this implementation to avoid duplicate foreground alerts.

## Delivery safety and real adapters

The maintained `npm:web-push@4.0.0` package uses Deno's Node compatibility; the current ESM namespace export is used (there is no default export). VAPID is passed per send, timeout is 12 seconds, TTL 30 minutes. Endpoint validation permits exact production browser-push hosts and the narrow Apple push-host suffix only: HTTPS, no user/password, no fragment, no non-443 port, and no arbitrary domains/IPs. Provider redirects are not followed by the HTTPS Web Push transport. Web Push 404/410 removes the stale subscription; its ledger row survives with recipient FK set null.

Email sends to the fixed HTTPS Resend API with redirects disabled, a 12-second timeout and an immutable per-delivery `Idempotency-Key`. Only public article text and consent choices are snapshotted; no raw email tokens are persisted in the ledger. The same snapshot, token generation and idempotency key are reused on retries. Do not change sender address, site origin, token secret, or mail-rendering code while in-flight jobs exist; drain/cancel first to preserve byte-equivalent Resend payloads.

Retries use exponential backoff, at most five attempts and a 23-hour lifetime (inside Resend's 24-hour idempotency window). Resend network ambiguity retries with the same key. Push has no equivalent acceptance idempotency contract: an ambiguous network result or stale sending lease becomes `uncertain` and is **never resent**; explicit 429 rejection can retry, while 5xx is conservatively treated as acceptance-ambiguous and never resent. This favors at-most-once attempts over silently duplicating push. There is no claim of mathematically exactly-once delivery across database and external providers. `sent` means provider accepted the request, not that a reader displayed/read it. A crash after acceptance is covered by email idempotency or push's no-resend rule. A lease cannot be finalized twice.

## Token and unsubscribe security

HMAC-SHA256 generates opaque purpose-separated tokens from the private signing secret and per-opt-in UUID nonce. The subscriber table stores only SHA256 token hashes and the nonce—not the raw token. Token rotation changes the consent generation, and existing jobs cannot mail a later re-opt-in using earlier consent.

Human links use `newsletter.html#confirm=...` / `#unsubscribe=...`. An inline first script removes valid **or malformed** management fragments before any third-party script/assets or analytics load. Tokens are not stored in local/session storage, analytics, application logs or error messages. Page/API responses enforce `Referrer-Policy: no-referrer`; management responses are no-store. Browser confirmation/unsubscribe requires a button-driven POST, not GET or prefetch.

RFC 8058 one-click email headers use an HTTPS opaque-token URL and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. GET at that URL shows an inert HTML confirmation form with restrictive CSP and **does not change state**. Standard form POST authenticates the token and unsubscribes repeat-safely. Such a standard one-click URL necessarily contains a token visible to the receiving email provider and HTTP infrastructure. The application never logs it; **parent must configure gateway/APM request-URL redaction and restricted retention for `/notification-center/unsubscribe`** before mail activation. Do not enable raw request logging or place the management URL into analytics. The provider itself necessarily receives the email/token to deliver it. Disable link rewriting/tracking for confirmation and unsubscribe links if enabled at the provider.

The rate ledger stores HMAC fingerprints, not raw IP/email/token values. The Edge gateway must overwrite trusted `x-forwarded-for`; do not deploy behind an untrusted proxy that permits callers to choose the rate-limit identity. Limits: 80 browser IP requests/hour (one-click provider endpoint has a separate 1,000/IP/minute ceiling), 30 push actions/user/hour, 5 signup requests/IP/hour, 3 signup requests/address/day, and 15 token operations/token/hour. Counters increment atomically and are private to service_role. Set provider spending limits and monitor abuse; double opt-in does not make email-bombing risk zero.

## Browser and user behavior

Permission alone never displays an enabled success. The browser readiness endpoint must report valid VAPID credentials, the browser must support Push on HTTPS, the server subscription must succeed, the local worker owner gate must be saved, and preferences must save successfully. No automatic permission request occurs on load. Missing credentials/support disables the opt-in control and gives explicit Arabic status. Notification body and click target use only published public article data; SW constructs `/news/{uuid}` itself and ignores payload URL/images/actions.

The gate starts off, persists in IndexedDB, and is bound to the current opted-in user UUID. Logout first disables the gate and closes existing alerts, deletes the user's endpoint where possible, and always unsubscribes locally even offline. A message for another account cannot show an alert, and a stale notification click after logout cannot navigate. Endpoint rotation disables the gate until a signed-in user explicitly subscribes again. iPhone/iPad requires iOS/iPadOS 16.4+ and installing through Safari's Add to Home Screen, then opening that installed app. Delivery when the site is closed remains browser/OS dependent.

Preferences map to the live `user_preferences` columns (`notify_categories`, `notify_countries`, `notify_breaking`, `browser_notifications`) as well as followed categories/countries. Selected categories/countries filter both breaking and ordinary push. With neither selected, only opted-in breaking alerts are sent; disabling breaking suppresses breaking alerts even when topics match. Empty newsletter selections, by contrast, mean all topics/countries. Disabling global browser notifications blocks sending to every stored subscription and deletes the current device subscription. Newsletter consent is independent of login/logout.

## Operations and retention

Watch private aggregate ledger counts by status/age and sanitized `error_code`; never export endpoint/key/token/email values to telemetry. Investigate `uncertain` without manually replaying it. Do not reset `sent`/`uncertain` to queued. If Resend credential/sender verification fails, email rows fail safely rather than manufacturing an enabled delivery message.

Parent should add application-native retention maintenance in bounded SQL batches, e.g. delete expired rate buckets older than two days, expired pending opt-ins older than 30 days (after privacy review), completed events older than seven days and completed/sent/failed/cancelled ledger rows older than the chosen 90-day audit window. Keep unresolved/sending rows for investigation. Never schedule bulk delete without reviewing retention and consent policy. The migration does not silently delete user records or provision retention cron.

## Local verification and remaining activation blockers

All tests use `.invalid` email/domains, injected sender/database mocks, or a guarded disposable local PostgreSQL database. Deno tests run **without `--allow-net`**; no production provider can be contacted. Package resolution can download check dependencies; test execution itself has no network permission.

```sh
node --check notification-config.js
node --check notification-client.js
node --check account-preferences.js
node --check forms.js
node --check sw.js
node --test tests/notifications-client.test.mjs
~/.deno/bin/deno check --no-lock supabase/functions/notification-center/index.ts supabase/functions/notification-dispatch/index.ts
~/.deno/bin/deno test --no-lock --allow-env --allow-read tests/notifications-edge_test.ts
```

SQL fixture: start a **new private local** PostgreSQL instance, create `notifications_fixture`, then run `psql -h 127.0.0.1 -p <local-port> -d notifications_fixture -f tests/notifications-fixture.sql`. The fixture refuses any other database name/non-loopback host and is not suitable for production. It defines the minimal documented live columns/roles, applies this migration, then verifies RLS/column grants, private RPC grants, rate limits, historical suppression, publication transitions, filter pagination, consent single-use/expiry behavior, legacy isolation, digest uniqueness, lease claiming/finalization and ambiguous push lease recovery.

Activation blockers: parent migration/deploy; gateway JWT verification configuration; `SITE_URL` and exact global enabled flag; runtime channel activation; Vault RPC grants/return fields; application-native cron; canonical `/news/{uuid}` routing by the parent; public login/logout hook integration if additional sign-out controls exist; and **actual Resend credential, verified sender/domain, privacy-policy provider disclosure and management-URL log redaction before any email activation**. No real delivery has been verified, and no email sending is claimed.


## Newsletter-only scheduler (production isolation)

The live project now uses a dedicated `wrldline-newsletter-every-minute` cron job calling `notification-dispatch?channel=email`. The dispatcher validates the same existing service-only cron secret, but this channel **never plans or claims browser-push jobs**. This prevents enabling newsletter delivery from unexpectedly draining the separate push queue. The existing `wrldline-notifications-every-minute` job remains inactive.

The newsletter-only job is safe while email is disabled: `email_enabled=false` or missing Resend/sender credentials causes a zero-claim no-op. After adding `RESEND_API_KEY` and `NEWSLETTER_FROM` as Supabase Edge Function secrets, verify `email_ready=true`, then explicitly set `email_enabled=true`. Do not enable the general all-channel job unless push delivery is also intended.
