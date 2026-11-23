"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { validate, build, dossier } = require("../scripts/build-rights-cases.cjs");
const root = resolve(__dirname, "..");
const read = (name) => readFileSync(resolve(root, name), "utf8");
const cases = () => JSON.parse(read("editorial-data/rights-cases.json"));

test("dossier outputs are reproducible and fictional example stays out of search inventory", () => {
  const data = cases();
  assert.equal(build(true), data.length);
  const sitemap = read("sitemap.xml");
  const index = read("rights-cases/index.html");
  for (const row of data) {
    const href = `${row.slug}.html`;
    const file = read(`rights-cases/${href}`);
    assert.match(file, /آخر تحديث تحريري/);
    assert.match(file, /ماذا يعني للناس؟/);
    assert.match(file, /نطاق الأدلة حتى/);
    assert.ok(index.includes(href));
    assert.equal(sitemap.includes(href), row.type !== "example");
    assert.equal(file.includes('content="noindex,follow"'), row.type === "example");
    assert.equal(file.includes('class="hn-source-link"'), row.type !== "example");
    assert.deepEqual(file.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi),
      ['<script src="../rights-cases.js?v=premium-1" defer></script>']);
    assert.doesNotMatch(file, /<(iframe|form)\b/i);
  }
});

test("a published claim cannot be marked corroborated without cites or confused with an official reply", () => {
  const data = cases();
  const claim = data[0].claims[1];
  claim.refs = [claim.refs[0]];
  assert.throws(() => validate(data), /not enough sources/);
  claim.status = "official";
  assert.throws(() => validate(data), /invalid claim status/);
});

test("requires meaningful coverage dates, an impact field, and sources for an attributed reply", () => {
  const data = cases();
  const entry = data[0];
  entry.checkedThrough = "2024-02-31";
  assert.throws(() => validate(data), /invalid review or editorial date/);
  entry.checkedThrough = "2024-08-13";
  entry.impact = " ";
  assert.throws(() => validate(data), /missing impact/);
  entry.impact = "Impact in the test data";
  entry.responses[0].refs = ["nonexistent"];
  assert.throws(() => validate(data), /invalid source reference/);
  entry.responses[0].refs = [];
  assert.throws(() => validate(data), /replies must be attributed/);
});

test("requires an explanation and date to close a case; examples cannot link fake sources", () => {
  const data = cases();
  const example = data.find(x => x.type === "example");
  example.state = "closed";
  assert.throws(() => validate(data), /missing closure or change reason/);
  example.stateReason = "Training example";
  example.stateDate = "2026-01-10";
  assert.doesNotThrow(() => validate(data));
  assert.match(dossier(example), /أُغلق الملف أو تغيّرت ظروف القضية/);
  example.sources[0].url = "https://example.com/";
  assert.throws(() => validate(data), /example sources may not link out/);
});

test("source URLs must be HTTPS and free of credentials", () => {
  const data = cases();
  for (const invalid of ["javascript:alert(1)", "http://example.com/", "https://user:pass@example.com/"]) {
    data[0].sources[0].url = invalid;
    assert.throws(() => validate(data), /unsafe or repeated URL/);
  }
});

test("seven desks link to existing content and maintain a lightweight homepage", () => {
  const sections = read("sections.html");
  assert.equal([...sections.matchAll(/<section class="hn-desk"/g)].length, 7);
  const homepage = read("index.html");
  assert.match(homepage, /الأخبار من أجل الإنسان/);
  assert.match(homepage, /<a class="wl-nav-link wl-nav-sections" href="sections\.html"/);
  assert.doesNotMatch(sections, /<(script|iframe)\b/i);
  for (const [, link] of sections.matchAll(/href="([^"#][^"]*)"/g)) {
    if (link.startsWith("https://")) continue;
    const path = link.split(/[?#]/)[0];
    assert.ok(existsSync(resolve(root, path)), `Missing ${path}`);
  }
});
