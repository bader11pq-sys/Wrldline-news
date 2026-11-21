"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const source = read("supabase/functions/newsdata-integration/index.ts");

test("NewsData ingestion never marks an article classified before AI analysis", () => {
  assert.doesNotMatch(source, /ai_classification_status\s*:\s*["']classified["']/);
  assert.match(source, /Leave ai_classification_status to the database default \(pending\)/);
  assert.match(source, /editorial_status:\s*["']published["']/);
  assert.match(source, /on_conflict=url/);
  assert.match(source, /resolution=merge-duplicates/);
});

test("legacy NewsData rows falsely marked classified are expired, not reprocessed after one hour", () => {
  const migration = read("supabase/migrations/20261121143000_expire_mislabelled_newsdata_imports.sql");
  assert.match(migration, /newsdata_article_id IS NOT NULL/);
  assert.match(migration, /received_at >= now\(\) - interval '48 hours'/);
  assert.match(migration, /published_at < now\(\) - interval '1 hour'/);
  assert.match(migration, /ai_classification_status = 'classified'/);
  assert.match(migration, /ai_country_code IS NULL/);
  assert.match(migration, /ai_confidence IS NULL/);
  assert.match(migration, /ai_summary IS NULL/);
  assert.match(migration, /SET\\s+ai_classification_status = 'expired'/);
});
