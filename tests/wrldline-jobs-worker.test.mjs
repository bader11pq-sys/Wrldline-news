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
        body: { task: "general" },
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
        body: { task: "classification" },
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
        body: { task: "breaking" },
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

test("scheduled producer remains enabled by default for backwards compatibility", async () => {
  const output = interceptConsole("log");
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

    assert.equal(sent.length, 1);
    assert.equal(sent[0].task, "classification");
    assert.equal(sent[0].scheduled_at, "2026-11-18T15:01:00.000Z");
    assert.equal(output.entries.some(entry => entry.event === "jobs_enqueued"), true);
  } finally {
    output.restore();
  }
});
