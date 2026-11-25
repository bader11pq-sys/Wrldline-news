# Worldline AI Design Agent — Implementation Plan

**Repository:** `bader11pq-sys/Wrldline-news`  
**Default branch:** `main`  
**Status:** Architecture and phased implementation plan  
**Operating mode:** Autonomous discovery, analysis, implementation, testing, and controlled deployment  
**Scope:** Entire public website and its responsive experiences

## 1. Mission

Build a first-party AI design and frontend engineering system for Worldline News. It continuously discovers high-quality editorial, news, magazine, data-visualization, and digital-publishing interfaces; captures and analyzes them; stores reusable design insights; evaluates Worldline News; proposes and implements original improvements; and validates the result before deployment.

The agent must learn from references, not copy websites. It may reproduce general interaction patterns and design principles, but must not copy protected text, logos, illustrations, proprietary assets, or distinctive page compositions wholesale.

## 2. Existing repository facts and constraints

The repository is a static HTML/CSS/JavaScript site with no build step documented in README. It already uses Supabase, Cloudflare Workers, GitHub Actions, and a substantial collection of public pages and frontend modules.

Existing important areas include:
- Public site: `index.html`, article/news pages, sections, topics, markets, map, history, explainers, newsletter, and policy pages.
- Editorial/admin: `admin.html`, `admin.js`, newsroom and editorial modules.
- Existing design layers: `style.css`, `wrld.css`, `design.css`, `front-page.css`, `homepage-polish.css`, `site-enhancements.css`, `site-shell.js`, and related files.
- Backend: Supabase migrations and Edge Functions; Cloudflare Workers under `cloudflare/workers/`.
- Automation and checks: GitHub Actions under `.github/workflows/` and Python tests under `tests/`.

The agent must preserve all existing behavior, including authentication, account preferences, paid subscription flows, editorial permissions and approvals, article/source attribution, verification labels, translations and their review states, map/history data, privacy/consent, analytics consent, offline behavior, service-worker caching, SEO, and bilingual Arabic/English support.

**Out of scope:** news ingestion, source scheduling, automatic editorial publication, AI classification/translation policy, newsroom staffing, and editorial approval rules. The design agent must not change these systems as a side effect of visual work.

## 3. Target architecture

### A. Discovery and reference catalog
- Maintain a curated, configurable list of reference websites and design galleries.
- Prioritize real editorial products: international and Arabic newsrooms, financial publications, magazines, investigative outlets, and data journalism.
- Discover candidate URLs through approved search/gallery sources; apply domain allowlists, rate limits, robots.txt/terms checks, and deduplication.
- Store URL, source domain, capture timestamp, page category, viewport, language/direction, and provenance.
- Do not crawl behind logins, bypass paywalls, evade bot controls, or collect personal data.

### B. Browser capture service
- Use Playwright with a managed browser runtime (Cloudflare Browser Rendering where supported, otherwise a dedicated controlled runner).
- Capture full-page and viewport screenshots at standard desktop, tablet, and mobile widths.
- Record page title, visible structural landmarks, navigation hierarchy, typography observations, color samples, spacing, image aspect ratios, and interaction notes.
- Capture Arabic RTL and English LTR examples separately.
- Respect timeouts, per-domain concurrency, request budgets, and asset-size limits.

### C. Multimodal design intelligence
- Use a vision-capable model for screenshot understanding and a code-capable model for implementation planning.
- Provider adapter design: Gemini as the primary multimodal provider; Groq as a configurable fallback where its model supports the required task. Provider health, quota, cooldown, model ID, latency, and failure reasons must be logged. Do not assume a provider is available just because a key exists.
- Convert each capture into a structured design observation: page type, layout regions, hierarchy, typography, palette, spacing, density, responsive behavior, accessibility observations, and reusable interaction patterns.
- Compare observations across multiple independent references and identify recurring patterns rather than copying one source.
- Generate a design brief with rationale, trade-offs, affected pages, and confidence.

### D. Design memory and asset provenance
- Store captures and derived observations with source URL, capture date, viewport, language, model/version, and rights/provenance notes.
- Store design tokens and reusable patterns, not copied site content.
- Keep reference screenshots separate from Worldline production assets.
- Add retention and storage budgets; deduplicate captures and expire stale captures according to policy.

### E. Worldline site auditor
- Crawl the local deployed site and enumerate public routes from sitemap and known page registry.
- Inspect representative page templates: homepage, article, category/section, topic, search, map, markets, history, newsletter, account, and policy pages.
- Test mobile and desktop layouts, RTL/LTR, keyboard navigation, semantic landmarks, contrast, image loading, console errors, broken links, and horizontal overflow.
- Compare current screenshots with approved baselines and identify regressions.
- Never use real user accounts, real payment transactions, or production editorial actions during tests.

### F. Code implementation agent
- Work from a constrained file/path allowlist for each task.
- Prefer existing components, tokens, and CSS layers; consolidate duplicate styles only after dependency analysis.
- Make small, reversible, task-scoped changes.
- Preserve existing HTML IDs, data attributes, API contracts, storage keys, route semantics, and event names unless a separately tested migration is explicitly planned.
- Do not edit Supabase schema, Cloudflare secrets/configuration, editorial policies, ingestion/classification workers, or payment logic for a visual task.
- No secrets or production data may enter model prompts, logs, screenshots, or commits.

### G. Quality gates and deployment controller
- Run existing repository tests and relevant new visual/accessibility tests.
- Run link, asset, console, responsive, RTL/LTR, and route smoke tests.
- Compare screenshots at agreed breakpoints and fail on material unintended regressions.
- Check protected workflows and files remain unchanged for design-only tasks.
- Publish a concise change report with before/after screenshots, changed files, tests, risks, and rollback reference.
- Autonomous deployment is allowed only when all required checks pass. If a gate fails, stop, revert the candidate changes, and report the failure; never bypass a failing check.
- Keep a known-good deployment/commit reference and a documented rollback procedure.

## 4. Runtime and data model

Reuse the existing Cloudflare/Supabase/GitHub infrastructure where it fits. Do not add a second orchestration platform without a measured need.

Suggested logical records (physical schema to be finalized after inspecting current migrations):
- `design_reference_sources`: approved source domains, categories, crawl policy, enabled state.
- `design_reference_captures`: URL, metadata, viewport, locale, screenshot storage key, capture time, provenance.
- `design_observations`: structured model output, model/version, confidence, extracted design patterns.
- `design_audits`: target route, audit timestamp, findings, severity, screenshots, baseline version.
- `design_tasks`: task brief, scope allowlist, status, branch/commit, test results, deployment state.
- `design_runs`: schedule, provider usage, duration, cost estimate, result, errors.
- `design_baselines`: approved visual baselines per route, viewport, and locale.

All records must be tenant/project scoped even if initially used by one site. Store screenshots in controlled object storage, not as large database blobs. Keep credentials in Cloudflare/Supabase/GitHub secret stores only.

## 5. Autonomous operating cycle

1. Scheduled discovery checks approved design sources and curated editorial sites.
2. The capture service takes desktop/mobile and Arabic/English reference snapshots.
3. The vision model creates structured observations and groups repeated patterns.
4. The site auditor captures Worldline's current state and ranks issues by user impact, accessibility, responsiveness, and consistency.
5. The planner creates a limited implementation task with explicit routes and files in scope.
6. The coding agent modifies the existing site using the established design system.
7. Automated checks run, including existing project tests and visual comparisons.
8. If checks pass, the deployment controller publishes the change and records the commit/baseline. If checks fail, it reverts the candidate and records a diagnostic.
9. The agent monitors the deployed routes for regressions and reports outcomes.

Suggested initial cadence: weekly reference discovery; nightly site audit; implementation runs only for high-confidence, bounded improvements. Cadence must be configurable and rate-limited. Do not run expensive screenshot/model work every minute.

## 6. Implementation phases

### Phase 0 — Baseline and protection
- Inventory routes, CSS/JS dependencies, scripts, workflows, current production URL, and Cloudflare/Supabase boundaries.
- Run the existing test suite and record baseline screenshots at mobile/tablet/desktop.
- Identify protected paths and existing design-token sources.
- Add a design-agent operating policy and rollback checklist.
**Exit criteria:** route inventory, test baseline, protected-file map, and no production changes.

### Phase 1 — Reference discovery and capture
- Implement source registry, URL validation, crawl policy, Playwright capture, screenshot storage, and metadata.
- Add desktop/mobile capture and Arabic/English tagging.
- Add deduplication and per-domain limits.
**Exit criteria:** repeatable captures with provenance and no policy violations.

### Phase 2 — Visual intelligence and design memory
- Integrate Gemini vision adapter and configurable Groq fallback.
- Define a versioned JSON schema for observations.
- Add clustering and cross-reference synthesis.
- Build a searchable catalog of design patterns and screenshots.
**Exit criteria:** structured observations can be reproduced, inspected, and traced to sources.

### Phase 3 — Worldline visual audit
- Crawl all public routes and classify page templates.
- Add responsive, RTL/LTR, accessibility, broken-link, asset, and console checks.
- Generate prioritized audit reports and visual baselines.
**Exit criteria:** stable audit coverage with no changes to production behavior.

### Phase 4 — Controlled code agent
- Connect the planner to GitHub repository contents and commits.
- Enforce task-specific file allowlists and protected paths.
- Implement one low-risk pilot improvement on a single page template.
- Run the full relevant regression suite.
**Exit criteria:** a reproducible improvement with test evidence and rollback.

### Phase 5 — Autonomous deployment and monitoring
- Enable scheduled task selection and automatic deployment after all quality gates pass.
- Add failure circuit breakers, rate/cost limits, deployment health checks, and automatic rollback.
- Publish run summaries and artifact links.
**Exit criteria:** multiple successful autonomous cycles with no critical regression.

### Phase 6 — Full-site continuous improvement
- Expand coverage to every public template and responsive state.
- Add design consistency scoring and trend reports.
- Optimize only from measured user experience, accessibility, and performance evidence.
**Exit criteria:** all route families covered and continuous improvement is observable and reversible.

## 7. Non-negotiable safety rules

1. Never change news ingestion schedules, news sources, editorial verification, or publication rules.
2. Never publish editorial content or alter editor-in-chief approval requirements.
3. Never change Supabase RLS, authentication, subscriptions, payment flows, or service-role handling as part of design work.
4. Never expose secrets, user data, private account pages, or production database records to reference capture or model providers.
5. Never deploy when tests fail, required evidence is missing, or a protected file changed unexpectedly.
6. Never copy another publisher's branding, text, photography, or proprietary layout verbatim.
7. Keep Arabic RTL and English LTR behavior fully supported.
8. Preserve SEO metadata, accessibility, consent, privacy, offline behavior, and mobile performance.
9. Use idempotent jobs, concurrency limits, quotas, timeouts, and circuit breakers.
10. Every run must be traceable to its sources, model version, task scope, commit, test results, and deployment result.

## 8. Required configuration (names only; no values in source)

- `GEMINI_API_KEY` — primary multimodal analysis.
- `GROQ_API_KEY` — optional compatible fallback.
- Browser Rendering credentials/configuration according to the selected Cloudflare binding.
- Screenshot object-storage binding and access policy.
- GitHub App/token with minimum repository content/workflow permissions required by the implementation.
- Optional model IDs, crawl allowlist, schedule, max pages/run, max screenshots/run, and budget limits.

No credentials are to be added to this document, frontend files, Git history, or logs.

## 9. First execution checklist

- [ ] Inspect all current workflows and deployment configuration.
- [ ] Enumerate all 554 repository paths and identify the actual public route set.
- [ ] Inspect existing tests and run the baseline suite.
- [ ] Inspect current Cloudflare Worker bindings and Supabase migrations before choosing physical storage/schema.
- [ ] Verify current live domain and deployment target.
- [ ] Add protected-path policy and visual baseline tooling.
- [ ] Start Phase 1 only after Phase 0 evidence is recorded.

## 10. Definition of success

The agent is successful when it can independently discover and analyze diverse design references, explain why a proposed change improves Worldline, implement original improvements in the existing codebase, preserve all editorial/product behavior, pass visual and functional regression tests, deploy safely, and roll back automatically when production health degrades.
