"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("homepage primary navigation prioritizes the main editorial desks and archive", () => {
  const html = read("index.html");
  const primaryStart = html.indexOf('<div class="wl-nav-scroll">');
  const primaryEnd = html.indexOf("</div>", primaryStart);
  const menuStart = html.indexOf('<div class="wl-more-menu" id="moreMenu">');
  const menuEnd = html.indexOf("\n          </div>\n        </div>", menuStart);
  const primary = html.slice(primaryStart, primaryEnd);
  const more = html.slice(menuStart, menuEnd);
  assert.ok(primaryStart >= 0 && primaryEnd > primaryStart, "primary navigation exists");
  assert.ok(menuStart >= 0 && menuEnd > menuStart, "Explore menu exists");

  const primaryLinks = [...primary.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(primaryLinks, [
    "index.html",
    "/section/politics",
    "/section/economy",
    "/section/world",
    "/dossier/",
    "rights.html",
    "analysis.html",
    "/news/",
    "#breakingSection"
  ]);

  // The world news desk is distinct from the specialist World Monitor.
  assert.ok(!primary.includes('href="map.html"'), "map.html must not sit in the primary bar");
  assert.ok(more.includes('href="map.html"'), "map.html must remain reachable from Explore");
  assert.ok(!primary.includes('href="#newsSection"'), "a self-referencing anchor is not a section page");
  assert.match(html, /<span lang="ar">استكشف<\/span><span lang="en">Explore<\/span>/);

  for (const route of [
    "sections.html", "context.html", "balance.html", "impact.html", "mirror.html", "history.html",
    "map.html", "sources.html", "daily-briefing.html", "shorts.html",
    "topics.html", "tags.html", "promises.html", "explainers.html"
  ]) {
    assert.ok(more.includes('href="' + route + '"'), route + " remains reachable from Explore");
  }
  assert.equal((more.match(/href="shorts\.html"/g) || []).length, 1, "Shorts is not duplicated in More");
});

test("More menu stays usable on narrow screens and can scroll", () => {
  const css = read("wrld.css");
  const rule = css.match(/\.wl-more-menu\{([^}]*)\}/)?.[1] || "";
  assert.match(rule, /max-height:min\(72vh,560px\)/);
  assert.match(rule, /overflow-y:auto/);
  assert.match(css, /\.wl-nav-wrap\.mobile-open \.wl-more-menu/);
  assert.match(css, /\.wl-nav-wrap\.is-open \.wl-more-menu/);
});

test("navigation links close both the More menu and mobile navigation", () => {
  const js = read("home.js");
  const handler = js.match(/navWrap\?\.addEventListener\("click", e => \{([\s\S]*?)\n  \}\);/)?.[1] || "";
  assert.match(handler, /closeMore\(\)/);
  assert.match(handler, /navWrap\.classList\.remove\("is-open", "mobile-open"\)/);
});

test("narrative balance labels source names as coverage indicators, not proof of independence", () => {
  const js = read("home.js");
  assert.doesNotMatch(js, /مصادر مستقلة/);
  assert.match(js, /أسماء مصادر مختلفة/);
  assert.match(js, /تعدد الأسماء وحده لا يثبت استقلال المصادر أو صحة الرواية/);
  assert.doesNotMatch(read("index.html"), /مصادر مستقلة في العينة/);
});
