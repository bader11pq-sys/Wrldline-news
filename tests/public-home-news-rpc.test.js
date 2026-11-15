"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("homepage and newsroom use the restricted public feed RPC", () => {
  const homepage = read("script.js");
  const newsroom = read("newsroom.js");

  const fetchStart = homepage.indexOf("async function fetchNews(");
  const fetchEnd = homepage.indexOf("\nfunction renderFetchFailure()", fetchStart);
  assert.ok(fetchStart >= 0 && fetchEnd > fetchStart, "homepage fetchNews function exists");
  const fetchNews = homepage.slice(fetchStart, fetchEnd);

  assert.match(fetchNews, /\/rest\/v1\/rpc\/public_home_news_recent/);
  assert.match(fetchNews, /method:"POST"/);
  assert.doesNotMatch(fetchNews, /\/rest\/v1\/articles/);
  assert.match(newsroom, /\/rest\/v1\/rpc\/public_home_news_recent/);
  assert.doesNotMatch(newsroom, /\/rest\/v1\/articles/);
});

test("public feed migration does not grant anonymous table access", () => {
  const migration = read("supabase/migrations/20261115070000_public_home_news_rpc.sql");
  assert.match(migration, /security definer\s+set search_path = pg_catalog/i);
  assert.match(migration, /grant execute .* to anon, authenticated/i);
  assert.doesNotMatch(migration, /grant\s+select\s+on\s+public\.articles\s+to\s+anon/i);
});
