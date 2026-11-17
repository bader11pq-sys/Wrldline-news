# WRLDLINE production reliability

## Delivery status and ownership

This module supplies reviewable repository changes only. It does not deploy Edge Functions, apply migrations, export production data, change Cloudflare queues, enable branch protection, or commit/push code. The website remains the existing GitHub Pages main/root project with its navy/gold Arabic RTL design and protected account content. Public article URLs remain `/news/{uuid}`; no public article-table grant is introduced here.

**A passing synthetic drill is not proof that a production backup exists or has been restored.** The provider's current backup policy, retention, PITR entitlement, last successful production backup, and RPO/RTO are unavailable and must be confirmed by the operator. No outbound freshness email, SMS, or webhook is configured or sent.

## Checks on every push and pull request

`code-quality.yml` runs on every branch push and PR: `node --check` for committed JS/MJS, a single integrated Node test invocation covering `tests/*.test.js`, `*.test.mjs`, and `*.test.cjs`, Deno checks for all Edge entrypoints, mocked freshness handler tests, JSON parsing, and local HTML script/style asset validation. New static checks detect privileged Supabase literals in the browser dependency graph, executable raw URLs, obvious raw article URL sinks, and unpinned Supabase major-version browser URLs; fixtures exercise the real newsroom HTTP(S) URL helper. This heuristic is a regression barrier, not a replacement for dependency/security review or endpoint authorization.

The owned `tests/reliability-tooling/package.json` and lockfile pin jsdom 26.1.0 and PGlite 0.3.14 for the other modules' isolated CJS tests. CI copies these manifests outside the checkout, runs `npm ci --ignore-scripts`, and uses `NODE_PATH` for one integrated invocation. These dependencies are not added to the browser/application or a root package.

`production-checks.yml` runs isolated browser checks on push/PR/manual execution. The owned adapter executes the existing consent/mobile/failure diagnostics without editing them, selects the installed Playwright Chromium path, and mocks all non-local networking. Both old `data-consent` and new `data-choice` selectors work; queued events are explicitly flushed rather than assumed to send immediately. Public news may be public while protected account/profile data must stay inaccessible to anonymous sessions. No live users are created or written. Browser tests run against a local server at port 4173 and block service workers.

`backup-restore.yml` runs a **synthetic-only** encrypted local-container drill on push/PR. A separate manual job is opt-in, main-only, and uses the `production-backup` environment. It reads a secret `DATABASE_URL`, takes a logical backup, encrypts it, and restores it only into a throwaway container. The only uploaded file is ciphertext, retained for seven days; failed restores still retain a successfully produced ciphertext backup. Temporary identity material is removed regardless of success.

Pinned toolchain: Node 22.23.0, Deno 2.5.6, Python 3.12.8, Playwright 1.56.0, psycopg 3.2.13, PostgreSQL image `postgres:17.6-bookworm`. Checkout/setup-node/setup-python use commit SHAs and do not persist checkout credentials; workflow permissions are `contents: read`. The runtime encryption utility is Ubuntu's `age` package. Before enabling production, review current security patches, pin the Postgres image to an approved immutable digest via `DR_POSTGRES_IMAGE`, and pin the remaining setup-deno/upload-artifact action revisions after organizational review. No install scripts from the application or untrusted PR run with production secrets.

### Required repository/hosting controls (not installed by this module)

Require PR review and the `syntax-and-assets`, `browser-regressions`, and `synthetic-restore` checks on `main`; disallow force-pushes and direct pushes, including administrative bypass. Configure `production-backup` with required reviewers and a main-only deployment branch rule. Separate monitoring secrets in `production-monitoring`. Restrict Actions to approved actions and prevent fork PRs from accessing secrets (`pull_request_target` is not used). Review privileged historical ingestion workflows separately; they are outside this module's ownership.

GitHub Pages currently publishes main/root. These checks alone do **not** make Pages wait for validation after an unrestricted direct push. Enforced main branch protection is the minimum gate. If a dedicated Pages deployment workflow is adopted, it must explicitly depend on successful checks and use a protected deployment environment. The operator must verify rules exist; none are claimed installed.

## Per-source freshness monitoring

Apply `supabase/migrations/20261115050000_source_freshness.sql` through the authorized operator. It creates only operational config/state/latest-metrics tables with RLS and no anonymous/authenticated privileges. Service-role-only RPCs have fixed search paths and explicit grants. It does not expose a security-definer public view, return article bodies, widen article grants, modify account rows, or schedule jobs as part of the migration.

The monitor reads **actual active database feed configuration**, not a static assumed catalog or queue health acknowledgement. Exact feed `source_url` is the RSS key (`rss:{feed_url}`), never a publisher name that can span multiple feeds. A feed health PATCH records the attempt timestamp even when identical errors recur; last success is retained when existing ingestion clears `last_fetched` on error. An article INSERT records actual receipt and original publication timestamps. An UPDATE/upsert of an existing article is not a new story. Historical state initializes from actual article rows. Operational counts can include review/rejected rows because receipt measures ingestion, not public editorial approval; no content is exposed.

Status and flags remain separate:

| Signal | Meaning |
| --- | --- |
| `attempt_not_initialized` | No actual per-source attempt timestamp exists. |
| `attempt_overdue` | Last attempt exceeds explicit cadence × grace multiplier. |
| `last_attempt_error` | Latest attempt failed; not inferred from empty news. |
| `no_new_news` | A successful repeated poll produced no new article INSERT since the prior attempt. Not an alert by itself. |
| `published_not_initialized` / `published_stale` | No publication clock / publication age exceeds publisher threshold. |
| `received_not_initialized` / `received_stale` | No receipt clock / ingestion age exceeds receipt threshold. |
| `cadence_not_configured` | No per-source cadence agreed; never treated as healthy. |
| `initialization_grace` | New sources have a finite startup grace, not fabricated success. |
| `future_timestamp` | A clock is more than five minutes in the future. |

RSS's initial **expected** full-rotation cadence is 900 seconds with 2× attempt grace. This is not an assertion that a timer is installed or meets that target. The canonical RSS registry is now curated to exactly 80 unique publisher endpoints (68 Arabic and 12 English). All 20 urgent-monitor publishers are Arabic-language sources; no English publisher is included in the urgent desk. The urgent desk reuses this Arabic-only subset of the same 80 publishers through per-publisher Google News RSS searches every five minutes; these monitoring queries are not inserted as additional `feeds` rows, so they do not inflate the 80-source count. The general Edge ingestion validates that the catalog and active `feeds` registry each contain exactly 80 sources before collecting. The breaking Edge job still classifies urgent headlines already ingested; the GitHub breaking worker performs the publisher-level urgent searches. Scheduling and the paused operational queues remain separate from this source-count change and must be explicitly enabled after health checks.

Defaults: maximum publication age 172800 seconds, receipt age 86400 seconds, initialization grace 3600 seconds. Override `source_freshness_config` per exact source key for slow, weekly, low-volume, or delayed providers. Columns have bounded positive values and optional `enabled=false`. Newly added active RSS feeds receive the same explicit default through snapshot fallback even before an override is entered.

### NewsData attribution limits

`newsdata_sources.updated_at` is **catalog discovery**, not polling evidence. Only catalog sources with actual ingested `newsdata_only` rows or explicit config enter the monitor. Source matching uses exact provider `source_url`; publishers that share an origin cannot be disambiguated without recording provider source IDs on ingestion. Existing category-wide NewsData sync does not log per-publisher attempts, so it is deliberately not counted as a successful poll for every catalog publisher. These records remain `configuration_required`/`attempt_not_initialized` until integration and cadence are explicit. Changing this to assumed success would hide freshness outages.

For genuine per-source requests, the ingestion owner can call service-only `record_source_freshness_attempt(p_source_key,p_ok,p_had_new_news)` on each actual source request. Never call it for all sources after a category-level run. Preserve `newsdata_only` attribution and extend ingestion with stable source-ID mapping if the provider can reliably supply one. The monitor does not make any provider or AI calls.

### Protected endpoint and scheduling

Deploy `source-freshness/index.ts` after applying the migration. Required server secrets are `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`). Handler accepts POST only. A cron request calls the existing service-only `verify_wrldline_cron_secret({p_secret: x-wrldline-cron-secret})` RPC. It uses the existing Vault secret by name, `wrldline_news_cron_secret_20261113`; it does not require the cron secret duplicated into Edge environment variables. Alternatively an admin's bearer token is validated through `/auth/v1/user`, with trusted `app_metadata.role === 'admin'`; self-declared roles, `user_metadata`, editors, and anonymous keys do not authorize.

If gateway JWT verification is disabled to allow the existing cron-header model, the handler's verification must remain enabled and the unauthorized test must pass. Requests must include the project's publishable `apikey` for gateway routing where required. Responses are no-store, provide aggregate status counts only, and redact backend errors. Reads paginate 500 rows; metric upserts batch 250 with explicit merge preference. Authenticated scheduled execution writes only operational latest metrics, not articles or alerts.

Choose **one** scheduler to avoid duplicate checks:

1. **Preferred existing application scheduler:** authorized operator schedules every 10 or 15 minutes with `pg_cron` + `pg_net`, retrieving the existing Vault value within the SQL job. Verify extension availability, network response status, secret uniqueness, gateway apikey requirement, and function authorization first. Store any necessary publishable routing key in approved configuration/Vault; do not hardcode an absent secret or guess its value. The migration intentionally does not create extensions, Vault entries, or a cron job.
2. **Cloudflare:** parent can add a protected source-freshness task using existing bindings `WRLDLINE_CRON_SECRET` and `SUPABASE_PUBLISHABLE_KEY`; this module does not edit `wrldline-jobs/worker.js`. Queue acknowledgement alone still does not establish freshness.
3. **Optional GitHub fallback:** set repository variable `FRESHNESS_MONITOR_ENABLED=true`, configure `production-monitoring` secrets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `WRLDLINE_CRON_SECRET`, and use the quarter-hour schedule in `production-checks.yml`. Disabled or missing configuration is not a working monitor. The CLI fails if no sources are checked or actionable sources exist; workflow failures are status evidence, not proof of outbound alert delivery.

A safe Vault-backed scheduling template for the operator (not automatically executed) is:

```sql
-- Prerequisites must already be verified: pg_cron, pg_net, the existing cron secret,
-- and an approved publishable-key Vault entry such as wrldline_public_api_key.
-- Replace YOUR_VERIFIED_PROJECT_ORIGIN and CONFIRMED_PUBLISHABLE_KEY_SECRET_NAME;
-- do not run this with placeholders or duplicate an existing job.
select cron.schedule('wrldline-source-freshness', '*/15 * * * *', $job$
  select net.http_post(
    url := 'YOUR_VERIFIED_PROJECT_ORIGIN/functions/v1/source-freshness',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey',(select decrypted_secret from vault.decrypted_secrets
                where name='CONFIRMED_PUBLISHABLE_KEY_SECRET_NAME'),
      'x-wrldline-cron-secret',(select decrypted_secret from vault.decrypted_secrets
                where name='wrldline_news_cron_secret_20261113')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) where exists(select 1 from vault.decrypted_secrets
                  where name='wrldline_news_cron_secret_20261113')
      and exists(select 1 from vault.decrypted_secrets
                  where name='CONFIRMED_PUBLISHABLE_KEY_SECRET_NAME');
$job$);
```

Inspect `cron.job_run_details` and corresponding `net._http_response`: success enqueueing a HTTP request is not success of the Edge execution. `source_freshness_metrics.checked_at` must advance, and failing/uninitialized sources must be investigated. Tables are operational/private; an admin dashboard should use a separate least-privilege admin-authorized read API rather than anonymous table access. Outbound alerts would require explicit provider credentials, destination, deduplication, and authorization; none are claimed here.

## Encrypted backup and restore drill

### Scope and safety

`backup-create.py` reads `DATABASE_URL` from protected environment only. It enforces remote TLS (`require` minimum; prefer `verify-full` plus trusted CA), a REPEATABLE READ READ ONLY transaction, an exported snapshot shared with `pg_dump`, exact table counts in that snapshot, and age recipient encryption. Only schemas `public`, `private`, `auth`, and `storage` are included; the manifest records scope, extensions, sanitized role names, row counts, and structural SHA-256 hashes. Persistent output is refused anywhere inside the repository. Plaintext dump/manifest/bundle exist only inside a private temporary directory and are removed on exit; runner disk must be trusted, ephemeral/encrypted, and never uploaded wholesale.

The database URL is passed through process environment, not printed or committed. Use a dedicated audited read-capable backup credential with sufficient schema/sequence visibility and RLS-bypass/backup rights as appropriate; do not grant broad browser access to make exports work. A client image must support the actual source PostgreSQL major version. Exact counts can be expensive on large databases; run in an agreed off-peak window and monitor snapshot duration.

`restore-drill.py` accepts ciphertext and an age identity file, **not a target database URL**. It starts a uniquely named `--network none` local Postgres container without ports or host-directory mounts, restores only there via stdin, and deletes the container in `finally`. Original object owners/grants are retained through sanitized NOLOGIN roles; no role passwords or production login capability are restored. It compares row counts and structural fingerprints for columns, RLS flags, policies, non-owner grants, constraints, functions, indexes, and triggers. The synthetic fixture additionally verifies anonymous private-row isolation, the explicit published-only RPC projection, and rejection of invalid article status. Invalid archive members and false synthetic-as-real labels are rejected.

A stock PostgreSQL image cannot necessarily restore all Supabase extensions or external-schema dependencies. The manifest records extension versions; missing versions, compatibility errors, or structural mismatches fail the drill rather than report success. Use an reviewed compatible immutable local image via `DR_POSTGRES_IMAGE`, never a production restore target. Restore and test role memberships/default privileges/platform integrations independently if relied on by the application; this app-schema drill is not a whole-instance identity/extension recovery service.

This does **not** back up bucket object bytes, Cloudflare Worker secrets/configuration, DNS, provider credentials, external alert/email delivery state, Vault/cron-managed service state, or provider PITR/WAL. Arrange separate encrypted inventories/object backups and secure configuration recovery. Restoring bucket rows alone does not restore media files. Retain recipient private keys independently in a controlled vault; losing them makes ciphertext unrecoverable. The default seven-day GitHub artifact retention is a drill setting, not an approved production retention policy.

### Operator commands (not executed against production here)

```bash
# Requires Docker, age, Python 3.12, psycopg 3.2.13.
python scripts/backup-synthetic-drill.py  # synthetic fixture only

# Manual production READ ONLY export, credentials supplied securely:
export AGE_RECIPIENT='YOUR_APPROVED_AGE_PUBLIC_RECIPIENT'
# DATABASE_URL injected by a secret manager; never paste into source/history.
python scripts/backup-create.py --output /secure-outside-repo/wrldline-backup.age

# Local-container-only drill. Identity file from secret manager, mode 0600:
python scripts/restore-drill.py \
  --backup /secure-outside-repo/wrldline-backup.age \
  --identity /secure-outside-repo/restore-identity \
  --require-real
```

Approve target RPO/RTO, production export frequency, ciphertext retention, key rotation/access, media backup scope, and restore-validation owner. Measure duration and recovery scope in a successfully completed real local-container drill before claiming disaster recovery readiness. No script can restore into production; any production recovery remains a separate explicitly approved operator procedure.

## Validation evidence and remaining activation blockers

Local evidence on 2026-11-15:

- Seven Node freshness fixtures pass. The broader security fixtures pass except the intentionally enforced SDK supply-chain gate, which awaits the parent's replacement of floating browser CDN references. Integrated Node tests with isolated tooling currently pass 65/66, with that same remaining gate.
- Freshness Edge Deno check and seven mocked auth/persistence/pagination/failure-redaction tests pass under Deno 2.5.6 and the installed 2.9.8; no network permissions needed. All currently integrated Edge entrypoints type-check under installed Deno after the other owner's interim notification errors were resolved.
- Seven Python backup safety tests pass, including actual age encryption/decryption of hostile-archive and false-real-label fixtures before container startup. Owned Python/JS syntax checks and the three workflow YAML parses pass. SQL parser accepts migration and fixtures.
- A dedicated PostgreSQL16 cluster using a Unix socket only successfully applied the synthetic fixture, freshness migration, and SQL behavior/RLS assertions. Seven fixture tables and twelve structural objects were inspected. This was a **schema smoke test**, not a container restore or real backup restore.
- Full Docker synthetic dump/encrypt/restore was not run locally because Docker is unavailable. It is configured for CI, not claimed passed.
- Browser regressions await the analytics owner's final-ready signal as requested by the coordinator. The earlier legacy consent diagnostic failed due to the new selector/batched-flush contract; the owned runner now adapts both without changing analytics files and adds protected account/admin assertions. Final browser outcomes must be recorded after execution, not inferred from the adaptation.

Activation still needs authorized migration/Edge deployment; per-source cadence/source attribution review; verified scheduler and Vault/gateway prerequisites; approved protected environments and branch protection; CI execution including the container drill; production backup credentials and age keys; compatible Postgres/extensions image; actual encrypted production backup + local restore verification; separate media/config backup; and an approved measured RPO/RTO/retention policy.

### Synthetic restore CI repair evidence — 2026-11-15

Backup Restore run `43679530354` at commit `d1469869703ca77ed372d787407fc3220e4e3098` reported only the suppressed synthetic-drill failure. A native PostgreSQL 16 transport simulation reproduced the first failure at `pg_restore`: a schema-filtered custom archive includes `CREATE SCHEMA public`, which collides with the fresh target's initdb-created `public` schema. This confirms the database-level defect locally; the suppressed PostgreSQL 17 Docker run itself did not expose its exception.

The restore now uses `--clean --if-exists --exit-on-error` **only inside the uniquely named, network-none, no-ports, no-mounts throwaway container**, then replays the entire archive, including owners and ACLs. Simply cleaning was insufficient: recreating `public` loses its implicit initdb `PUBLIC USAGE` grant, which a schema-filtered dump can omit. The encrypted manifest now records the source's exact PUBLIC schema privileges, and the restore reconstructs that baseline without assuming public access. A source with PUBLIC USAGE revoked remains revoked. Schema ACLs are now included in structural fingerprints alongside all prior checks; schema differences are not ignored. Older manifests without the explicit ACL baseline fail closed before container startup rather than guessing access privileges.

Synthetic progress/error lines contain only fixed allowlisted stages and fixed exception-class labels, for example `Synthetic DR only: stage=restore_archive event=failed error_class=CalledProcessError`. No exception text, command, PostgreSQL stderr, data, role/object name, recipient/identity, host, DSN or secret is logged by this diagnostic. Existing production error output stays redacted. Manifest labels, timezone-aware creation dates, schema scope and restore prerequisite types are validated before target startup. Synthetic ciphertext still cannot satisfy `--require-real`; a read-only production export cannot be relabeled synthetic.

Verified locally: `python -m unittest discover -s tests -p 'reliability_backup_test.py' -v` passed **16 tests**, including actual age encryption/decryption, hostile/duplicate/symlink archive rejection, manifest/output redaction checks, fail-closed count/schema comparisons and two full **native PG16 synthetic transport simulations**. Both native variants restored **7 tables, 9 rows and 14 structural objects**, preserving default schema access or an explicit PUBLIC USAGE revocation, and passed anonymous private-row isolation, the published-only RPC under `anon`, and SQLSTATE-specific CHECK rejection. Python syntax compilation passed for all five owned Python files. Temporary clusters used Unix sockets with TCP listeners disabled and were stopped and removed.

These are native synthetic database/cryptography regressions, **not a claim that the PostgreSQL 17 Docker CI drill passed, not production backup evidence and not a real restoration**. The existing workflow requires no edit; the parent/operator must verify its next `synthetic-restore` run. Supabase extension/image compatibility and all previously documented production activation/backup blockers remain unverified. No production export/restore, provider call, workflow trigger, commit or push was performed for this repair.
