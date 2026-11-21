"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "supabase/functions/newsdata-integration/index.ts"), "utf8");

test("NewsData ingestion never marks an article classified before AI analysis", () => {
  assert.doesNotMatch(source, /ai_classification_status\s*:\s*["']classified["']/);
  assert.match(source, /Leave ai_classification_status to the database default \(pending\)/);
  assert.match(source, /editorial_status:\s*["']published["']/);
  assert.match(source, /on_conflict=url/);
  assert.match(source, /resolution=merge-duplicates/);
});
