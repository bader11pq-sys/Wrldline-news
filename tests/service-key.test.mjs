import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveSupabaseServiceKey,
  serviceApiHeaders,
  serviceClientOptions
} from "../supabase/functions/_shared/service-key.mjs";

const newSecret = "sb_secret_" + "a".repeat(22) + "_" + "b".repeat(8);

test("prefers the explicitly configured new secret key over the legacy service-role key", () => {
  assert.equal(resolveSupabaseServiceKey({
    SUPABASE_SECRET_KEY: newSecret,
    SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-fixture"
  }), newSecret);
});

test("reads the default named secret key when the singular variable is absent", () => {
  assert.equal(resolveSupabaseServiceKey({
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: newSecret })
  }), newSecret);
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

test("uses apikey only for a new secret key in raw REST/Edge requests", () => {
  const headers = serviceApiHeaders(newSecret);
  assert.equal(headers.apikey, newSecret);
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers["Content-Type"], "application/json");
});

test("preserves the legacy Bearer header during the compatibility window", () => {
  const headers = serviceApiHeaders("legacy-service-role-fixture");
  assert.equal(headers.apikey, "legacy-service-role-fixture");
  assert.equal(headers.Authorization, "Bearer legacy-service-role-fixture");
});

test("removes the Authorization API-key header in supabase-js requests for new secret keys", async () => {
  let captured;
  const options = serviceClientOptions(newSecret, async (_input, init) => {
    captured = new Headers(init.headers);
    return new Response("ok");
  });
  await options.global.fetch(new Request("https://project.invalid/rest/v1/feeds", {
    headers: { apikey: newSecret, Authorization: "Bearer " + newSecret }
  }));
  assert.equal(captured.get("apikey"), newSecret);
  assert.equal(captured.has("Authorization"), false);
});

test("keeps standard supabase-js setup for legacy service-role JWTs", () => {
  const options = serviceClientOptions("legacy-service-role-fixture");
  assert.equal(options.global, undefined);
  assert.deepEqual(options.auth, { persistSession: false, autoRefreshToken: false });
});
