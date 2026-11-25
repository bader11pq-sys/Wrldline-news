"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

const registry = require(path.join(__dirname, "..", "site-sections.js"));

const hrefsIn = markup => [...markup.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);

test("the homepage paints the primary bar from the section registry", () => {
  const html = read("index.html");
  const primary = html.match(/<div class="wl-nav-scroll" data-nav="primary">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.ok(primary, "primary navigation container exists");
  assert.deepEqual(hrefsIn(primary), registry.pick(registry.PRIMARY_NAV).map(item => item.href));
  for (const item of registry.pick(registry.PRIMARY_NAV)) {
    assert.ok(primary.includes(`lang="en">${item.en.replace(/&/g, "&amp;")}<`), item.en);
  }
  assert.match(html, /<span lang="ar">المزيد<\/span><span lang="en">More<\/span>/);
});

test("the More menu adds features without repeating the sections directory", () => {
  const html = read("index.html");
  const more = html.match(/<div class="wl-more-menu" id="moreMenu" data-nav="more">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.ok(more, "More menu container exists");
  assert.deepEqual(hrefsIn(more), registry.pick(registry.MORE_MENU).map(item => item.href));
  assert.ok(!hrefsIn(more).includes("sections.html"), "the directory stays in the primary bar, not the More menu");
  assert.ok(!hrefsIn(more).some(href => href.includes("sections.html#")), "no fragment shortcuts to the directory");
});

test("specialist tools are reachable from one hub and not repeated in mobile navigation", () => {
  const mobile = read("wl-modern.js");
  const hub = read("analysis.html").split('id="tools"')[1];
  for (const route of ["context.html", "balance.html", "impact.html", "mirror.html", "map.html",
    "markets.html", "sources.html", "history.html", "promises.html", "explainers.html", "dossier/watchlist.html"]) {
    assert.ok(hub.includes(`href="${route}"`), route);
    assert.ok(!mobile.includes(`['${route}'`), route);
  }
  assert.doesNotMatch(mobile, /sections=\(\)=>\[/, "wl-modern.js keeps no section list of its own");
  assert.match(mobile, /WLSiteNav\.open\(\)/);
});

test("More menu stays usable on narrow screens and can scroll", () => {
  const css = read("wrld.css");
  const rule = css.match(/\.wl-more-menu\{([^}]*)\}/)?.[1] || "";
  assert.match(rule, /max-height:min\(72vh,560px\)/);
  assert.match(rule, /overflow-y:auto/);
  assert.match(css, /\.wl-nav-wrap\.mobile-open \.wl-more-menu/);
  assert.match(css, /\.wl-nav-wrap\.is-open \.wl-more-menu/);
});

test("navigation links close both the More menu and the drawer", () => {
  const js = read("site-nav.js");
  assert.match(js, /menu\.classList\.remove\("is-open"\)/);
  assert.match(js, /menu\.addEventListener\("click", event => \{ if \(event\.target\.closest\("a"\)\) close\(\); \}\)/);
  assert.match(js, /function closeDrawer\(\)/);
  assert.match(js, /if \(event\.target\.closest\("a"\)\) closeDrawer\(\)/);
});

test("narrative balance labels source names as coverage indicators, not proof of independence", () => {
  const js = read("home.js");
  assert.doesNotMatch(js, /مصادر مستقلة/);
  assert.match(js, /أسماء مصادر مختلفة/);
  assert.match(js, /تعدد الأسماء وحده لا يثبت استقلال المصادر أو صحة الرواية/);
  assert.doesNotMatch(read("index.html"), /مصادر مستقلة في العينة/);
});
