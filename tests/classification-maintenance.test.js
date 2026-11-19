"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("classification cleanup failures are warnings, not a gate on fresh-story claims", () => {
  const worker = read("supabase/functions/classify-news-worker/index.ts");
  const migration = read("supabase/migrations/20261115110000_enforce_one_hour_ai_classification_window.sql");

  const maintenanceStart = worker.indexOf("const expired = await db.rpc");
  const claimStart = worker.indexOf('const claimed = await db.rpc("claim_classification_batch"', maintenanceStart);
  assert.ok(maintenanceStart >= 0 && claimStart > maintenanceStart, "maintenance precedes the claim RPC");
  const maintenance = worker.slice(maintenanceStart, claimStart);

  assert.match(maintenance, /WRLDLINE_CLASSIFICATION_MAINTENANCE_WARNING/);
  assert.match(maintenance, /operation: "expire_stale_classification_queue"/);
  assert.match(maintenance, /operation: "release_stale_classification_claims"/);
  assert.doesNotMatch(maintenance, /return json\([\s\S]*?,\s*500\)/);

  const claimFunction = migration.slice(migration.indexOf("create or replace function public.claim_classification_batch"));
  assert.match(claimFunction, /published_at >= now\(\) - interval '1 hour'/);
  assert.match(claimFunction, /published_at <= now\(\) \+ interval '5 minutes'/);
  assert.match(claimFunction, /for update skip locked/i);
});

test("classification worker still claims one story per invocation", () => {
  const worker = read("supabase/functions/classify-news-worker/index.ts");
  assert.match(worker, /claim_classification_batch",\s*\{\s*p_limit:\s*1\s*\}/);
});
