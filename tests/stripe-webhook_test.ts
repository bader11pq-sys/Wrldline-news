import { allowedPriceIds, customerId, resolveUser, rpcArgs, statusForError } from "../supabase/functions/stripe-webhook/logic.ts";

function eq<T>(a: T, b: T, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ": " + JSON.stringify(a) + " != " + JSON.stringify(b));
}
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

Deno.test("allow-list only contains configured recurring prices", () => {
  const env = (n: string) => ({ STRIPE_PRICE_ID_MONTHLY: "price_m", STRIPE_PRICE_ID_YEARLY: " price_y " } as Record<string, string>)[n];
  eq([...allowedPriceIds(env)].sort(), ["price_m", "price_y"], "prices");
  eq(allowedPriceIds(() => undefined).size, 0, "empty env fails closed");
});

Deno.test("a bound customer user always wins over metadata", () => {
  eq(resolveUser(U1, U2), { userId: U1, conflict: true }, "conflict");
  eq(resolveUser(null, U2), { userId: U2, conflict: false }, "metadata when unbound");
  eq(resolveUser(null, "not-a-uuid"), { userId: null, conflict: false }, "invalid metadata ignored");
});

Deno.test("rpc args: unknown price is not allowed, null period stays null", () => {
  const sub = { id: "sub_1", status: "active", customer: { id: "cus_1" }, items: { data: [{ price: { id: "price_x" } }] }, current_period_end: null };
  const a = rpcArgs({ id: "evt_1", type: "customer.subscription.updated", created: 1_700_000_000 }, sub, U1, new Set(["price_m"]));
  eq(a.p_price_allowed, false, "unknown price");
  eq(a.p_period_end, null, "null period");
  eq(a.p_customer_id, "cus_1", "customer");
  eq(a.p_event_created, "2023-11-14T22:13:20.000Z", "event time");
  const b = rpcArgs({ id: "evt_2", type: "x", created: 1_700_000_000 }, { ...sub, items: { data: [{ price: { id: "price_m" } }] }, current_period_end: 1_700_086_400 }, U1, new Set(["price_m"]));
  eq(b.p_price_allowed, true, "known price");
  eq(b.p_period_end, "2023-11-15T22:13:20.000Z", "period");
});

Deno.test("signature errors are 400 and processing errors are 500 (retryable)", () => {
  eq(statusForError("signature"), 400, "sig");
  eq(statusForError("processing"), 500, "proc");
  eq(customerId("cus_a"), "cus_a", "string customer");
  eq(customerId(null), null, "null customer");
});
