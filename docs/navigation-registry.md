# Navigation registry contract

Every navigation surface on WRLDLINE NEWS is painted from one file:
`site-sections.js`. This page records the contract so a future change cannot
quietly reintroduce a second list.

## Surfaces and how they are produced

| Surface | Host markup | Renderer |
| --- | --- | --- |
| Desktop bar under the masthead | `<div data-nav="primary">` on `index.html`, filled server-side by `scripts/build-sections.mjs`, repainted in place by `site-nav.js` | `registry.PRIMARY_NAV` |
| More menu | `<div id="moreMenu" data-nav="more">` | `registry.MORE_MENU` (never the directory itself) |
| Hamburger drawer (`<dialog id="siteDrawer">`) | created by `site-nav.js` | `NEWS_SECTIONS` as `<details>` per desk, then the knowledge, tool, service and policy groups |
| Footer columns | `<div class="footer-cols" data-nav="footer">` | `registry.FOOTER_COLUMNS` |
| Sections directory | `sections.html`, generated | `scripts/build-sections.mjs` |
| Worker `/section/*` pages and their news bar | `cloudflare/workers/wrldline-public/worker.js` | `sections.generated.js`, emitted from the same registry |
| Mobile chips and tab bar | `wl-modern.js` | rendered primary-before-DOMContentLoaded; the "Sections" tab calls `WLSiteNav.open()` |

`site-shell.js` (shared header/footer for the analysis and tool pages) only
carries the empty containers. It holds no links.

## Groups

- `NEWS_SECTIONS` — six desks with `children`. A child is a real page under
  `/section/<slug>`; `parent` is asserted by tests.
- `KNOWLEDGE_GROUPS` — `today`, `context`, `history`, `originals`. Editorial
  products, not desks.
- `TOOL_GROUP` — maps, markets, countries, sources, tags, intelligence.
- `SERVICE_GROUP` — For you, saved articles, followed sections and countries,
  account, newsletter. Reader services, never presented as news sections.
- `SITE_GROUP` — about, corrections, contact, advertising, privacy, terms.

## Adding or renaming a destination

1. Edit `site-sections.js` only. Keys and hrefs must be unique; the module
   throws on a duplicate at load time.
2. Run `node scripts/build-sections.mjs`. It regenerates `sections.html`, the
   pre-rendered homepage navigation and `sections.generated.js`.
3. Run `node --test tests/site-navigation.test.cjs`. It fails if a page is
   neither registered nor listed in `UNLISTED_PAGES` with a reason, if a surface
   drifts from the registry, or if the worker's generated module is stale.

## Retiring a destination

Move the page to a redirect, keep the old URL working, add it to
`UNLISTED_PAGES` with the reason, and keep it out of `sitemap.xml`.
`topics.html` is the worked example: `noindex,follow`, canonical to
`sections.html`, permanent client and meta redirect.
