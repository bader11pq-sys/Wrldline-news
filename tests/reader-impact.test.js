"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("classification schema and prompt require bounded reader relevance and non-speculative next signals", () => {
  const classifier = read("supabase/functions/classify-news/index.ts");
  assert.match(classifier, /reader_impact:\s*\{\s*type:\s*"string"/);
  assert.match(classifier, /watch_next:\s*\{\s*type:\s*"string"/);
  assert.match(classifier, /ai_reader_impact:\s*String\(parsed\.reader_impact\s*\|\|\s*""\)\.slice\(0,\s*900\)/);
  assert.match(classifier, /ai_watch_next:\s*String\(parsed\.watch_next\s*\|\|\s*""\)\.slice\(0,\s*900\)/);
  assert.match(classifier, /لا تقدم نصيحة استثمارية أو شخصية/);
  assert.match(classifier, /لا تخترع موعداً أو حدثاً مستقبلياً/);
});

test("public pages disclose that model context is not human verification or advice", () => {
  const worker = read("cloudflare/workers/wrldline-public/worker.js");
  assert.match(worker, /public_news_article_intelligence/);
  assert.match(worker, /ai_reader_impact/);
  assert.match(worker, /ai_watch_next/);
  assert.ok(worker.includes("لا يُعد تحققاً بشرياً أو تنبؤاً أو نصيحة مالية شخصية"));
  assert.match(worker, /rows\[0\]\.id === id/);
});
