"use strict";
/* One hierarchy, many surfaces.
 *
 * These tests exist because the site used to keep four hand-written navigation
 * lists (index.html, site-shell.js, wl-modern.js and the public worker) that had
 * drifted apart: the hamburger missed sections the directory listed, the More
 * menu repeated the directory, and the worker's section pages used labels the
 * navigation never showed. Every assertion below is about the shared source.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const registry = require(path.join(root, "site-sections.js"));

const hrefsIn = markup => [...markup.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
const stripQuery = href => href.split(/[?#]/)[0];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || ["node_modules", "assets", "editorial-data", "supabase", "tests", "scripts", "cloudflare", "docs"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".html")) out.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return out;
}

test("the registry is the only list: no duplicate destinations, no orphan parents", () => {
  const hrefs = registry.allHrefs();
  assert.equal(new Set(hrefs).size, hrefs.length, "every destination appears exactly once");
  assert.ok(hrefs.length > 50, "the registry covers the whole site, not just the twelve categories");
  for (const item of registry.ALL_LINKS) {
    assert.ok(item.ar && item.en, `${item.key} has both Arabic and English labels`);
    assert.ok(item.href && !item.href.startsWith("#"), `${item.key} points at a real destination`);
  }
  for (const section of registry.NEWS_SECTIONS) {
    for (const child of section.children) {
      assert.equal(registry.parentOf(child.key)?.key, section.key, `${child.key} is nested under ${section.key}`);
    }
  }
});

test("every public HTML page is in the registry or explicitly accounted for", () => {
  const registered = new Set(registry.allHrefs().map(stripQuery).map(href => href.replace(/^\/+/, "")));
  registered.add("index.html");
  registered.add("sections.html");
  const unlisted = new Set(registry.UNLISTED_PAGES.map(entry => stripQuery(entry.path).replace(/^\/+/, "")));
  const orphans = walk(root).filter(page => !registered.has(page) && !unlisted.has(page));
  assert.deepEqual(orphans, [], "no page is left without a navigation decision");
});

test("the sections directory lists every destination in the registry", () => {
  const html = read("sections.html");
  for (const href of registry.allHrefs()) {
    const normalized = href.replace(/&/g, "&amp;");
    assert.ok(html.includes(`href="${normalized}"`), `sections.html links ${href}`);
  }
  for (const anchor of ["news-sections", "knowledge-sections", "tools", "services"]) {
    assert.ok(html.includes(`id="${anchor}"`), `the directory has a jump target for ${anchor}`);
  }
});

test("the homepage bar, More menu and footer come from the registry", () => {
  const html = read("index.html");
  const block = name => {
    const start = html.search(new RegExp(`<div[^>]*data-nav="${name}"`));
    if (start < 0) return "";
    const open = html.indexOf(">", start) + 1;
    let depth = 1, cursor = open;
    while (depth > 0 && cursor < html.length) {
      const next = html.slice(cursor).search(/<div\b|<!--registry:[a-z]+-->|<!--\/registry:[a-z]+-->|<\/div>/);
      if (next < 0) break;
      const token = html.slice(cursor + next, cursor + next + 30);
      if (token.startsWith("<!--registry:")) { cursor += next + token.indexOf("-->") + 3; continue; }
      if (token.startsWith("<!--/registry:")) { cursor += next + token.indexOf("-->") + 3; continue; }
      if (token.startsWith("</div>")) depth -= 1;
      else depth += 1;
      cursor += next + (token.startsWith("</div>") ? 6 : 4);
    }
    return html.slice(open, cursor);
  };
  assert.deepEqual(hrefsIn(block("primary")), registry.pick(registry.PRIMARY_NAV).map(item => item.href));
  assert.deepEqual(hrefsIn(block("more")), registry.pick(registry.MORE_MENU).map(item => item.href));
  const footer = registry.FOOTER_COLUMNS.flatMap(column => registry.pick(column.items).map(item => item.href));
  assert.deepEqual(hrefsIn(block("footer")), footer);
});

test("shared shell pages keep no hardcoded navigation list and load the registry", () => {
  const shell = read("site-shell.js");
  assert.match(shell, /data-nav="primary"/);
  assert.match(shell, /data-nav="more"/);
  assert.match(shell, /data-nav="footer"/);
  assert.doesNotMatch(shell, /href="\/section\//, "no desk links are hand-written in the shell");
  assert.doesNotMatch(shell, /href="daily-briefing\.html"/, "product links come from the registry too");

  const pages = fs.readdirSync(root).filter(file => file.endsWith(".html") && read(file).includes("site-shell.js"));
  assert.ok(pages.length >= 15, "the shared shell still covers the analysis and tool pages");
  for (const page of pages) {
    const html = read(page);
    const order = ["site-sections.js", "site-nav.js", "site-shell.js"].map(script => html.indexOf(script));
    assert.ok(order.every(index => index > -1), `${page} loads the registry before the shell`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, `${page} loads registry, renderer, then shell`);
  }
});

test("the renderer owns every surface and no script keeps its own section list", () => {
  const nav = read("site-nav.js");
  for (const surface of ["primary", "more", "footer", "drawer"]) assert.ok(nav.includes(`"${surface}"`), surface);
  assert.match(nav, /WRLDLINE_SITE_SECTIONS/);
  assert.doesNotMatch(read("wl-modern.js"), /sections=\(\)=>\[/, "wl-modern.js no longer hardcodes sections");
  assert.doesNotMatch(read("home.js"), /moreMenu\.classList\.toggle/, "the More menu is wired once, in site-nav.js");
});

test("the public worker uses the generated registry instead of a second list", async () => {
  const generated = await import("../cloudflare/workers/wrldline-public/sections.generated.js");
  assert.deepEqual(generated.SECTION_ROUTES.map(route => route.slug), registry.SECTION_ROUTES.map(route => route.slug));
  assert.deepEqual(generated.SECTION_ROUTES.map(route => route.parent), registry.SECTION_ROUTES.map(route => route.parent));
  assert.deepEqual(generated.PRIMARY_NAV.map(item => item.href), registry.pick(registry.PRIMARY_NAV).map(item => item.href));
  const worker = read("cloudflare/workers/wrldline-public/worker.js");
  assert.match(worker, /from "\.\/sections\.generated\.js"/);
  assert.match(worker, /export const SECTIONS = SECTION_ROUTES/);
  const { SECTIONS } = await import("../cloudflare/workers/wrldline-public/worker.js");
  for (const route of registry.SECTION_ROUTES) {
    assert.ok(SECTIONS.some(section => section.key === route.key && section.parent === route.parent), route.key);
  }
});

test("the sitemap covers the public pages and keeps the retired directory out", () => {
  const sitemap = read("sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(new Set(locs).size, locs.length, "no duplicate URLs");
  assert.ok(!locs.some(loc => loc.includes("topics.html")), "the retired directory stays out of the sitemap");
  assert.ok(locs.some(loc => loc.endsWith("/sections.html")), "the canonical directory is indexed");
  for (const page of ["office-edition.html", "for-you.html", "intelligence.html", "tags.html", "sources.html", "explainers.html", "reading.html"]) {
    assert.ok(locs.some(loc => loc.endsWith("/" + page)), `${page} is in the sitemap`);
  }
  assert.ok(!locs.some(loc => loc.endsWith("/account.html")), "account pages stay noindex");
});

test("the old topics directory redirects to the canonical sections directory", () => {
  const topics = read("topics.html");
  assert.match(topics, /rel="canonical" href="https:\/\/al-ghaib\.us\.ci\/sections\.html"/);
  assert.match(topics, /name="robots" content="noindex,follow"/);
  assert.match(topics, /url=sections\.html/);
  assert.match(topics, /location\.replace\("sections\.html"/);
});
