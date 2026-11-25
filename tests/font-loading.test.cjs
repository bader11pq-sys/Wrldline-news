// Render path: web fonts must not block first paint on any static page.
// Run: node --test tests/font-loading.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("no page requests the Google Fonts stylesheet as a blocking stylesheet", async () => {
  const { htmlFiles } = await import("../scripts/apply-font-loading.mjs");
  const files = htmlFiles().filter((file) => read(file).includes("fonts.googleapis.com/css2"));
  assert.ok(files.length > 30, `expected font-using pages, found ${files.length}`);
  for (const file of files) {
    const html = read(file);
    for (const line of html.split("\n")) {
      if (!line.includes("fonts.googleapis.com/css2")) continue;
      const blocking = /rel="stylesheet"/.test(line) && !/media="print"/.test(line) && !/<noscript>/.test(line);
      assert.ok(!blocking, `${file}: blocking font stylesheet -> ${line.trim().slice(0, 90)}`);
    }
  }
});

test("every font page preloads the stylesheet and keeps a no-JS fallback", async () => {
  const { htmlFiles } = await import("../scripts/apply-font-loading.mjs");
  for (const file of htmlFiles()) {
    const html = read(file);
    const url = (html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/) || [])[1];
    if (!url) continue;
    assert.ok(html.includes(`<link rel="preload" as="style" href="${url}">`), `${file}: missing font stylesheet preload`);
    assert.ok(html.includes(`media="print" onload="this.media='all'"`), `${file}: missing async font swap`);
    assert.ok(html.includes(`<noscript><link rel="stylesheet" href="${url}"></noscript>`), `${file}: missing noscript fallback`);
  }
});

test("the font loading generator is in sync with the pages", async () => {
  const { applyToHtml, htmlFiles } = await import("../scripts/apply-font-loading.mjs");
  for (const file of htmlFiles()) {
    const html = read(file);
    assert.strictEqual(applyToHtml(html), html, `${file}: run node scripts/apply-font-loading.mjs`);
  }
});
