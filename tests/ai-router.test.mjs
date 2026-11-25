import test from "node:test";
import assert from "node:assert/strict";
import { classifyError, parseRetryAfter, backoffMs, extractJson, CircuitBreaker, orderProviders,
  estimateCostUsd, runWithFallback, redact, statusFromError, ERROR_KINDS as K } from "../supabase/functions/_shared/ai-router.mjs";

test("classifies provider errors", () => {
  assert.equal(classifyError(401), K.AUTH);
  assert.equal(classifyError(402), K.QUOTA);
  assert.equal(classifyError(429, "daily token quota exceeded"), K.QUOTA);
  assert.equal(classifyError(429, "slow down"), K.RATE_LIMIT);
  assert.equal(classifyError(503), K.TRANSIENT);
  assert.equal(classifyError(400), K.FATAL);
});
test("retry-after and backoff", () => {
  assert.equal(parseRetryAfter("3"), 3000);
  assert.equal(parseRetryAfter("bad"), null);
  assert.equal(parseRetryAfter(new Date(10000).toUTCString(), 4000), 6000);
  assert.equal(backoffMs(2, { random: () => 0.5, baseMs: 100 }), 200);
  assert.equal(backoffMs(9, { retryAfterMs: 99999 }), 30000);
});
test("extractJson tolerates fences and prose", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here: {"a":2} done'), { a: 2 });
  assert.equal(extractJson("no json"), null);
});
test("breaker opens on quota and respects cooldown", () => {
  let t = 0; const b = new CircuitBreaker({ now: () => t, quotaCooldownMs: 1000 });
  b.failure("g", K.QUOTA); assert.ok(b.isOpen("g"));
  t = 1001; assert.ok(!b.isOpen("g"));
  b.failure("x", K.TRANSIENT); b.failure("x", K.TRANSIENT); assert.ok(!b.isOpen("x"));
  b.failure("x", K.TRANSIENT); assert.ok(b.isOpen("x"));
});
test("orders by task and priority, skips open breakers", () => {
  const b = new CircuitBreaker(); b.failure("c", K.AUTH);
  const ps = [{ name: "a", priority: 2 }, { name: "b", priority: 1, tasks: ["translate"] }, { name: "c", priority: 0 }];
  assert.deepEqual(orderProviders(ps, "translate", b).map((p) => p.name), ["b", "a"]);
  assert.deepEqual(orderProviders(ps, "classify", b).map((p) => p.name), ["a"]);
});
test("cost estimate", () => assert.equal(estimateCostUsd({ inputTokens: 1e6, outputTokens: 5e5 }, { inputPerM: 1, outputPerM: 2 }), 2));
test("falls back from quota-exhausted provider and records usage without secrets", async () => {
  const usage = [];
  const out = await runWithFallback({
    providers: [{ name: "p1", priority: 1 }, { name: "p2", priority: 2, price: { inputPerM: 1, outputPerM: 1 } }],
    task: "classify", request: {}, sleep: async () => {}, onUsage: (r) => usage.push(r),
    call: async (p) => p.name === "p1" ? { ok: false, status: 429, error: "daily quota" }
      : { ok: true, text: '{"topic":"economy"}', usage: { inputTokens: 100, outputTokens: 50 } },
  });
  assert.equal(out.ok, true); assert.equal(out.provider, "p2"); assert.deepEqual(out.result, { topic: "economy" });
  assert.equal(usage.length, 2); assert.ok(!JSON.stringify(usage).match(/key|secret/i));
});
test("retries transient errors then succeeds; invalid output falls through; total failure reports", async () => {
  let n = 0;
  const ok = await runWithFallback({ providers: [{ name: "p" }], task: "t", request: {}, sleep: async () => {},
    call: async () => ++n < 3 ? { ok: false, status: 503 } : { ok: true, json: { v: 1 } } });
  assert.equal(ok.ok, true); assert.equal(n, 3);
  const bad = await runWithFallback({ providers: [{ name: "p" }], task: "t", request: {}, sleep: async () => {},
    call: async () => ({ ok: true, text: "garbage" }) });
  assert.equal(bad.ok, false); assert.equal(bad.attempts[0].kind, K.INVALID_OUTPUT);
});

test("extractJson matches production parser behaviours", () => {
  assert.deepEqual(extractJson('<think>{"x":0}</think>{"title":"a,}","n":1,}'), { title: "a,}", n: 1 });
  assert.deepEqual(extractJson('{"t":"line\nbreak"}'), { t: "line\nbreak" });
  assert.deepEqual(extractJson('{"a":{"b":"}"}} trailing'), { a: { b: "}" } });
  assert.equal(extractJson("[1,2]"), null);
  assert.equal(extractJson(undefined), null);
});
test("redact removes credentials", () => {
  const r = redact('Authorization: Bearer abcdefghijklmnop1234 api_key="ZZZZZZZZZZZZ" gsk_abcdefghijklmnopqrstu');
  assert.ok(!/abcdefghijklmnop1234|ZZZZZZZZZZZZ|gsk_abcdefghij/.test(r), r);
});
test("status inference and DeepL 456", () => {
  assert.equal(statusFromError(new Error("Groq API 429: slow")), 429);
  assert.equal(statusFromError({ status: 503 }), 503);
  assert.equal(statusFromError("boom"), 0);
  assert.equal(classifyError(456), K.QUOTA);
});
test("persists cooldown via callback and honours custom cooldown", async () => {
  const cds = [];
  const out = await runWithFallback({ providers: [{ name: "a" }, { name: "b" }], task: "t", request: {}, sleep: async () => {},
    cooldownFor: (p, kind) => (p.name === "a" ? 5000 : null), onCooldown: (n, ms, kind) => cds.push([n, ms, kind]),
    call: async (p) => p.name === "a" ? { ok: false, status: 500, error: "x" } : { ok: true, json: { ok: 1 } } });
  assert.equal(out.provider, "b"); assert.deepEqual(cds[0].slice(0, 2), ["a", 5000]);
});
test("telemetry errors never break routing and attempts hold no secrets", async () => {
  const out = await runWithFallback({ providers: [{ name: "a" }], task: "t", request: {}, onUsage: () => { throw new Error("db down"); },
    call: async () => ({ ok: true, json: { v: 1 } }) });
  assert.equal(out.ok, true);
  const f = await runWithFallback({ providers: [{ name: "a" }], task: "t", request: {}, maxRetries: 0,
    call: async () => ({ ok: false, status: 401, error: "bad Bearer sk-abcdefghijklmnopqrstuvwxyz" }) });
  assert.ok(!JSON.stringify(f).includes("abcdefghijklmnopqrstuvwxyz"));
});
test("deadline stops retry sleeping", async () => {
  let t = 0, calls = 0;
  const out = await runWithFallback({ providers: [{ name: "a" }], task: "t", request: {}, deadlineMs: 100, now: () => t,
    sleep: async (ms) => { t += ms; }, random: () => 1, call: async () => { calls++; t += 60; return { ok: false, status: 503 }; } });
  assert.equal(out.ok, false); assert.ok(calls <= 2);
});
test("stable order for equal priority", () => {
  assert.deepEqual(orderProviders([{ name: "x" }, { name: "y" }, { name: "z" }], "t").map((p) => p.name), ["x", "y", "z"]);
});
