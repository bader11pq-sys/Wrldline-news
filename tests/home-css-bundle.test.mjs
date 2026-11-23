import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SOURCES, OUTPUT, bundle } from "../scripts/build-home-css.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("homepage stylesheet bundle matches its nine sources byte for byte", () => {
  const committed = fs.readFileSync(path.join(ROOT, OUTPUT), "utf8");
  assert.equal(committed, bundle(), `${OUTPUT} is stale; run node scripts/build-home-css.mjs`);
});

test("the bundle keeps the original cascade order and drops no selector block", () => {
  const committed = fs.readFileSync(path.join(ROOT, OUTPUT), "utf8");
  let cursor = -1;
  for (const name of SOURCES) {
    const marker = `/* ${name} */`;
    const at = committed.indexOf(marker);
    assert.ok(at > cursor, `${name} must appear after the previous source`);
    cursor = at;
  }
  const sourceBytes = SOURCES.reduce((total, name) => total + fs.statSync(path.join(ROOT, name)).size, 0);
  assert.ok(Buffer.byteLength(committed) >= sourceBytes, "bundle must contain every source byte");
});

test("the homepage loads one stylesheet bundle instead of nine blocking files", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  assert.match(head, /<link rel="stylesheet" href="home\.bundle\.css\?v=/);
  for (const name of SOURCES) {
    assert.ok(!head.includes(`href="${name}`), `index.html must not link ${name} directly`);
    assert.ok(!head.includes(`href="/${name}`), `index.html must not link /${name} directly`);
  }
});

test("the homepage links real section pages and keeps the world monitor in the more menu", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /href="\/section\/politics"/);
  assert.match(html, /href="\/section\/economy"/);
  const start = html.indexOf('<nav class="wl-container wl-nav"');
  assert.ok(start > 0, "the homepage must render the top navigation bar");
  const bar = html.slice(start, html.indexOf('<div class="wl-nav-more">', start));
  assert.ok(!bar.includes("map.html"), "the world monitor belongs in the more menu, not the top bar");
  assert.ok(html.includes('href="map.html"'), "the world monitor must stay reachable from the more menu");
});
