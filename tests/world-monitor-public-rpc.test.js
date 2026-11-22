"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("world monitor uses a restricted public RPC and keeps boundaries independent from feed availability", () => {
  const map = read("map.js");
  const html = read("map.html");
  assert.match(map, /\/rest\/v1\/rpc\/public_world_monitor_feed/);
  assert.match(map, /p_hours:24,p_limit:1000/);
  assert.doesNotMatch(map, /\/rest\/v1\/articles\?/);
  assert.doesNotMatch(map, /WRLDLINE_AUTH|getAccessToken/);
  assert.match(map, /credentials:"omit"/);
  assert.match(map, /map boundaries unavailable/);
  assert.match(html, /editorial-display\.js\?v=20261122-metadata[\s\S]*map\.js\?v=20261122-metadata/);
  assert.match(map, /WLEditorial\.codeOf\(a\.ai_country_code\)/);
  assert.match(map, /WLEditorial\.eventTypeLabel/);
});

test("source directory uses database-side aggregation and safe external links", () => {
  const script = read("intelligence-sources.js");
  const html = read("sources.html");
  assert.match(script, /\/rest\/v1\/rpc\/public_source_directory/);
  assert.match(script, /p_hours: 72, p_limit: 300/);
  assert.doesNotMatch(script, /\/rest\/v1\/articles\?/);
  assert.match(script, /credentials: "omit"/);
  assert.match(script, /safeUrl/);
  assert.match(html, /intelligence-sources\.js\?v=20261121-public-rpc1/);
});

test("public monitor RPC migrations expose only narrow projections and never grant article table SELECT", () => {
  const migration = read("supabase/migrations/20261121130000_public_world_monitor_and_source_directory.sql");
  const mapFn = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.public_world_monitor_feed"), migration.indexOf("REVOKE ALL ON FUNCTION public.public_world_monitor_feed"));
  const sourceFn = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.public_source_directory"), migration.indexOf("REVOKE ALL ON FUNCTION public.public_source_directory"));
  assert.match(mapFn, /SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/i);
  assert.match(mapFn, /a\.editorial_status = 'published'/);
  assert.match(mapFn, /a\.ai_classification_status = 'classified'/);
  assert.match(mapFn, /a\.ai_confidence >= 0\.68/);
  assert.match(mapFn, /a\.published_at >= now\(\)/);
  assert.match(mapFn, /telegram/);
  assert.doesNotMatch(mapFn, /ai_confidence numeric|ai_classification_status text|received_at|trust_review_note|human_translation_note/);
  assert.match(sourceFn, /GROUP BY s\.source_name/);
  assert.match(sourceFn, /count\(\*\)/);
  assert.match(sourceFn, /max\(s\.published_at\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.public_world_monitor_feed\(integer, integer\)[\s\S]*?FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.public_world_monitor_feed\(integer, integer\)[\s\S]*?TO anon, authenticated/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.public_source_directory\(integer, integer\)[\s\S]*?FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.public_source_directory\(integer, integer\)[\s\S]*?TO anon, authenticated/i);
  assert.doesNotMatch(migration, /GRANT\s+SELECT\s+ON\s+(?:public\.)?articles\s+TO\s+anon/i);
});
