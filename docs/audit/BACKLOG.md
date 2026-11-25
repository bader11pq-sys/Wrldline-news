# Prioritized backlog

Rules: ingestion stays stopped; no auto-publishing of AI output; pricing/payment untouched; risky changes need review.

## P0
1. Wire `_shared/ai-router.mjs` into `translate-articles` first (draft-only, lowest risk), then `classify-news`; add `ai_usage_log` migration (with rollback) for usage/cost. Review + staging required.
2. Fix `ai-provider-healthcheck` cron authorization (use DB-verified secret, do not weaken checks).
3. Source health triage: 206 sources flagged; configure admin alerting.

## P1
4. Escape audit of `innerHTML` call sites (script.js, history-app.js, newsroom-page.js, home.js).
5. JSON-LD (WebSite, Organization, BreadcrumbList, CollectionPage) on static pages; hreflang for ar/en.
6. Lighthouse and axe accessibility runs in CI against a static server; fix RTL/focus issues found.
7. Real restore drill against a staging DB.
8. Source-reliability scoring surfaced in editor UI (data already tracked in source monitor).

## P2
9. Country profile pages generated from history data; economic dashboards from markets data.
10. Personalised feed ranking using follows (client-side first, consent-based).
11. Split large scripts; add lint/format tooling and a local `npm test` wrapper.
12. Newsletter sender go-live once provider configured.
