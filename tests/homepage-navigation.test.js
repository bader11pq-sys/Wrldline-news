"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("homepage primary navigation follows the core reader journey", () => {
  const html = read("index.html");
  const primaryStart = html.indexOf('<div class="wl-nav-scroll">');
  const primaryEnd = html.indexOf("</div>", primaryStart);
  const menuStart = html.indexOf('<div class="wl-more-menu" id="moreMenu">');
  const menuEnd = html.indexOf("\n          </div>\n        </div>", menuStart);
  const primary = html.slice(primaryStart, primaryEnd);
  const more = html.slice(menuStart, menuEnd);
  assert.ok(primaryStart >= 0 && primaryEnd > primaryStart, "primary navigation exists");
  assert.ok(menuStart >= 0 && menuEnd > menuStart, "More menu exists");

  const primaryLinks = [...primary.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(primaryLinks, [
    "index.html",
    "rights.html",
    "/dossier/",
    "#newsSection",
    "#newsSection",
    "/news/",
    "#breakingSection",
    "map.html"
  ]);

  for (const route of [
    "context.html", "balance.html", "impact.html", "mirror.html", "history.html",
    "map.html", "sources.html", "daily-briefing.html", "shorts.html",
    "topics.html", "tags.html", "promises.html", "explainers.html"
  ]) {
    assert.ok(more.includes('href="' + route + '"'), route + " remains reachable from More");
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
});
