// Quality layer: quality.css must be linked from every page, and the generator
// must stay in sync with the committed HTML.
// Run: node --test tests/quality-layer.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const generator = () => import("../scripts/apply-quality-css.mjs");

test("every page links quality.css exactly once", async () => {
  const { htmlFiles, HREF } = await generator();
  const files = htmlFiles();
  assert.ok(files.length >= 40, `expected the full page set, found ${files.length}`);
  for (const file of files) {
    const html = read(file);
    const count = html.split(HREF).length - 1;
    assert.strictEqual(count, 1, `${file}: expected one quality.css link, found ${count}`);
  }
});

test("quality.css loads after the page's own stylesheets", async () => {
  const { htmlFiles } = await generator();
  for (const file of htmlFiles()) {
    const html = read(file);
    const quality = html.indexOf("quality.css");
    const head = html.slice(0, html.search(/<\/head>/i));
    const stylesheets = [...head.matchAll(/rel="stylesheet" href="([^"]*quality\.css[^"]*)"/g)];
    assert.strictEqual(stylesheets.length, 1, `${file}: quality.css must be a stylesheet link`);
    for (const match of head.matchAll(/href="([^"]*\.css[^"]*)"/g)) {
      if (match[1].includes("quality.css")) continue;
      assert.ok(
        match.index < quality,
        `${file}: ${match[1]} is linked after quality.css, so it would override the quality layer`,
      );
    }
  }
});

test("quality.css keeps the rules this layer exists for", () => {
  const css = read("quality.css");
  const floor = /min-block-size:\s*24px/;
  assert.match(css, floor, "pointer target minimum missing");
  assert.match(css, /\.source-link/, "source links must meet the 24px target minimum");
  assert.match(css, /@media \(max-width: 640px\)/, "micro-type floor must be scoped to small screens");
  assert.match(css, /\.brand-copy small/, "brand kicker legibility rule missing");
  // Rules must not leak onto desktop body copy.
  assert.doesNotMatch(css, /(^|\n)\s*body\s*\{[^}]*font-size/, "quality.css must not reset body type");
});

test("the quality layer generator is in sync with the pages", async () => {
  const { applyToHtml, htmlFiles } = await generator();
  for (const file of htmlFiles()) {
    const html = read(file);
    assert.strictEqual(applyToHtml(html), html, `${file}: run node scripts/apply-quality-css.mjs`);
  }
});
