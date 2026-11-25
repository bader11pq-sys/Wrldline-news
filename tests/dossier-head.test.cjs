// Dossier pages are generated from a template in scripts/build-dossiers.mjs.
// The head generators (apply-font-loading, apply-quality-css) also rewrite
// dossier/*.html, so the template itself must emit the same head markup or CI's
// "regenerate and diff" step deletes the injected tags on every run.
// Run: node --test tests/dossier-head.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(ROOT, "scripts/build-dossiers.mjs"), "utf8");
const FONT = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic";

test("the dossier template loads fonts without blocking paint", () => {
  assert.ok(
    template.includes(`<link rel="preload" as="style" href="${FONT}`),
    "dossier template must preload the font stylesheet",
  );
  assert.ok(
    template.includes(`media="print" onload="this.media='all'"`),
    "dossier template must apply the font stylesheet asynchronously",
  );
  assert.ok(template.includes("<noscript><link rel=\"stylesheet\" href=\"" + FONT), "dossier template must keep a no-JS fallback");
  for (const line of template.split("\n")) {
    if (!line.includes(FONT)) continue;
    const blocking = /rel="stylesheet"/.test(line) && !/media="print"/.test(line) && !/<noscript>/.test(line);
    assert.ok(!blocking, `dossier template keeps a blocking font stylesheet: ${line.trim().slice(0, 80)}`);
  }
});

test("generated dossier pages keep the non-blocking font markup", () => {
  const dir = path.join(ROOT, "dossier");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html"));
  assert.ok(files.length >= 4, `expected dossier pages, found ${files.length}`);
  for (const file of files) {
    const html = fs.readFileSync(path.join(dir, file), "utf8");
    if (!html.includes(FONT)) continue;
    assert.ok(
      html.includes(`<link rel="preload" as="style" href="${FONT}`),
      `dossier/${file}: font stylesheet is not preloaded (re-run node scripts/build-dossiers.mjs)`,
    );
  }
});
