# Public news SSR and discovery

## Scope and deployment state

This module adds genuine initial HTML for canonical public article URLs at `https://al-ghaib.us.ci/news/{uuid}` without migrating the static GitHub Pages site. It publishes the authorized `summary`, not a scraped full story. The existing dark navy/gold newsroom design, Arabic RTL layout and responsive tokens are reused from `wrld.css`; English article text gets LTR layout. Account, saved-library, administrative, audio authorization and service-worker behavior are not replaced by the worker.

**The implementation and SQL are local until the parent activates them.** No commits, pushes, remote SQL, MCP operations, deployment, production writes, new AI calls or message sending were performed by this module. Other agents may modify shared files; this module owns only the files listed below.

## Files

| File | Role |
| --- | --- |
| `cloudflare/workers/wrldline-public/worker.js` | Self-contained Cloudflare module Worker, SSR, discovery documents and narrow routing validation. |
| `supabase/migrations/20261115010000_public_news.sql` | Four bounded published-only SQL RPCs, partial indexes, exact execution grants; not applied by this module. |
| `public-news.css` | Public article/index layout using the existing dark theme. |
| `public-news.js` | Optional canonical copy/share controls; no account, AI or full-story retrieval. |
| `script.js` | Published-only standalone-page link in the existing modal and its canonical share target. Legacy modal query/history, saved articles and authenticated audio controls are retained. |
| `share.js` | Validates and honors explicit `data.url` and element `data-share-url`; native file/URL sharing and copied image captions retain the canonical URL. |
| `tests/public-news.test.js` | Native Node tests, data-URL ESM loading and isolated mock Supabase/browser fixtures. |
| `docs/public-news-seo.md` | This module's integration and activation notes. |

`article-trust.js`, `article-trust.css`, analytics files, the trust migration, robots, the main sitemap and origin navigation belong to other agents/the parent. They are included or referenced, not edited here.

## Environment and Cloudflare routing

Required Worker bindings are the public `SUPABASE_URL` (`https://vmaxbnogmmfyrcucapnq.supabase.co`) and `SUPABASE_ANON_KEY` (the existing **publishable** key, not a service-role secret). `sb_publishable_*` keys are sent only in `apikey`; they are not incorrectly used as Bearer JWTs. Requests never forward visitor cookies or Authorization to Supabase. The canonical public origin is an explicit source constant, not inferred from a visitor-controlled Host header.

Optional nonsecret binding: `PUBLIC_TRUST_ENABLED="true"`. Enable this only after the credibility owner's `get_public_article_trust(uuid,text)` RPC is applied and tested. It adds a server-rendered, human-review-stamped credibility summary. Its failure does **not** remove a valid public article: the SSR remains conservative and the optional browser enhancement may refresh it. Without this binding, initial HTML explicitly says human confirmation has not been established on this page; a legacy `verification='confirmed'`, AI confidence, a breaking label or a source count is never treated as human review.

Deploy `worker.js` as an ES module Worker. The parent confirmed an existing proxied CNAME from `al-ghaib.us.ci` to GitHub Pages; no DNS move or origin replacement is needed. Attach only these scoped routes (Cloudflare cannot use an infix wildcard):

```text
al-ghaib.us.ci/news
al-ghaib.us.ci/news/*
al-ghaib.us.ci/news-sitemap.xml*
al-ghaib.us.ci/article-sitemap*
al-ghaib.us.ci/rss.xml*
al-ghaib.us.ci/atom.xml*
```

The worker accepts only the exact document endpoints below and rejects malformed suffixes with 404. Unowned paths, if accidentally routed to this worker, pass through to the existing origin unchanged. Do not attach a catch-all production route. The separate `api.al-ghaib.us.ci` API domain is untouched.

| Endpoint | Response |
| --- | --- |
| `/news/` and `/news/?page=N` | SSR index, 50 real article links per page, ordinary previous/next anchors. |
| `/news/{uuid}` | SSR summary, source attribution/link, original publication time, actual authors when recorded, correction, per-page metadata and NewsArticle JSON-LD. |
| `/article-sitemap.xml` | Sitemap index covering the published valid-date archive. |
| `/article-sitemap-1.xml`, `/article-sitemap-2.xml`, etc. | Numbered regular sitemaps, 1,000 UUID-keyset records each. |
| `/news-sitemap.xml` | At most 1,000 entries with original publication in the last 48 hours; older entries disappear. |
| `/rss.xml` | Up to 100 recent summary items within seven days, canonical link/GUID, original publication and source. |
| `/atom.xml` | Up to 100 recent summary entries within seven days, canonical IDs, publication/correction dates and related source links. |

GET and HEAD are supported; owned-route mutations return 405 without any backend write. A malformed UUID or absent/unpublished/undated/future article returns a real 404 with `noindex`. Backend failures return 503 with `noindex`, `Retry-After: 60`, no-store, and no private backend error payload. Case, trailing slash and tracking-query article variants redirect to the canonical UUID URL only after a public record resolves.

## Database boundary and schema assumptions

All four RPCs are `SECURITY DEFINER` with `search_path=pg_catalog`, qualified `public.articles` references, explicit output fields, and `editorial_status='published'` plus a nonnull, nonfuture original publication date. Default PUBLIC execution is revoked inside the migration transaction, and exact execution is granted to `anon` and `authenticated`. No public table-wide SELECT or table-mutation grants/policies are added. Partial indexes cover public UUID and original-publication ordering.

The full public projection contains only:

```text
id,title,summary,image_url,author,lang,category,country,event_country,
source_language,source_name,source_url,url,published_at,is_breaking,
verification,correction_note,corrected_at
```

`author` is converted with `to_jsonb(a.author)`, supporting a live text/array/JSON author value without inventing a person. Summary output is capped at 12,000 characters, titles at 1,000 and correction text at 4,000. The worker repeats the field allowlist and never embeds a raw RPC row. Internal confidence, ingestion/error diagnostics, received/fetched timestamps, account rows, actor IDs and scraped full text are not projected.

The sitemap RPC returns only `id,published_at,corrected_at`. The index RPC returns only `page,after_id`, using UUID ascending order and the last UUID of the preceding 1,000-row chunk. Index boundaries are also explicitly paginated in 1,000-row RPC calls, rather than assuming PostgREST's response cap covers the whole index. The index protocol supports the sitemap-standard limit of 50,000 sitemap documents; overflow or a truncated/malformed projection fails closed rather than silently declaring incomplete coverage. Individual SQL calls have explicit LIMIT clauses; no arbitrary client column selection or dynamic SQL is accepted.

Separate crawl requests are not one database snapshot. A concurrent addition/removal can change numbered boundaries between the index and a page request, as with other dynamic sitemaps; fresh requests converge on the current publication set. UUID keysets avoid timestamp ties and do not skip an archive merely because it has more than 1,000 records. Responses deliberately use no-store and no edge cache, so rejected/corrected records do not linger in worker caching. External search-engine caches are outside this module's control.

The migration assumes the parent's supplied live article fields/types and timestamp-compatible `published_at`/`corrected_at`. Its PostgreSQL parse check is not a live database execution, RLS test or proof that legacy migrations match production. Apply this **one migration**, not every older repository migration blindly.

## HTML, enhancements and sanitization

Head metadata, H1, summary paragraphs, source links, article index anchors and JSON-LD are produced before any JavaScript. No auth guard, browser Supabase SDK or session loader is included. Only a normal link to the protected account page is shown.

NewsArticle uses the original `published_at`, never `received_at`. A valid later `corrected_at` supplies `dateModified`. Authors are omitted when absent, and an image is emitted only for an actual valid HTTP(S) `image_url`; there are no invented photos or fake reporters. Atom's feed-level WRLDLINE organization author identifies the feed publisher, not an invented article reporter. All copy is attributed summary content; source URLs are retained, and missing source links are disclosed rather than fabricated.

Text/attribute escaping, HTTP(S) URL validation without credentials/backslashes/whitespace, stripped control/bidi-injection characters, escaped XML, JSON-LD `<>&` and line-separator encoding, a restrictive CSP, nosniff and safe external-link attributes are applied. Supabase requests have an eight-second per-call timeout within a twenty-second route budget and response-size/row-count checks. Private error bodies never enter rendered HTML or logs.

Public detail markup includes `article[data-article-id][data-category][data-audience-article]` for the consent-aware audience module, deferred `/analytics-config.js` and `/analytics.js`, deferred `/article-trust.js`, `/article-trust.css`, and `#articleTrust[data-article-id][data-trust-ssr="1"]`. The SSR trust marker preserves safe initial content if the optional trust refresh fails. Human confirmation requires the safe RPC's matching article, explicit completed human review and timestamp; translated content additionally requires recorded human translation review. Default/legacy AI labels cannot certify it.

## Local verification

Run from `/home/ubuntu/Wrldline-news`:

```bash
node --test tests/public-news.test.js
node --check cloudflare/workers/wrldline-public/worker.js
node --check script.js
node --check share.js
node --check public-news.js
node --check tests/public-news.test.js
npx --yes deno check --check-js cloudflare/workers/wrldline-public/worker.js
git diff --check -- script.js share.js
```

The isolated tests cover SSR without an auth gate, per-article metadata and actual image/author behavior, original versus received dates, conservative/optional human trust, error statuses, sanitization, canonical redirects/HEAD, anonymous credential usage, consent-aware analytics hooks, index pagination, Google News 48-hour/1,000-entry restrictions, empty windows, RSS/Atom, origin pass-through, no mutations, exact RPC security contract, native sharing and copied canonical captions. A fixture with **27,037 published articles** must yield **28 regular sitemap files** and 27,037 unique canonical URLs; an additional fixture tests 1,001 sitemap-index boundaries beyond PostgREST's cap.

The worker and fixture outputs can be inspected locally without any production request. Deno and `pglast` were installed as check-only tools outside the repository; no application dependencies or package manifest were introduced. The migration's outer statements and SQL-language function bodies are parsed locally with `pglast`; this is syntax validation only.

## Parent-owned activation blockers and live verification

1. Review the new migration against live types, apply it with the database-owner migration path, and remove the existing anonymous article INSERT vulnerability. Keep private account rows protected. Do not restore a broad anonymous article SELECT policy to make SSR work.
2. Publish the static owned CSS/JS and sharing changes to GitHub Pages together with the credibility and analytics owners' assets. Confirm that root-relative enhancement URLs return actual JS/CSS, not a GitHub 404 or auth page. Old assets may remain cached until that deployment completes.
3. Configure the two public Supabase Worker bindings, deploy the module Worker and attach only the scoped routes above. No service secret is required. Leave the origin and separate API custom domain intact.
4. Parent adds a crawler-visible `/news/` link to origin navigation, references to `/article-sitemap.xml` and `/news-sitemap.xml` from the main sitemap/robots, and route declarations. These files were deliberately not edited here.
5. Enable optional `PUBLIC_TRUST_ENABLED="true"` only after the safe trust RPC is applied and verified. The core public RPC does not depend on that later migration.
6. Verify **raw deployed HTTP**, not just rendered browser DOM: representative article GET/HEAD, English/Arabic bodies, actual date/author/source metadata, a valid absent UUID 404, controlled backend failure 503, archive page 28, current News sitemap window, RSS/Atom XML and nonworker account/origin paths. Repeat with ordinary/search/social crawler User-Agents and no login. Confirm private account/database rows remain inaccessible to anon.

No live result, indexing guarantee, Google News eligibility/acceptance or real newsletter/message delivery is claimed by this local module.

## Completed local results — 2026-11-15

- Native Node regression suite: **20 passed, 0 failed**, including complete 27,037-row archive coverage and optional human-trust fallbacks.
- `node --check`: worker, existing `script.js`/`share.js`, new `public-news.js` and the test file passed.
- Deno 2.9.6 strict `check --check-js`: worker passed after adding explicit JSDoc contracts.
- PostgreSQL syntax: 18 outer migration statements and all four SQL-function bodies parsed successfully with `pglast`; no database connection or migration execution occurred.
- `git diff --check -- script.js share.js`: passed.
- Local mock RSS, Atom, Google News sitemap, regular sitemap index and numbered article sitemap parsed as well-formed XML with `lxml`.

These results are isolated local evidence. Production routing, asset activation, database execution/RLS and crawler responses remain the parent's live-verification steps above.
