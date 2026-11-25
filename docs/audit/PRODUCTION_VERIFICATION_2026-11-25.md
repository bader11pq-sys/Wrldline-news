# Production verification — 2026-11-25

Read-only verification of the live site at `https://al-ghaib.us.ci`. No writes, no logins, no deploys.
Reproduce with:

```bash
python3 tests/production-surface-check.py           # 13 surfaces, AR/EN, mobile/desktop
node scripts/verify-deployment.mjs                  # main vs Pages vs Worker
node scripts/probe-backend.mjs --expect=absent      # backend objects the merges expect
```

Context: `main` is `0ed5bee` and GitHub Pages serves exactly that commit. Article, section, RSS and
sitemap pages come from a hand-deployed Cloudflare Worker whose bundle matches no repository commit
(see `DEPLOYMENT_ARCHITECTURE.md` §5). This report therefore distinguishes "the code is right" from
"production is running the right code".

## 1. Surface matrix

| Surface | Status | Text | Links | hreflang | JSON-LD | H-overflow | Console |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Home, Arabic, 390×844 | 200 | 11,331 | 102 | 2 | — | 0 | clean |
| Home, English, 1440×900 | 200 | 20,122 | 102 | 2 | — | 0 | clean |
| Article, Arabic, 390×844 | 200 | 2,773 | 26 | 0 | `NewsArticle` | 0 | clean |
| Article, English, 1440×900 | 308 → Arabic | — | — | — | — | — | by design |
| Section politics, Arabic, 390 | 200 | 8,644 | 77 | 3* | — | 0 | CSP beacon blocked |
| Section economy, English, 1440 | 200 | 9,746 | 77 | 3* | — | 0 | CSP beacon blocked |
| Countries directory, 390 | 200 | 4,358 | 286 | 2 | — | 0 | clean |
| Country profile `?c=SAU`, 1440 | 200 | 14,262 | 108 | 0 | — | 0 | clean |
| Economy dashboards, 390 | 200 | 8,100 | 57 | 2 | — | 0 | clean |
| Global news map, 1440 | 200 | 5,858 | 61 | 2 | — | 0 | clean |
| Personalised feed, signed out, 390 | 200 | 9,489 | 86 | 2 | — | 0 | clean |
| Newsroom desk, signed out, 1440 | 200 | 467 | 29 | 0 | — | 0 | clean |
| Dossier, 390 | 200 | 13,448 | 96 | 0 | `AnalysisNewsArticle` | 0 | clean |

\* alternates exist in this branch, not yet in production (production currently emits none on section
pages). Text and links are live measurements.

Feeds and sitemaps, measured directly:

| Resource | Result |
| --- | --- |
| `/rss.xml` | 200, 195 KB, 100 items |
| `/atom.xml` | 200, 208 KB, 100 entries |
| `/news-sitemap.xml` | 200, 65 URLs (48-hour window) |
| `/article-sitemap.xml` | 200, 25 child sitemaps — but returned `503` on two of five attempts (backend statement timeout) |

## 2. Feature status

| Feature | Verdict | Evidence |
| --- | --- | --- |
| Homepage feed | **Functional** | one `recent_v3` request, early-feed adoption, 24 cards, no skeletons, no console errors, LCP element at 1.36 s |
| News index `/news/` | **Functional** | 44 KB rendered, 77–100 story links, pagination links, editorial lanes |
| Article pages | **Functional, stale bundle** | 200, `NewsArticle` + breadcrumbs, 14 paragraphs; missing `quality.css`; served from an untraceable Worker build |
| Section pages | **Functional** | 200, 8.6–9.7 KB of text, 77 links, language switch works |
| Country directory | **Functional** | 249 country links rendered |
| Country profile | **Functional** | 14 KB of profile text for `SAU`, 108 links |
| Economic dashboards | **Functional** | 200, 8.1 KB text, charts mount, zero console errors |
| Global news map | **Functional** | 200, trust/risk layers present, 61 links |
| Personalised feed (signed in) | **Not functional** | backend objects absent (`PGRST202`/`PGRST205`/`42703`); signed-out page falls back to the standard feed |
| Newsroom desk | **Not functional** | `#newsroomDesk` hidden for signed-out visitors; for editors the three RPCs still 404 because the desk migration is unapplied |
| Search / language switch on articles | **Partial** | `?lang=en` on an article 308-redirects to the Arabic canonical; articles are Arabic-only by design, but a reader clicking "English" on an article is bounced back without explanation |
| SEO metadata | **Mostly functional** | home has 7 OG tags, robots `index,follow,max-image-preview:large`, 1 JSON-LD block; `/news/` and section pages have OG and canonical but no `ItemList`/`CollectionPage` structured data; article pages have `NewsArticle` but no language alternates (correct, see §4) |

## 3. Defects found, and what this branch does about them

| Defect | Severity | Status |
| --- | --- | --- |
| Live Worker bundle untraceable; no `/__version` | Critical (cannot answer "what is deployed") | Fixed in branch: `/__version`, `X-Wrldline-Commit`, deploy/verify/rollback workflows |
| Article pages never load `quality.css`, so the 24 px target floor from #126 is absent on the most-read mobile surface | Medium | Fixed in branch: article template now links `quality.css`; guarded by `tests/worker-asset-pins.test.js` |
| CSP blocks the Cloudflare analytics beacon, so every Worker page logs a console error and analytics is silently lost | Medium | Fixed in branch: `script-src` allows `static.cloudflareinsights.com`, `connect-src` allows `cloudflareinsights.com`; inline and wildcard script remain disallowed |
| Section and news-index pages emit no `hreflang` alternates despite genuinely having both editions | Medium | Fixed in branch for section and index pages; article pages intentionally excluded |
| `/article-sitemap.xml` intermittently 503s on backend timeout | Medium | Not fixed: the Worker has no retry on a single slow RPC. Documented; needs a decision (retry budget vs. longer timeout) rather than a speculative patch |
| `/news/` and section pages lack collection structured data | Low | Not fixed in this branch; proposed as the next SEO item |
| Article page cannot be read in English | Low (product decision) | Documented: the Worker 308-redirects any article query string to the clean canonical URL |

## 4. Language behaviour

- Static pages (`/`, `/countries.html`, `/economy.html`, `/news-map.html`, dossiers, `/for-you.html`)
  render both editions; `?lang=en` produces `lang="en" dir="ltr"` and roughly 1.8× the text of the
  Arabic home, since the English edition carries longer labels.
- Worker pages: `/news/` and `/section/*` render both editions; `/news/<id>` is Arabic-only and
  redirects to the canonical URL when any query string is present.
- Direction and typography are correct on both: no horizontal overflow at 390 px on any surface, and no
  RTL bleed into the English edition.

## 5. Mobile and desktop

- 390×844: no surface overflows horizontally (`scrollWidth - clientWidth` = 0 everywhere).
- 1440×900: same, and the desktop grids keep their column counts.
- Console: clean on every Pages-served surface; the only error on Worker pages is the blocked analytics
  beacon described above.

## 6. What this report cannot verify

- **Signed-in flows** (personalised feed, desk, reading history, consent) require a test account. The
  missing backend objects make them fail regardless, so they are marked not functional on the strength
  of the probes, not of a click-through.
- **Worker bundle provenance**: `/__version` does not exist yet in production, so there is no
  authoritative statement of the deployed commit. The mismatch evidence is behavioural (asset pins).
- **Analytics delivery**: blocked today; cannot be measured until the CSP fix is deployed and approved.
