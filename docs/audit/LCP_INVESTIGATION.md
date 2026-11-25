# Home page LCP: what the 7.6 s consists of

Measured 2026-11-25 against production (`https://al-ghaib.us.ci/`) and against the underlying data
service. Lighthouse 12, mobile form factor, simulated throttling, two runs per condition.

| Metric | Production (median of 2) | Local static copy (median of 3) |
| --- | --- | --- |
| LCP (simulated) | 5.1–5.3 s | 7.5 s (saturated by HTTP/1.0 local serving) |
| FCP (simulated) | 3.5 s | 2.3 s |
| Observed LCP (no throttling) | 1.84 s | 1.54 s |
| Observed FCP | 0.61 s | — |
| TBT | 230–310 ms | 540 ms |
| CLS | 0.017 | 0.02 |

The LCP element is not an image. It is the first news card's title button
(`<button class="reader-story-link" …>`), which only exists after the public news read returns.
So the LCP chain is: HTML + CSS → `script.js` boots → RPC → render cards.

## Where the time goes

1. **The read started late.** `fetchNews()` runs at the end of `script.js` initialisation. On
   production the RPC request did not leave until **705 ms**; the page had already parsed and styled.
2. **The RPC costs ~780 ms per call, and that is fixed, not query-shaped.** Measured directly:

   | Call | TTFB | Response |
   | --- | --- | --- |
   | `public_home_news_recent_v3` `p_limit=1` | 780 ms | 1.5 KB |
   | `public_home_news_recent_v3` `p_limit=24` | 1010 ms | 86 KB |
   | `public_breaking_feed` | 781 ms | 4.7 KB |
   | `public_top_read_articles` | 732 ms | 24 KB |
   | `public_news_sitemap_index` | 769 ms | 429 bytes |

   A 429-byte response taking the same time as an 86 KB one rules out payload, projection and index
   shape as the cause. Network round trip to the host is small: `/rest/v1/` answers in **87 ms** and
   `/auth/v1/health` in 83 ms (both rejected before touching the database). So roughly **700 ms per
   request is paid inside the project, not on the wire** — the Data API's per-request database path,
   not the query plan.
3. **The grid was empty while waiting.** `#newsGrid` shipped with `aria-busy="true"` and no children,
   so nothing occupied the space where the cards appear.
4. **Fonts and CSS are no longer the bottleneck.** Font stylesheet is preloaded and applied with
   `media="print"` + `onload`; the only render-blocking sheet is `home.bundle.css` (32 KB, 601 ms of
   Lighthouse's blocking estimate). FCP 3.5 s comes mostly from CPU work, not download.
5. **Images are already sized correctly.** `.card-image` has `aspect-ratio:16/10`, the lead story has
   a fixed 500 px box and `fetchpriority="high"`, everything else is `loading="lazy"` with
   `decoding="async"`. CLS is 0.017, so there is no measurable image-induced shift to fix.
6. **Skeletons already existed — only for the wrong section.** `#missedNewsGrid` shipped skeleton
   cards; the main grid did not.

## Changes in this PR

- `index.html` starts the news read in a small inline script during head parsing, and `script.js`
  adopts that exact response for its first render (no second request). The arrival timestamp is
  shared so pagination stays consistent, and any failure falls back to the normal path.
- `#newsGrid` now ships six `aria-hidden` skeleton cards, so the grid holds its shape while the read
  is in flight.
- `tests/first-paint-feed.test.cjs` (4 cases) pins the ordering, the adoption path, the timestamp
  reuse and the placeholder markup.

Effect on when the request leaves, measured on the local static copy of the site:

| | before | after |
| --- | --- | --- |
| RPC start (median of 3) | 310 ms | 168 ms |
| Observed LCP (median of 3) | 1543 ms | 1377 ms |

On production the request left at 705 ms, so the expected saving is larger there; that number will be
re-measured after merge rather than assumed.

## What is left, and why it is not in this PR

The remaining ~700 ms per request is inside the project's Data API path and cannot be fixed from the
repository. Options, in order of expected value:

1. **Edge cache the public reads.** The site is served by Cloudflare, and the public feed is identical
   for every signed-out reader for a short window. A Worker route caching
   `public_home_news_recent_v3` / `public_breaking_feed` / `public_top_read_articles` for 60 s would
   remove the database from the LCP path entirely for most readers. Needs a Worker deploy and a cache
   key policy — infrastructure, not a code change here.
2. **Serve the newest cards from the site's own domain.** Same idea without a Worker: publish a small
   `news-latest.json` snapshot on each ingest run and paint from it first, then reconcile. Ingestion
   is paused, and this would need a publication-side change, so it stays on the backlog.
3. **Project-side latency.** If the 700 ms is a plan-cache or connection-pool artefact, Supabase
   support or a project upgrade may remove it; no repository change can.

Measured claims above are medians from this environment; the production figure after merge will be
re-measured and reported before this work is called done.
