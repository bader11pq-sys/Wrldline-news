import test from "node:test";
import assert from "node:assert/strict";
import { classifyCronVerifierResult } from "../supabase/functions/_shared/cron-auth.mjs";

test("accepts a true result from a successful verifier response", () => {
  assert.deepEqual(classifyCronVerifierResult({ ok: true, value: true }), {
    authorized: true, status: 200, code: "authorized"
  });
});

test("rejects a false result from a successful verifier response as unauthorized", () => {
  assert.deepEqual(classifyCronVerifierResult({ ok: true, value: false }), {
    authorized: false, status: 401, code: "unauthorized"
  });
});

test("reports an unavailable verifier response as service failure, not invalid credentials", () => {
  for (const ok of [false, null, undefined]) {
    assert.deepEqual(classifyCronVerifierResult({ ok, value: false }), {
      authorized: false, status: 503, code: "cron_verifier_unavailable"
    });
  }
});
