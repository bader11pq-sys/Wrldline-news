# Worldline AI Design Agent — Phase 0 Baseline Audit

**Repository:** `bader11pq-sys/Wrldline-news`  
**Branch inspected:** `main`  
**Audit date:** 2026-11-25  
**Purpose:** Establish a verified, non-invasive baseline before enabling autonomous design changes.

## 1. Repository inventory

The recursive Git tree contained 555 entries at the time of inspection:

| Area | Count / finding |
|---|---:|
| HTML pages | 57 |
| CSS files | 36 |
| JavaScript files | 114 |
| Supabase migrations | 84 |
| GitHub Actions workflows | 11 |
| Python browser/test scripts | 17 |
| Node/JS/TS test files | 48 |
| Frontend architecture | Static HTML/CSS/JS; no root package.json/build step identified |
| Existing infrastructure | Supabase, Cloudflare Workers, GitHub Actions, GitHub Pages |

The site already has multiple design layers, including `style.css`, `wrld.css`, `design.css`, `front-page.css`, `homepage-polish.css`, `site-enhancements.css`, `home.bundle.css`, and `site-shell.js`. The agent must map actual imports and selector ownership before consolidating or replacing any of them.

## 2. Existing route families

The HTML inventory includes the homepage, article and section experiences, account and subscription pages, editorial/admin pages, daily briefing, analysis and dossier pages, map and markets, history encyclopedia pages, rights/corrections, newsletter, shorts, and policy/about pages.

The route inventory must be refined from internal links and sitemap data in Phase 0; file count alone is not a complete route-coverage guarantee.

## 3. Existing platform boundaries

- **Supabase:** 84 migrations are present. Treat schema, RLS, Auth, subscription, editorial, publication, and news-data migrations as protected.
- **Cloudflare:** Workers exist under `cloudflare/workers/`. Worker code, bindings, secrets, and deployment configuration are protected during visual tasks.
- **GitHub Actions:** 11 workflows exist, including production checks, ingestion/bot, breaking-news, AI backlog, health checks, backups, and security workflows.
- **GitHub Pages:** The deployment run associated with commit `6e3198c06c44cec3227cc775fe2f2197ffeff725` completed successfully.
- **Newsroom automation:** News ingestion, source scheduling, classification, translation, breaking-news selection, and editorial publication behavior are explicitly out of scope for this design agent.

## 4. Protected paths and behavior

Until a separately reviewed migration is approved, a design task must not modify:

- `supabase/migrations/**`, Supabase functions/configuration, RLS policies, or database contracts.
- `cloudflare/workers/**`, Wrangler configuration, secrets, or worker bindings.
- News ingestion, source-monitoring, classification, translation, breaking-news, and editorial scheduling scripts/workflows.
- Authentication, account preferences, subscription/Stripe, billing, and payment code.
- Editorial authorization, publication gates, admin permissions, source attribution, correction, and verification logic.
- Service-worker/offline behavior, consent, privacy, analytics collection, SEO metadata, and canonical URLs.
- Existing DOM IDs, route paths, data attributes, storage keys, API contracts, event names, and language/direction semantics.

Initial code-agent write allowlist should be limited to the new design-agent implementation area, audit/report artifacts, dedicated visual-test fixtures, and explicitly approved presentation-only files. The agent must reject a task whose requested change crosses a protected boundary.

## 5. CI baseline and failure diagnosis

Workflow run: [WRLDLINE Production Readiness #1195](https://github.com/bader11pq-sys/Wrldline-news/actions/runs/45625168449)

- The GitHub Pages deployment run for the same commit succeeded.
- The production-readiness browser job failed in `tests/newsroom-edition-browser.py` at the assertion for the primary navigation link to `sections.html`.
- The test expected the English label `All sections`, while the current homepage markup intentionally renders the bilingual label `استكشف / Explore`.
- The homepage navigation unit test separately verifies that `sections.html` is the final primary-navigation destination. The failure is therefore a stale browser-test text expectation, not evidence that the route is missing.
- The earlier reliability-browser script completed its reported consent, mobile, layout-failure, and anonymous-account checks successfully.
- Because the browser workflow uses `set -e`, later browser scripts did not execute after the newsroom-edition failure. The complete browser suite is **not yet green**.

A narrow test-only correction updates the browser assertion to the currently rendered `Explore` label. It does not change site markup, CSS, JavaScript, data, or production behavior. The full workflow must be rerun before declaring the baseline green.

## 6. Phase 0 exit criteria

- [x] Confirm repository, default branch, and write permission.
- [x] Inventory tracked HTML/CSS/JS, migrations, workflows, and test families.
- [x] Identify critical platform boundaries and protected behavior.
- [x] Identify the current CI blocker and its exact failing assertion.
- [ ] Rerun the complete production-readiness workflow after the test-only correction.
- [ ] Capture desktop/mobile screenshots for representative templates and both Arabic RTL / English LTR.
- [ ] Build a verified route registry and CSS/JS dependency map.

## 7. Next implementation sequence

1. Finish the Phase 0 CI and visual baseline without changing production behavior.
2. Add the design-agent policy, path allowlist, run ledger, and cost/rate limits.
3. Implement reference discovery and Playwright capture as an isolated service.
4. Add the Gemini-first multimodal provider adapter with capability-checked Groq fallback.
5. Add structured design observations and provenance-aware design memory.
6. Only then permit a bounded pilot code change.

**Safety invariant:** Autonomous means the agent can plan and execute approved, reversible changes without repeated prompting. It does not mean bypassing tests, modifying protected newsroom/backend systems, or deploying a failing build.
