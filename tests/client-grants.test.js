const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync(require.resolve("../supabase/migrations/20261118161000_tighten_client_table_grants.sql"), "utf8");
const account = fs.readFileSync(require.resolve("../account.html"), "utf8");
const botIngest = fs.readFileSync(require.resolve("../bot-ingest.js"), "utf8");
const ingest = fs.readFileSync(require.resolve("../supabase/functions/wrldline-news-ingest/index.ts"), "utf8");

test("subscription browser access is read-only and authenticated only", () => {
  assert.match(migration, /revoke all on table public\.subscriptions from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.subscriptions to authenticated/i);
  assert.match(migration, /grant all on table public\.subscriptions to service_role/i);
  assert.match(account, /db\.from\(["']subscriptions["']\)\.select\(/);
  assert.doesNotMatch(account, /db\.from\(["']subscriptions["']\)\.(?:insert|upsert|update|delete)\(/);
});

test("ingestion telemetry is not granted to public or authenticated clients", () => {
  assert.match(migration, /revoke all on table public\.news_ingestion_runs from public, anon, authenticated/i);
  assert.match(migration, /grant all on table public\.news_ingestion_runs to service_role/i);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete|all)[^;]*news_ingestion_runs[^;]*\b(?:anon|authenticated)\b/i);
  assert.match(ingest, /news_ingestion_runs/);
  assert.match(ingest, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS|SUPABASE_SECRET_KEY/);
});

test("feed registry remains public-read but browser writes are revoked", () => {
  assert.match(migration, /revoke all on table public\.feeds from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.feeds to anon, authenticated/i);
  assert.match(migration, /grant all on table public\.feeds to service_role/i);
  assert.match(botIngest, /\/rest\/v1\/feeds\?select=/);
  assert.doesNotMatch(migration, /alter table public\.(?:feeds|subscriptions|news_ingestion_runs) disable row level security/i);
});

test("grant tightening does not replace or weaken existing owner/editor RLS policies", () => {
  assert.doesNotMatch(migration, /drop policy|create policy|disable row level security/i);
  assert.match(migration, /begin;/i);
  assert.match(migration, /commit;/i);
});
