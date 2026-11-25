// International SEO: hreflang and locale metadata invariants for every
// indexable static page. Run: node --test tests/hreflang.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ORIGIN = "https://al-ghaib.us.ci";
const PAIRS = { "about.html": "about-en.html", "corrections.html": "corrections-en.html" };
const EN_TO_AR = Object.fromEntries(Object.entries(PAIRS).map(([ar, en]) => [en, ar]));

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const indexable = fs
  .readdirSync(ROOT)
  .filter((f) => f.endsWith(".html"))
  .filter((f) => !/name="robots"[^>]*noindex/i.test(read(f)))
  .sort();

function hreflangOf(html) {
  return [...html.matchAll(/<link[^>]+rel="alternate"[^>]+hreflang="([^"]+)"[^>]+href="([^"]+)"/gi)].map(
    (m) => [m[1].toLowerCase(), m[2]],
  );
}

test("every indexable page declares its own language and x-default", () => {
  assert.ok(indexable.length > 25, `expected the static site, found ${indexable.length} pages`);
  for (const file of indexable) {
    const html = read(file);
    const lang = (html.match(/<html[^>]+lang="([a-z-]+)"/i) || [])[1];
    const canonical = (html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i) || [])[1];
    assert.ok(lang, `${file}: missing <html lang>`);
    assert.ok(canonical && canonical.startsWith(ORIGIN + "/"), `${file}: canonical must be an absolute ${ORIGIN} URL`);
    const pairs = hreflangOf(html);
    const map = new Map(pairs);
    assert.strictEqual(map.get(lang), canonical, `${file}: self hreflang must equal its canonical`);
    assert.ok(map.get("x-default"), `${file}: missing x-default`);
    assert.strictEqual(pairs.length, map.size, `${file}: duplicate hreflang values`);
  }
});

test("bilingual pairs point at each other from both sides", () => {
  for (const [ar, en] of Object.entries(PAIRS)) {
    for (const [file, other, otherLang] of [
      [ar, en, "en"],
      [en, ar, "ar"],
    ]) {
      const map = new Map(hreflangOf(read(file)));
      assert.strictEqual(map.get("ar"), `${ORIGIN}/${ar}`, `${file}: wrong ar hreflang`);
      assert.strictEqual(map.get("en"), `${ORIGIN}/${en}`, `${file}: wrong en hreflang`);
      assert.strictEqual(map.get("x-default"), `${ORIGIN}/${ar}`, `${file}: x-default must be the Arabic page`);
      assert.ok(fs.existsSync(path.join(ROOT, other)), `${file}: ${other} does not exist`);
      assert.strictEqual(map.get(otherLang), `${ORIGIN}/${other}`);
    }
  }
});

test("hreflang targets resolve to real pages on this site", () => {
  for (const file of indexable) {
    for (const [, href] of hreflangOf(read(file))) {
      assert.ok(href.startsWith(ORIGIN + "/"), `${file}: hreflang target must be absolute (${href})`);
      const target = href.slice(ORIGIN.length + 1) || "index.html";
      assert.ok(fs.existsSync(path.join(ROOT, target)), `${file}: hreflang target ${href} has no file`);
    }
  }
});

test("locale metadata matches the page language", () => {
  const locale = { ar: "ar_AR", en: "en_US" };
  for (const file of indexable) {
    const html = read(file);
    const lang = (html.match(/<html[^>]+lang="([a-z-]+)"/i) || [])[1];
    const value = (html.match(/<meta[^>]+property="og:locale"[^>]+content="([^"]+)"/i) || [])[1];
    assert.strictEqual(value, locale[lang], `${file}: og:locale should be ${locale[lang]}`);
    if (PAIRS[file] || EN_TO_AR[file]) {
      const alt = (html.match(/<meta[^>]+property="og:locale:alternate"[^>]+content="([^"]+)"/i) || [])[1];
      assert.strictEqual(alt, lang === "en" ? "ar_AR" : "en_US", `${file}: missing alternate locale`);
    }
  }
});

test("the generated hreflang blocks are in sync with the generator", async () => {
  const { applyToHtml } = await import("../scripts/apply-hreflang.mjs");
  for (const file of indexable) {
    const html = read(file);
    assert.strictEqual(applyToHtml(file, html), html, `${file}: run node scripts/apply-hreflang.mjs`);
  }
});

test("the sitemap repeats the hreflang pairs for crawlers", () => {
  const xml = read("sitemap.xml");
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/, "sitemap needs the xhtml namespace");
  for (const [ar, en] of Object.entries(PAIRS)) {
    for (const [file, other] of [
      [ar, en],
      [en, ar],
    ]) {
      const entry = xml.split(`<loc>${ORIGIN}/${file}</loc>`)[1] || "";
      const block = entry.split("</url>")[0];
      assert.match(block, new RegExp(`hreflang="ar" href="${ORIGIN.replace(/\./g, "\\.")}/${ar}"`), `${file}: sitemap ar alternate`);
      assert.match(block, new RegExp(`hreflang="en" href="${ORIGIN.replace(/\./g, "\\.")}/${en}"`), `${file}: sitemap en alternate`);
      assert.ok(block.includes(`hreflang="x-default" href="${ORIGIN}/${ar}"`), `${file}: sitemap x-default`);
      assert.ok(block.includes(other) || other === file);
    }
  }
});
