"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const registry = require(path.join(root, "site-sections.js"));
const taxonomy = require(path.join(root, "taxonomy.js"));

async function workerSections() {
  const worker = await import(path.join(root, "cloudflare/workers/wrldline-public/worker.js"));
  return worker.SECTIONS;
}

test("every article category has exactly one news section", async () => {
  const sections = await workerSections();
  const keys = sections.map(section => section.key).sort();
  const categories = taxonomy.CATEGORY_KEYS.filter(key => key !== "uncategorized").sort();
  assert.deepEqual(keys, categories, "worker section keys must match the article taxonomy");
  assert.equal(registry.NEWS_CATEGORIES.slice().sort().join(","), categories.join(","));
});

test("sports is a real section, not a redirect to culture", async () => {
  const worker = await import(path.join(root, "cloudflare/workers/wrldline-public/worker.js"));
  const sports = worker.SECTIONS.find(section => section.slug === "sports");
  assert.ok(sports, "sports section exists");
  assert.equal(sports.parent, "society");
  assert.doesNotMatch(read("cloudflare/workers/wrldline-public/worker.js"), /\["sports?", "culture"\]/);
});

test("the section registry has no duplicate destinations and nests every subsection", () => {
  const hrefs = registry.allHrefs();
  assert.equal(new Set(hrefs).size, hrefs.length, "no destination appears twice");
  for (const section of registry.NEWS_SECTIONS) {
    assert.ok(section.href.startsWith("/section/") || section.href.endsWith(".html"), section.key);
    for (const child of section.children) {
      assert.equal(registry.parentOf(child.key)?.key, section.key, `${child.key} is nested under ${section.key}`);
    }
    assert.ok(!section.children.some(child => child.href === section.href), `${section.key} does not repeat itself`);
  }
});

test("the sections directory lists every section, subsection and knowledge desk", () => {
  const html = read("sections.html");
  for (const href of registry.allHrefs()) {
    if (href === "news/") {
      assert.match(html, /href="news\/"/);
      continue;
    }
    const normalized = href.replace(/&/g, "&amp;");
    assert.ok(html.includes(`href="${normalized}"`), `sections.html links ${href}`);
  }
  assert.match(html, /الملخص اليومي/);
  assert.match(html, /Daily Briefing/);
  assert.match(html, /الموسوعة التاريخية/);
  assert.match(html, /Historical Encyclopedia/);
});

test("Arabic and English hierarchies are rendered from the same markup", () => {
  const html = read("sections.html");
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.doesNotMatch(html, /hreflang="en"/);
  assert.match(read("sections.js"), /searchParams\.set\("lang", "en"\)/);
  assert.match(read("sections.css"), /html\[lang="en"\] \.sections-page \[lang="en"\]/);
  for (const section of registry.NEWS_SECTIONS) {
    assert.ok(html.includes(`lang="ar">${section.ar}<`) || html.includes(`lang="ar">${section.ar.replace(/&/g, "&amp;")}<`), section.ar);
    assert.ok(html.includes(`lang="en">${section.en.replace(/&/g, "&amp;")}<`), section.en);
  }
});

test("navigation exposes the Daily Briefing and Historical Encyclopedia on every shell page", () => {
  const shell = read("site-shell.js");
  assert.match(shell, /data-nav="primary"/);
  assert.match(shell, /data-nav="more"/);
  assert.match(shell, /data-nav="footer"/);
  assert.doesNotMatch(shell, /<a href="\/section\//, "site-shell.js keeps no hardcoded section links");
  const index = read("index.html");
  assert.match(index, /href="daily-briefing\.html"/);
  assert.match(index, /href="history\.html"/);
  assert.match(index, /href="sections\.html"/);
  const drawer = read("site-nav.js");
  assert.match(drawer, /MORE_MENU/);
  assert.match(drawer, /PRIMARY_NAV/);
});

test("all twelve section pages are in the sitemap", async () => {
  const sitemap = read("sitemap.xml");
  const sections = await workerSections();
  for (const section of sections) {
    assert.ok(sitemap.includes(`/section/${section.slug}<`), `/section/${section.slug} in sitemap`);
  }
  assert.equal((sitemap.match(/\/section\/[a-z-]+</g) || []).length, 12);
});

test("the old topics directory is consolidated into the sections directory", () => {
  const topics = read("topics.html");
  assert.match(topics, /rel="canonical" href="https:\/\/al-ghaib\.us\.ci\/sections\.html"/);
  assert.match(topics, /url=sections\.html/);
  assert.doesNotMatch(read("sitemap.xml"), /topics\.html/);
});
