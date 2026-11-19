import { BudgetExceeded, createHandler } from "../supabase/functions/audience-events/handler.ts";
import { MAX_BYTES, readBody, validatePayload } from "../supabase/functions/audience-events/validation.ts";
const now = Date.parse("2026-11-15T04:00:00.000Z");
const id = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";
const article = "33333333-3333-4333-8333-333333333333";
const origin = "https://al-ghaib.us.ci";
function assert(value: unknown, message = "assertion failed"): void { if (!value) throw new Error(message); }
function base() { return { version: 1, consent: true, operation: "events", events: [{ event_id: id, name: "page_view", session_id: session, occurred_at: new Date(now).toISOString(), page: "home", locale: "ar", device_type: "desktop", referrer_category: "direct" }] }; }
function rejects(body: unknown) { try { validatePayload(body, now); } catch { return; } throw new Error("unsafe payload accepted"); }
function request(body: unknown, options: { origin?: string; method?: string; auth?: string; type?: string } = {}) {
  return new Request("https://collector.invalid", { method: options.method || "POST", headers: { origin: options.origin ?? origin, "content-type": options.type || "application/json", ...(options.auth ? { authorization: options.auth } : {}) }, body: options.method === "OPTIONS" || options.method === "GET" ? undefined : JSON.stringify(body) });
}
Deno.test("strict validation: consent, unknown keys, PII/free text, UUIDs, enumerations and timestamps", () => {
  validatePayload(base(), now);
  for (const patch of [{ consent: false }, { consent: "true" }, { consent: null }, { email: "person@example.test" }, { referrer: "https://example.test/?q=private" }, { operation: "paid_conversion" }, { version: 2 }]) rejects({ ...base(), ...patch });
  for (const patch of [{ title: "private title" }, { search_text: "private search" }, { source_domain: "example.test" }, { page: "/account/user@example.test" }, { session_id: "sql';DROP TABLE x" }, { article_id: "123" }, { name: "plus_paid" }, { category: "custom-user-input" }, { active_ms: 1 }, { has_query: "yes" }, { results_count: 1001 }, { referrer_category: "https://example.test" }, { occurred_at: "2027-01-01T00:00:00.000Z" }, { occurred_at: "2026-11-10T00:00:00.000Z" }]) rejects({ ...base(), events: [{ ...base().events[0], ...patch }] });
  rejects({ ...base(), events: [] }); rejects({ ...base(), events: Array(11).fill(base().events[0]) }); rejects({ ...base(), events: [base().events[0], base().events[0]] });
  rejects({ ...base(), events: [{ ...base().events[0], name: "article_read", article_id: article, active_ms: 60001 }] });
  validatePayload({ ...base(), events: [{ ...base().events[0], name: "article_read", article_id: article, active_ms: 15000 }] }, now);
});
Deno.test("streaming body cap works without Content-Length", async () => {
  let failed = false;
  try { await readBody(new Request("https://collector.invalid", { method: "POST", body: " ".repeat(MAX_BYTES + 1) })); } catch { failed = true; }
  assert(failed);
  assert((await readBody(request(base())) as { consent: boolean }).consent);
});
Deno.test("origin/cors, methods, consent and content type fail before service RPC", async () => {
  let calls = 0;
  const handler = createHandler({ origins: new Set([origin]), now: () => now, rpc: async () => { calls++; return { accepted: 1 }; }, user: async () => null });
  assert((await handler(request(base(), { origin: "https://al-ghaib.us.ci.evil.test" }))).status === 403);
  assert((await handler(request(base(), { origin: "null" }))).status === 403);
  assert((await handler(request(base(), { origin: "" }))).status === 403);
  assert((await handler(request(base(), { method: "GET" }))).status === 405);
  assert((await handler(request(base(), { type: "text/plain" }))).status === 415);
  const preflight = await handler(request(null, { method: "OPTIONS" }));
  assert(preflight.status === 204); assert(preflight.headers.get("Access-Control-Allow-Origin") === origin);
  assert((await handler(request({ ...base(), consent: false }))).status === 400);
  assert(calls === 0);
  const accepted = await handler(request(base())); assert(accepted.status === 200); assert(calls === 1);
  assert(accepted.headers.get("cache-control") === "no-store");
});
Deno.test("one session per batch and bounded per-session event rate", async () => {
  const handler = createHandler({ origins: new Set([origin]), now: () => now, rpc: async () => ({ accepted: 1 }), user: async () => null });
  const mixed = { ...base(), events: [base().events[0], { ...base().events[0], event_id: article, session_id: article }] };
  assert((await handler(request(mixed))).status === 400);
  for (let i = 0; i < 60; i++) assert((await handler(request(base()))).status === 200);
  assert((await handler(request(base()))).status === 429);
});
Deno.test("verified PLUS requires a valid authenticated user, never browser payment fields", async () => {
  let args: Record<string, unknown> = {}, calls = 0;
  const handler = createHandler({ origins: new Set([origin]), now: () => now, user: async token => token === "a".repeat(40) ? article : null, rpc: async (name, input) => { calls++; assert(name === "audience_verify_plus"); args = input; return { verified: true, paid_receipt_verified: false }; } });
  const payload = { version: 1, consent: true, operation: "verify_plus", event_id: id, session_id: session };
  assert((await handler(request(payload))).status === 401);
  assert((await handler(request(payload, { auth: "Bearer " + "b".repeat(40) }))).status === 401);
  assert(calls === 0);
  assert((await handler(request({ ...payload, paid: true }, { auth: "Bearer " + "a".repeat(40) }))).status === 400);
  const result = await handler(request(payload, { auth: "Bearer " + "a".repeat(40) }));
  assert(result.status === 200); assert(args.p_user_id === article); assert((await result.json()).paid_receipt_verified === false);
});
Deno.test("durable DB cap returns 429 and database details remain private", async () => {
  const limited = createHandler({ origins: new Set([origin]), now: () => now, user: async () => null, rpc: async () => { throw new BudgetExceeded(); } });
  assert((await limited(request(base()))).status === 429);
  const unavailable = createHandler({ origins: new Set([origin]), now: () => now, user: async () => null, rpc: async () => { throw new Error("service-role secret internal details"); } });
  const result = await unavailable(request(base())); assert(result.status === 503); assert(!(await result.text()).includes("secret"));
});

Deno.test("advertiser page has an accepted finite page key", () => {
  const advertiser = base();
  advertiser.events[0].page = "advertise";
  validatePayload(advertiser, now);
  rejects({ ...base(), events: [{ ...base().events[0], page: "/advertise.html" }] });
});
