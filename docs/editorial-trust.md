# Editorial trust layer

This module upgrades WRLDLINE's existing vanilla-JS newsroom without initializing a Manus project, changing account storage, invoking AI, deploying, or writing to the live Supabase database. All database checks use disposable local fixtures. The migration is **not applied** to production.

## Owned files

- `admin.html` and the editorial portions of `admin.js`
- `article-trust.js`, `article-trust.css`
- `supabase/migrations/20261115030000_editorial_trust.sql`
- `tests/editorial-trust.test.js`
- `tests/editorial-trust-db.sh`, `tests/editorial-trust-fixture.sql`, `tests/editorial-trust-db.sql`
- This document

## Credibility model

`articles.editorial_trust_status` has `unconfirmed`, `disputed`, and `confirmed` states. `trust_needs_review` distinguishes a recorded decision from a stale assessment. Existing articles retain their legacy `verification` values and publishing status; the new public layer does **not** reinterpret old source counts or AI confidence as human confirmation. No bulk demotion or translation backfill is performed.

The existing `article_evidence` table is reused. A new evidence row defaults to **not independent**. An editor must explicitly record a `provenance_group` and `independence_note` when marking a source independent; the database stamps the human's identity and review time. The group identifies the actual originating reporting operation: syndicated copies must share it. Distinct publisher names, matching URLs, official accounts, or reposts are not auto-certified. The database cannot determine real-world source independence or authenticate agency accounts; these are accountable human assessments, not factual guarantees.

`article_claims` stores `claim_text`, `status`, `supporting_evidence_ids`, a private review note, and DB-stamped review metadata. Evidence must belong to the same story. Confirmation requires two distinct editor-recorded reporting origins and a human note. Contradictory/retracted support is rejected. The article-level confirmation check requires at least one claim, all claims confirmed, no contradiction/retraction evidence, currently adequate claim evidence, and human translation review when the article's language differs from the recorded source language. Changed supporting evidence invalidates its prior claim-review timestamp; save/review the claim again before confirming the story. AI confidence/classification fields are never inputs to verification.

Evidence/claim edits lock their parent article and invalidate its editorial assessment. Future material story/source/narrative edits reset trust and, for translated text, translation review. Review metadata is DB-stamped rather than accepted from client timestamps. The legacy `article_evidence_recompute` trigger is removed and its private count-based helper is replaced with conservative invalidation. There is no remaining automatic count-to-confirmation path in this module.

Agency context is explicitly attributed: `agency_name`, `agency_account_url`, `agency_statement_url`, `agency_narrative`. The public UI describes the account URL as **editor-recorded**, not authenticated. `trust_source_excerpt` contains an editor-recorded quotation in the original language; it is not generated or substituted for actual source content. Missing excerpts direct readers to the source link.

## Human translation review

Article text uses `human_translation_status` (`pending`, `reviewed`, `not_required`), a private review note, and DB-stamped reviewer/time. `not_required` cannot be used for a text whose recorded source language differs. Removing review from translated text invalidates confirmation. Content changes cannot retain an old human translation approval.

If the existing `article_translations` table is present, this migration adds `human_review_note` and installs guards/auditing on its existing lifecycle. Publishing a new/review translation requires an editor/admin JWT plus an explicit note. The source remains `machine_draft` when the translation originated from a machine; reviewing it does not relabel it `editorial`. Machine provenance cannot be rewritten through updates. Translation identity and language cannot be moved between stories. Editing translation text returns it to review; editing the original story returns dependent published translations to review. Existing rows are not mass-demoted at migration time. The public trust RPC includes only published translations with actual human review metadata **and** a human review note, never grandfathered machine-only approvals.

The optional translation guard expects the established columns `id`, `article_id`, `lang`, `title`, `summary`, `translation_status`, `translation_source`, `reviewed_at`, `reviewed_by`, `published_at` in the existing table. Validate those before applying. The module does not create a parallel guessed translation table. The admin review list shows recorded article text and a source link for comparison; if the stored article itself is translated, compare against the actual external source, not just the stored article.

## Append-only, sanitized audit

`article_change_log` is created when absent, or extended in place when present. Existing rows, snapshots, and prior corrections remain intact and private. Only its article FK is removed so deleting a story does not cascade-delete the history. Old public policies/grants on the evidence, claims, and audit tables are replaced with editor/admin policies. Log writers are triggers only; authenticated editors have SELECT but no INSERT/UPDATE/DELETE. BEFORE UPDATE/DELETE/TRUNCATE guards also reject privileged mutations unless an administrator deliberately disables the safeguards outside this module.

New audit entries record field **names**, generic public change descriptions, and explicit public correction notes. They do not write before/after snapshots, evidence/claim IDs, internal notes, or editor identities. Events cover article edits, evidence, claims, translation text, and human review. Both the first and subsequent correction remain separate immutable entries even if the current correction note changes or clears. Public output includes only `public_safe=true` entries, with time, event type, entity kind, and public note; old snapshot-bearing rows are excluded. The UI labels this as the new audit layer and never claims that an empty log proves no historical edits occurred. The newest 100 entries are shown; older stored entries are retained.

## Signed-in reader privacy

The existing `authenticated` role is shared by readers and editors. Its older table-wide SELECT grants would expose every newly added article/translation column; safe public RPC output alone cannot prevent this. The trust migration now revokes table-wide **and existing column-level** SELECT grants from `PUBLIC`, `anon`, and `authenticated`, then grants `authenticated` only an explicit allowlist of existing safe columns. It intersects that fixed list with the actual schema, so missing optional fields do not block activation and unknown/future columns are not automatically readable. Article read/write RLS and editor/ingestion write grants are preserved. Anonymous dynamic table reads remain unavailable; public pages use safe RPCs. No article or translation rows are mass-demoted, rewritten, or removed.

`trust_review_note`, `trust_reviewed_by`, `human_translation_note`, `human_translation_reviewed_by`, translation `human_review_note`, and translation `reviewed_by` are excluded from browser table grants. Editor article notes/IDs are available only through `get_editor_article_trust`; server-only `service_role` retains full SELECT for ingestion, translation queue, and claim-certification reviewer-presence checks. The server claim checks still require an actual reviewer ID; restricted reader fields are not permission to weaken certification. Never place a service key in browser code.

Translation SELECT requires `translation_status='published'` and a published parent, with an authenticated editor/admin identity exception. A restrictive SELECT policy enforces this even if stale permissive or FOR ALL policies remain. The review queue and rejected drafts remain visible to editors; readers cannot directly or indirectly embed unpublished/rejected drafts. Previously published legacy translations stay published and remain usable by the signed-in newsroom, while the public trust RPC continues to require real human review metadata before presenting them as reviewed.

Before editing, browser article projections were inspected in `script.js` (feed and saved-library relation), `newsroom.js`, `map.js`, `shorts.js`, `intelligence-sources.js`, and `admin.js` (core, trust, optional extras, and translation-review relation). All already use explicit columns; no reader-facing source-selection changes were needed. Native tests compare those projections against the allowlists. `SELECT *` is intentionally unavailable to reader/editor browser clients; use safe explicit columns plus the protected metadata RPC. Do not reapply a historical table-wide SELECT grant after activation.

## RPC contracts

### Public: `get_public_article_trust(p_article_id uuid, p_lang text default 'ar') → jsonb | null`

Granted to `anon` and `authenticated`. SECURITY DEFINER, fixed `search_path=pg_catalog,public`, explicit snake_case projection. It returns one story **only when `editorial_status='published'`, `published_at` is nonnull, and `published_at<=now()`**, matching the public SSR eligibility boundary. Missing, review, rejected, undated, and future-dated stories return `null`. It grants no anon SELECT on `articles` and never reads account/preferences/newsletter/contact tables. Its safe `source_url` output prefers the story `url`, falling back to stored feed/source attribution `source_url` only if the story URL is absent/unsafe; storage fields retain their original meanings.

Safe output:

- `id`, `canonical_url` (`/news/{uuid}`), `lang`, `source_language`, `source_name`, safe `source_url`
- `editorial_trust_status`, `trust_needs_review`, `trust_reviewed_at`
- `human_translation_status`, `human_translation_reviewed_at`
- Attributed agency name/narrative and safe account/statement URLs; original-language excerpt
- Current public correction note/time
- `evidence[]`: `publisher`, `evidence_url`, `evidence_type`, `independence_recorded`
- `claims[]`: `claim_text`, effective `status`, `reviewed_at`, `supporting_evidence[]` with publisher/URL (no IDs)
- `history[]`: `changed_at`, `change_type`, `entity_type`, `public_note`
- `reviewed_translation`: human-reviewed `lang`, `title`, `summary`, original `translation_source`, `reviewed_at`, or `null`

Each array is limited to 100 rows. Public confirmed claims are downgraded to unconfirmed when article review is stale or their linked evidence no longer supports a current review. No snapshots, `created_by`, `reviewed_by`, internal IDs/notes, AI scores, or raw row serialization enter public JSON. Article UUID itself is the intended public route identifier.

### Protected: `review_article_trust(p_article_id uuid, p_status text, p_note text, p_translation_status text default null, p_translation_note text default null) → void`

Requires authenticated `app_metadata.role` `editor` or `admin`, a real `auth.uid()`, and the applicable notes/constraints. It performs an atomic story/translation assessment. Service/AI credentials without a human editor JWT cannot certify a story. A service process impersonating a trusted editor remains an authorization/governance concern; no database can prove a human actually read a source.

### Protected: `review_article_translation(p_translation_id uuid, p_decision text, p_note text) → void`

Requires the same editor/admin identity, decision `published` or `rejected`, and an explicit human note. Preserves machine provenance. Missing translation/table yields an explicit error. No sending/email claim is made by this feature.

### Protected: `get_editor_article_trust(p_article_ids uuid[]) → rows`

Granted to `authenticated` but rejects any caller without both a real `auth.uid()` and trusted `app_metadata.role` `editor`/`admin`. SECURITY DEFINER with fixed `search_path=pg_catalog,public`; up to 200 requested IDs and 200 returned rows. Empty arrays return no rows; null/oversized arrays are rejected. Explicit output is `id`, `trust_review_note`, `trust_reviewed_by`, `human_translation_note`, and `human_translation_reviewed_by`. No account rows or raw article serialization. `admin.js` loads safe article fields directly, then merges this protected metadata for its bounded list. A missing/rejected RPC disables trust editing and preserves the core story list; there is no private-column or public-RPC fallback for notes.

## Public integration (parent / SEO worker owner)

On canonical article HTML only, include absolute asset paths and the story UUID:

```html
<link rel="stylesheet" href="/article-trust.css?v=20261115-trust1">
<section id="articleTrust" data-article-id="ARTICLE_UUID" aria-label="المصادر وحالة الادعاءات"></section>
<script src="/article-trust.js?v=20261115-trust1" defer></script>
```

The script lazily POSTs to `/rest/v1/rpc/get_public_article_trust` using the existing anonymous **publishable** project key, `credentials:'omit'`, `cache:'no-store'`, no Authorization/access token, and a timeout. There is no Supabase SDK dependency or private-account request. RPC failure displays uncertainty, never a confirmation badge. URLs reject credentials/non-HTTP(S), and dynamic content uses `textContent` rather than injected HTML.

`window.WRLDLINE_TRUST` exposes `fetchTrust(id,{lang})`, `render(root,record,lang)`, and `mount(root,{lang})` (plus UUID/status/URL validators). The document language event refreshes an existing mounted story. Client-side routers adding the root later must call `mount` explicitly. No source `script.js`, account, forms, service-worker, analytics, or SEO-worker files were edited by this module.

The SSR worker may optionally call the **same public RPC** and render its safe projection before responding. Render via proper HTML escaping, sanitize source URLs, and never embed internal records. Mark a populated, server-rendered root `data-trust-ssr="true"` to preserve that safe markup if the optional lazy refresh fails. SSR must display the same uncertainty, stale-review warning, agency attribution, original/translated distinction, and review times. The RPC `null` result is not a public story; the article route's main safe-public-story RPC and HTTP 404 rules remain the SEO owner's responsibility. SSR page caching must respect withdrawal/corrections; do not rely on cached trust data to authorize private content.

## Admin compatibility

The editor retains existing login/account behavior and navy/gold RTL responsive design. Saved stories link to canonical `/news/{uuid}`. Unsupported `draft` writes were removed because the reported live `articles` status constraint accepts only published/review/rejected. Loading/saving uses explicit known core columns and falls back gracefully if the trust migration is not active. Optional old content-kind/sponsorship/media/AI metadata is probed separately; missing optional columns do not break core editing and their unsupported controls are disabled. Those optional fields are not silently written to the known live schema. New stories set their recorded source language to their authored language; source identity edits retain the real source name rather than resetting it to a generic newsroom label. Saving an unchanged correction preserves its original correction timestamp. Source URL is saved to `source_url` as well as the legacy `url` field.

## Local validation

```sh
node --check admin.js
node --check article-trust.js
node --test tests/editorial-trust.test.js tests/taxonomy.test.js
bash tests/editorial-trust-db.sh
```

The JS tests use mocked fetch/DOM/RPC only. SQL tests create a unique temporary PostgreSQL cluster under `/tmp`, listen only on its private Unix socket (no TCP), use isolated fictional publishers/URLs, and remove it on exit. They accept no production URL or database credentials. PostgreSQL binaries (`pg_config`, `initdb`, `pg_ctl`, `psql`) must be available. Fixtures deliberately inherit table-wide authenticated grants, PUBLIC/anon grants, private column grants, the older parent-only translation read policy, and an unknown broad permissive policy. Tests cover safe signed-in projections, protected metadata role/identity/bounds, private-column and SELECT-star denial, direct/embedded translation draft denial, editor/service reads, snapshot preservation, no bulk demotion, syndication, claim evidence, disputed claims, translation gates/provenance, correction immutability, language-only invalidation while already unconfirmed/pending, future/undated public boundaries, validated story/feed fallback, reapplication security, and absence of optional old tables.

## Activation blockers / handoff

1. Parent must review and apply the **complete revised** `20261115030000_editorial_trust.sql` after inspecting the actual live schema and existing triggers/policies. Reader privacy is in the same transaction as new trust columns; no separate `20261115031000_reader_projection_security.sql` is required or created. Deploy the compatible admin list/RPC-loading change and refresh PostgREST's schema cache. This task made **no remote SQL, deployment, Git operation, MCP operation, or production write**.
2. Parent must independently remove the existing anonymous article INSERT policy and preserve least-privilege public article projection. This migration preserves articles/account RLS owned by other agents, but deliberately restricts article/translation SELECT ACLs and hardens translation SELECT RLS. Do not grant table-wide SELECT back to `authenticated`, `anon`, or `PUBLIC`.
3. Parent/SEO owner must attach the public CSS/script/root on `/news/{uuid}` and optionally SSR the safe RPC. Until attached and migrated, the new public layer is not active on the live website.
4. Supabase/PostgREST schema cache must discover the RPCs after migration; deployment CSP must allow the known project HTTPS endpoint. Existing ingestion/translation workers that still auto-confirm counts or auto-publish new machine translations will receive deliberate database rejections and must be adjusted to review workflows (without calling new AI here).
5. Editors must provide actual source URLs, genuine provenance groups, original agency statements/accounts, claim assessments, and explicit translation review. No fabricated source or automatically verified agency roster was seeded.
6. Old snapshots remain only in protected history; there is no retroactive claim that older unlogged changes are immutable. Source language accuracy and review-role issuance are editorial/administrator responsibilities.

### Validation results (local, 2026-11-15)

The targeted privacy revision changed only `supabase/migrations/20261115030000_editorial_trust.sql`, the trust/list-loading portions of `admin.js`, `tests/editorial-trust.test.js`, `tests/editorial-trust-db.sh`, `tests/editorial-trust-fixture.sql`, `tests/editorial-trust-db.sql`, and this document. No other browser read files were changed; parent-owned SDK/logout/auth/privacy/account work and port 4173 were untouched. The SEO worker's own original-source ordering fix remains the parent/worker owner's responsibility.

`node --check` passed for `admin.js` and `article-trust.js`. The isolated JS run passed **23/23 tests** (15 trust tests and 8 unchanged taxonomy tests). The PostgreSQL 16 fixture run passed **85 security/behavior assertions**, plus explicit reapplication ACL/RLS checks and a second fresh-schema case without prior audit/translation tables. The clusters were cleaned up after validation. No live browser/production behavior was claimed or tested, and no Git operation was used for this revision.
