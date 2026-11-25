import test from "node:test";
import assert from "node:assert/strict";
import { authorizeHealthcheck, timingSafeEqual } from "../supabase/functions/ai-provider-healthcheck/auth.mjs";

const SECRET_KEY = "sb_secret_" + "A".repeat(22) + "_" + "B".repeat(8);
const CRON = "c".repeat(40);
const env = { SUPABASE_URL: "https://x.supabase.test", SUPABASE_SECRET_KEY: SECRET_KEY, SUPABASE_ANON_KEY: "anon-fixture" };
function net({ cronOk = true, role = null, rpcStatus = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: init.body });
    if (String(url).endsWith("verify_wrldline_cron_secret")) {
      const h = new Headers(init.headers);
      // Supabase rejects opaque secret keys sent as Bearer tokens: this is the production 401.
      if (/^Bearer\s+sb_secret_/.test(h.get("authorization") || "")) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify(cronOk && JSON.parse(init.body).p_secret === CRON), { status: rpcStatus });
    }
    if (String(url).endsWith("/auth/v1/user")) return role ? Response.json({ app_metadata: { role } }) : new Response("{}", { status: 401 });
    throw new Error("unexpected " + url);
  };
  return { fetch, calls };
}
const H = (o) => new Headers(o);

test("cron secret is verified via apikey header only (fixes the opaque-key 401)", async () => {
  const n = net();
  const r = await authorizeHealthcheck({ headers: H({ "x-wrldline-cron-secret": CRON, Authorization: "Bearer sb_publishable_xyz" }), env, fetch: n.fetch });
  assert.deepEqual([r.authorized, r.via], [true, "cron_secret"]);
  assert.equal(n.calls[0].headers.get("apikey"), SECRET_KEY);
  assert.equal(n.calls[0].headers.get("authorization"), null);
});
test("legacy service_role JWT keys still work for the verifier call", async () => {
  const legacy = { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "eyJlegacy.jwt.value" };
  const n = { calls: [] };
  const fetch = async (url, init) => { n.calls.push(new Headers(init.headers)); return Response.json(true); };
  const r = await authorizeHealthcheck({ headers: H({ "x-wrldline-cron-secret": CRON }), env: legacy, fetch });
  assert.equal(r.authorized, true);
  assert.equal(n.calls[0].get("authorization"), "Bearer eyJlegacy.jwt.value");
});
test("wrong, short or missing cron secrets are rejected", async () => {
  const n = net();
  assert.equal((await authorizeHealthcheck({ headers: H({ "x-wrldline-cron-secret": "d".repeat(40) }), env, fetch: n.fetch })).authorized, false);
  assert.equal((await authorizeHealthcheck({ headers: H({ "x-wrldline-cron-secret": "short" }), env, fetch: n.fetch })).authorized, false);
  assert.equal((await authorizeHealthcheck({ headers: H({}), env, fetch: n.fetch })).authorized, false);
});
test("verifier outage fails closed", async () => {
  const r = await authorizeHealthcheck({ headers: H({ "x-wrldline-cron-secret": CRON }), env, fetch: async () => { throw new Error("down"); } });
  assert.equal(r.authorized, false); assert.equal(r.reason, "cron_verifier_unreachable");
  const r2 = await authorizeHealthcheck({ headers: H({ "x-wrldline-cron-secret": CRON }), env, fetch: net({ rpcStatus: 500 }).fetch });
  assert.equal(r2.authorized, false);
});
test("exact service key authorizes; near-miss and publishable keys do not", async () => {
  const n = net();
  assert.equal((await authorizeHealthcheck({ headers: H({ Authorization: "Bearer " + SECRET_KEY }), env, fetch: n.fetch })).via, "service_key");
  assert.equal((await authorizeHealthcheck({ headers: H({ apikey: SECRET_KEY }), env, fetch: n.fetch })).via, "service_key");
  assert.equal((await authorizeHealthcheck({ headers: H({ Authorization: "Bearer " + SECRET_KEY + "x" }), env, fetch: n.fetch })).authorized, false);
  assert.equal((await authorizeHealthcheck({ headers: H({ Authorization: "Bearer sb_publishable_abc" }), env, fetch: n.fetch })).authorized, false);
  assert.equal(n.calls.length, 0, "publishable keys never trigger an auth lookup");
});
test("only admin/editor sessions pass; plain users and invalid tokens fail", async () => {
  for (const [role, ok] of [["admin", true], ["editor", true], ["user", false], [null, false]]) {
    const r = await authorizeHealthcheck({ headers: H({ Authorization: "Bearer user.jwt.token" }), env, fetch: net({ role }).fetch });
    assert.equal(r.authorized, ok, String(role));
  }
});
test("no service key configured: cron path cannot authorize", async () => {
  const r = await authorizeHealthcheck({ headers: H({ "x-wrldline-cron-secret": CRON }), env: { SUPABASE_URL: env.SUPABASE_URL }, fetch: net().fetch });
  assert.equal(r.authorized, false);
});
test("timingSafeEqual", () => { assert.ok(timingSafeEqual("abc", "abc")); assert.ok(!timingSafeEqual("abc", "abd")); assert.ok(!timingSafeEqual("abc", "ab")); });
