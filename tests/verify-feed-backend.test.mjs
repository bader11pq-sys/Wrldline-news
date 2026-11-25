// The preflight script decides "applied vs missing" from PostgREST responses.
// A wrong classification would let us report a broken backend as ready.
// Run: node --test tests/verify-feed-backend.test.mjs
import test from "node:test";
import assert from "node:assert";
import { classify } from "../scripts/verify-feed-backend.mjs";

test("missing table and function codes count as missing", () => {
  assert.equal(classify(404, { code: "PGRST205" }).state, "MISSING");
  assert.equal(classify(404, { code: "PGRST202" }).state, "MISSING");
  assert.equal(classify(400, { code: "42703" }).state, "MISSING");
  assert.equal(classify(404, null).state, "MISSING");
});

test("blocked objects prove the schema exists", () => {
  assert.match(classify(401, { code: "42501", message: "permission denied" }).state, /PRESENT \(blocked/);
  assert.match(classify(403, {}).state, /PRESENT \(blocked/);
  assert.match(classify(400, { message: "permission denied for table user_reading_history" }).state, /PRESENT \(blocked/);
});

test("a reachable object with no rows is present, not missing", () => {
  assert.equal(classify(200, []).state, "PRESENT");
});

test("anything else is surfaced as unexpected rather than guessed", () => {
  assert.equal(classify(500, { code: "XX000" }).state, "UNEXPECTED 500");
  assert.equal(classify(429, {}).state, "UNEXPECTED 429");
});
