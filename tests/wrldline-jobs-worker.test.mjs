import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/workers/wrldline-jobs/worker.js";

const env = {
  SUPABASE_PUBLISHABLE_KEY: "publishable-fixture",
  WRLDLINE_CRON_SECRET: "cron-fixture"
};

function interceptConsole(method) {
  const original = console[method];
  const entries = [];
  console[method] = (...args) => {
    for (const arg of args) {
      if (typeof arg !== "string") continue;
      try { entries.push(JSON.parse(arg)); } catch { /* ignore non-JSON output */ }
    }
  };
  return {
    entries,
    restore() { console[method] = original; }
  };
}

test("failed Supabase queue invocation logs the Cloudflare message ID", async () => {
  const originalFetch = globalThis.fetch;
  const output = interceptConsole("error");
  const retries = [];
  let acked = false;
  globalThis.fetch = async () => new Response("Unauthorized", { status: 401 });

  try {
    await worker.queue({
      queue: "wrldline-news-general",
      messages: [{
        id: "fixture-message-401",
        body: { task: "general", scheduled_at: new Date().toISOString() },
        attempts: 1,
        ack() { acked = true; },
        retry(options) { retries.push(options); }
      }]
    }, env);

    const event = output.entries.find(entry => entry.event === "supabase_job_failed");
    assert.equal(event?.message_id, "fixture-message-401");
    assert.equal(event?.queue, "wrldline-news-general");
    assert.equal(event?.status, 401);
    assert.equal(acked, false);
    assert.deepEqual(retries, [{ delaySeconds: 30 }]);
  } finally {
    globalThis.fetch = originalFetch;
    output.restore();
  }
});

test("successful Supabase queue invocation logs the Cloudflare message ID", async () => {
  const originalFetch = globalThis.fetch;
  const output = interceptConsole("log");
  let acked = false;
  const retries = [];
  globalThis.fetch = async () => new Response("ok", { status: 200 });

  try {
    await worker.queue({
      queue: "wrldline-news-classification",
      messages: [{
        id: "fixture-message-200",
        body: { task: "classification", scheduled_at: new Date().toISOString() },
        attempts: 1,
        ack() { acked = true; },
        retry(options) { retries.push(options); }
      }]
    }, env);

    const event = output.entries.find(entry => entry.event === "supabase_job_completed");
    assert.equal(event?.message_id, "fixture-message-200");
    assert.equal(event?.queue, "wrldline-news-classification");
    assert.equal(event?.status, 200);
    assert.equal(acked, true);
    assert.deepEqual(retries, []);
  } finally {
    globalThis.fetch = originalFetch;
    output.restore();
  }
});

test("network failures log the Cloudflare message ID", async () => {
  const originalFetch = globalThis.fetch;
  const output = interceptConsole("error");
  const retries = [];
  globalThis.fetch = async () => { throw new Error("network fixture"); };

  try {
    await worker.queue({
      queue: "wrldline-news-breaking",
      messages: [{
        id: "fixture-message-network",
        body: { task: "breaking", scheduled_at: new Date().toISOString() },
        attempts: 2,
        ack() {},
        retry(options) { retries.push(options); }
      }]
    }, env);

    const event = output.entries.find(entry => entry.event === "supabase_job_network_error");
    assert.equal(event?.message_id, "fixture-message-network");
    assert.equal(event?.queue, "wrldline-news-breaking");
    assert.equal(event?.error, "network fixture");
    assert.deepEqual(retries, [{ delaySeconds: 60 }]);
  } finally {
    globalThis.fetch = originalFetch;
    output.restore();
  }
});

test("scheduled producer can be paused without enqueueing new backlog", async () => {
  const output = interceptConsole("warn");
  let sends = 0;
  try {
    await worker.scheduled({
      cron: "* * * * *",
      scheduledTime: Date.parse("2026-11-18T15:00:00Z")
    }, {
      WRLDLINE_PRODUCERS_ENABLED: "false",
      CLASSIFICATION_QUEUE: { async send() { sends += 1; } }
    });

    const event = output.entries.find(entry => entry.event === "producers_paused");
    assert.equal(event?.cron, "* * * * *");
    assert.equal(event?.scheduled_at, "2026-11-18T15:00:00.000Z");
    assert.equal(sends, 0);
  } finally {
    output.restore();
  }
});

test("scheduled producer fails closed when the opt-in switch is absent", async () => {
  const output = interceptConsole("warn");
  const sent = [];
  try {
    await worker.scheduled({
      cron: "* * * * *",
      scheduledTime: Date.parse("2026-11-18T15:01:00Z")
    }, {
      CLASSIFICATION_QUEUE: {
        async send(message) { sent.push(message); }
      }
    });

    const event = output.entries.find(entry => entry.event === "producers_paused");
    assert.equal(event?.enabled, false);
    assert.match(event?.reason || "", /not explicitly true/);
    assert.equal(sent.length, 0);
  } finally {
    output.restore();
  }
});

test("scheduled producer enqueues only after explicit opt-in", async () => {
  const output = interceptConsole("log");
  const sent = [];
  try {
    await worker.scheduled({
      cron: "* * * * *",
      scheduledTime: Date.parse("2026-11-18T15:02:00Z")
    }, {
      WRLDLINE_PRODUCERS_ENABLED: "true",
      CLASSIFICATION_QUEUE: {
        async send(message) { sent.push(message); }
      }
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].task, "classification");
    assert.equal(sent[0].scheduled_at, "2026-11-18T15:02:00.000Z");
    assert.equal(output.entries.some(entry => entry.event === "jobs_enqueued"), true);
  } finally {
    output.restore();
  }
});

test("stale queue schedule messages are acknowledged without calling Supabase", async () => {
  const originalFetch = globalThis.fetch;
  const output = interceptConsole("warn");
  const oldScheduledAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
  let fetches = 0;
  let acked = false;
  const retries = [];
  globalThis.fetch = async () => { fetches += 1; return new Response("unexpected", { status: 500 }); };

  try {
    await worker.queue({
      queue: "wrldline-news-general",
      messages: [{
        id: "fixture-stale-message",
        body: { task: "general", scheduled_at: oldScheduledAt },
        attempts: 0,
        ack() { acked = true; },
        retry(options) { retries.push(options); }
      }]
    }, env);

    const event = output.entries.find(entry => entry.event === "stale_schedule_message_skipped");
    assert.equal(event?.message_id, "fixture-stale-message");
    assert.equal(event?.queue, "wrldline-news-general");
    assert.equal(event?.scheduled_at, oldScheduledAt);
    assert.equal(acked, true);
    assert.equal(fetches, 0);
    assert.deepEqual(retries, []);
  } finally {
    globalThis.fetch = originalFetch;
    output.restore();
  }
});

test("queue auth-check invokes only the no-write Supabase verifier mode", async () => {
  const originalFetch = globalThis.fetch;
  const output = interceptConsole("log");
  let acked = false;
  let requestedUrl = "";
  let requestedBody = null;
  let requestedHeaders = null;
  globalThis.fetch = async (url, init) => {
    requestedUrl = String(url);
    requestedBody = JSON.parse(init.body);
    requestedHeaders = new Headers(init.headers);
    return new Response(JSON.stringify({ ok: true, mode: "auth-check" }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  };

  try {
    await worker.queue({
      queue: "wrldline-news-general",
      messages: [{
        id: "fixture-auth-check",
        body: { task: "auth-check", scheduled_at: new Date().toISOString() },
        attempts: 0,
        ack() { acked = true; },
        retry() { assert.fail("auth-check should not retry on success"); }
      }]
    }, env);

    assert.equal(requestedUrl, "https://vmaxbnogmmfyrcucapnq.supabase.co/functions/v1/wrldline-news-ingest");
    assert.deepEqual(requestedBody, { mode: "auth-check" });
    assert.equal(requestedHeaders.get("apikey"), env.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(requestedHeaders.get("x-wrldline-cron-secret"), env.WRLDLINE_CRON_SECRET);
    assert.equal(requestedHeaders.has("authorization"), false);
    assert.equal(acked, true);
    const event = output.entries.find(entry => entry.event === "supabase_job_completed");
    assert.equal(event?.task, "auth-check");
    assert.equal(event?.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    output.restore();
  }
});

test("auth-check messages are accepted only on the general queue", async () => {
  const output = interceptConsole("error");
  let acked = false;
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return new Response("unexpected", { status: 200 }); };

  try {
    await worker.queue({
      queue: "wrldline-news-breaking",
      messages: [{
        id: "fixture-auth-check-wrong-queue",
        body: { task: "auth-check", scheduled_at: new Date().toISOString() },
        attempts: 0,
        ack() { acked = true; },
        retry() { assert.fail("invalid queue task should be acknowledged"); }
      }]
    }, env);

    const event = output.entries.find(entry => entry.event === "invalid_queue_message");
    assert.equal(event?.message_id, "fixture-auth-check-wrong-queue");
    assert.equal(acked, true);
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
    output.restore();
  }
});

test("queue messages without scheduled_at are rejected without calling Supabase", async () => {
  const output = interceptConsole("error");
  let acked = false;
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return new Response("unexpected", { status: 200 }); };

  try {
    await worker.queue({
      queue: "wrldline-news-general",
      messages: [{
        id: "fixture-missing-schedule",
        body: { task: "general" },
        attempts: 0,
        ack() { acked = true; },
        retry() { assert.fail("invalid schedule timestamp should be acknowledged"); }
      }]
    }, env);

    const event = output.entries.find(entry => entry.event === "invalid_queue_schedule_timestamp");
    assert.equal(event?.message_id, "fixture-missing-schedule");
    assert.equal(acked, true);
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
    output.restore();
  }
});
