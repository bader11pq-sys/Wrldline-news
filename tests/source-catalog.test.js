const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "source-catalog.json"), "utf8"));
const ingest = fs.readFileSync(path.join(root, "supabase/functions/wrldline-news-ingest/index.ts"), "utf8");
const breaking = fs.readFileSync(path.join(root, "bot-breaking.js"), "utf8");

test("canonical RSS catalog has exactly 80 unique source endpoints", () => {
  assert.equal(catalog.length, 80);
  const urls = catalog.map((source) => source.url);
  assert.equal(new Set(urls).size, 80);
  assert.ok(catalog.every((source) => /^https?:\/\//i.test(source.url)));
  assert.ok(catalog.every((source) => source.name && source.lang && source.pipeline === "general"));
});

test("the canonical catalog has 24 Arabic and 56 English publishers", () => {
  assert.equal(catalog.filter((source) => source.lang === "ar").length, 24);
  assert.equal(catalog.filter((source) => source.lang === "en").length, 56);
});

test("breaking collection monitors exactly 20 sources from the same 80-source catalog", () => {
  const breakingSources = catalog.filter((source) => source.breaking === true);
  assert.equal(breakingSources.length, 20);
  assert.ok(breakingSources.every((source) => typeof source.breaking_domain === "string" && source.breaking_domain.length > 0));
  assert.equal(new Set(breakingSources.map((source) => source.breaking_domain)).size, 20);
  assert.match(breaking, /catalog\.length!==80/);
  assert.match(breaking, /urgentSources\.length!==20/);
  assert.doesNotMatch(breaking, /batchSize=250|catalog\.length>=1000|recordBreakingFeed|STATIC_FEEDS/);
});

test("general ingestion rejects a registry or source catalog larger than the approved 80", () => {
  assert.match(ingest, /catalog\.length!==80/);
  assert.match(ingest, /RSS registry must have exactly 80 active unique sources/);
  assert.doesNotMatch(ingest, /catalog\.length<1000|slice\(0,1000\)|batchSize=250/);
});
