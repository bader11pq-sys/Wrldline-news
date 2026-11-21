const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "source-catalog.json"), "utf8"));
const ingest = fs.readFileSync(path.join(root, "supabase/functions/wrldline-news-ingest/index.ts"), "utf8");
const breaking = fs.readFileSync(path.join(root, "supabase/functions/breaking-news-monitor/index.ts"), "utf8");
const ingestCli = fs.readFileSync(path.join(root, "bot-ingest.js"), "utf8");
const breakingCli = fs.readFileSync(path.join(root, "bot-breaking.js"), "utf8");
const publicScript = fs.readFileSync(path.join(root, "script.js"), "utf8");

test("the archived RSS catalog remains intact but is not an active collection source", () => {
  assert.equal(catalog.length, 80);
  const urls = catalog.map((source) => source.url);
  assert.equal(new Set(urls).size, 80);
  assert.ok(catalog.every((source) => /^https?:\/\//i.test(source.url)));
  assert.ok(catalog.every((source) => source.name && source.lang && source.pipeline === "general"));
  assert.equal(catalog.filter((source) => source.lang === "ar").length, 68);
  assert.equal(catalog.filter((source) => source.lang === "en").length, 12);
});

test("general RSS ingestion Edge Function is explicitly disabled without deleting old articles", () => {
  assert.match(ingest, /RSS_INGESTION_DISABLED/);
  assert.match(ingest, /status:\\s*410/);
  assert.match(ingest, /Existing articles remain untouched/);
  assert.match(ingestCli, /WRLDLINE_RSS_DISABLED/);
  assert.doesNotMatch(ingestCli, /news\.google\.com\/rss|fetch\(/i);
});

test("breaking RSS collection Edge Function and CLI are explicitly disabled", () => {
  assert.match(breaking, /RSS_INGESTION_DISABLED/);
  assert.match(breaking, /status: 410/);
  assert.match(breaking, /Existing articles remain untouched/);
  assert.match(breakingCli, /WRLDLINE_RSS_BREAKING_DISABLED/);
  assert.doesNotMatch(breakingCli, /news\.google\.com\/rss|fetch\(/i);
});

test("breaking ticker retains the dedicated-source predicate for legacy content only", () => {
  assert.ok(publicScript.includes("function isDedicatedBreakingSource(name)"));
  assert.ok(publicScript.includes("if(!isDedicatedBreakingSource(a.raw?.source_name||a.src))return false;"));
  assert.equal(publicScript.includes("isBreakingSource"), false);
});
