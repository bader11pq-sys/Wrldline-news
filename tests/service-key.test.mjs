import test from "node:test";
import assert from "node:assert/strict";
import { resolveSupabaseServiceKey } from "../supabase/functions/_shared/service-key.mjs";

test("prefers the explicitly configured new secret key over the legacy service-role key", () => {
  assert.equal(resolveSupabaseServiceKey({
    SUPABASE_SECRET_KEY: "sb_secret_direct_fixture_key_123456",
    SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-fixture"
  }), "sb_secret_direct_fixture_key_123456");
});

test("reads the default named secret key when the singular variable is absent", () => {
  assert.equal(resolveSupabaseServiceKey({
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_default_fixture_key_123456" })
  }), "sb_secret_default_fixture_key_123456");
});

test("falls back to the legacy service-role key during the compatibility window", () => {
  assert.equal(resolveSupabaseServiceKey({
    SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-fixture"
  }), "legacy-service-role-fixture");
});

test("does not mistake a publishable key for a service credential", () => {
  assert.equal(resolveSupabaseServiceKey({
    SUPABASE_SECRET_KEY: "sb_publishable_wrong_fixture",
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_publishable_wrong_fixture" })
  }), null);
});

test("ignores malformed or missing named-key JSON and fails closed without a legacy key", () => {
  assert.equal(resolveSupabaseServiceKey({ SUPABASE_SECRET_KEYS: "not-json" }), null);
  assert.equal(resolveSupabaseServiceKey({}), null);
});
