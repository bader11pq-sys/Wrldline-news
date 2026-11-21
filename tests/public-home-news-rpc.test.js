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
  assert.match(migration, /grant execute on function[\s\S]*?to anon, authenticated/i);
  assert.doesNotMatch(migration, /grant\s+select\s+on\s+public\.articles\s+to\s+anon/i);
});

test("homepage and newsroom consume the enriched v3 feed and expose verification metadata", () => {
  const homepage = read("script.js");
  const newsroom = read("newsroom.js");
  const migration = read("supabase/migrations/20261121120000_public_home_news_recent_v3.sql");
  assert.ok(homepage.includes("/rest/v1/rpc/public_home_news_recent_v3"));
  assert.ok(newsroom.includes("/rest/v1/rpc/public_home_news_recent_v3"));
  assert.match(homepage, /ai_reader_impact/);
  assert.match(homepage, /ai_watch_next/);
  assert.ok(migration.includes("create or replace function public.public_home_news_recent_v3"));
  assert.match(migration, /security definer set search_path to 'pg_catalog'/i);
  assert.ok(migration.includes("grant execute on function public.public_home_news_recent_v3("));
  assert.ok(migration.includes("to anon, authenticated;"));

  assert.ok(!migration.includes("grant select on public.articles to anon"));
});

test("most-read module is backed by published article views and a minimum distinct-reader threshold", () => {
  const homepage = read("index.html");
  const script = read("script.js");
  const migration = read("supabase/migrations/20261115100000_reader_impact_intelligence.sql");
  assert.ok(homepage.includes('id="popularStoriesSection"'));
  assert.ok(homepage.includes("الأكثر قراءة"));
  assert.ok(script.includes("/rest/v1/rpc/public_top_read_articles"));
  assert.ok(script.includes("p_days:7,p_limit:5"));
  assert.ok(script.includes("renderPopularStories(popularRows)"));
  assert.ok(migration.includes("create or replace function public.public_top_read_articles"));
  assert.ok(migration.includes("e.event_name = 'view_article'"));
  assert.ok(migration.includes("having count(distinct e.session_id) >= 3"));
  assert.ok(!migration.includes("session_id, event_id"));
  assert.ok(migration.includes("grant execute on function public.public_top_read_articles(integer, integer) to anon, authenticated;"));
});


test("WRLDLINE Shorts uses the allowlisted public news RPC instead of direct articles SELECT", () => {
  const shorts = read("shorts.js");
  const migration = read("supabase/migrations/20261121120000_public_home_news_recent_v3.sql");
  assert.match(shorts, /\/rest\/v1\/rpc\/public_home_news_recent_v3/);
  assert.match(shorts, /method:"POST"/);
  assert.match(shorts, /p_limit:limit/);
  assert.match(shorts, /p_offset:offset/);
  assert.doesNotMatch(shorts, /\/rest\/v1\/articles\?/);
  assert.match(migration, /create or replace function public\.public_home_news_recent_v3/);
  assert.match(migration, /article_translations jsonb/);
  assert.match(migration, /verification_independent_count integer/);
  assert.match(migration, /editorial_trust_status text/);
  assert.match(migration, /revoke all on function public\.public_home_news_recent_v3/);
  assert.match(migration, /media_type text/);
});
