import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const workerSource = await readFile(new URL("cloudflare/workers/wrldline-jobs/worker.js", root));
const { default: worker } = await import(`data:text/javascript;base64,${workerSource.toString("base64")}`);

const routes = [
  ["wrldline-news-general", "general", "*/3 * * * *", "GENERAL_QUEUE"],
  ["wrldline-news-breaking", "breaking", "*/2 * * * *", "BREAKING_QUEUE"],
];

for (const [workflow, script, code] of [
  ["bot.yml", "bot-ingest.js", "WRLDLINE_RSS_DISABLED"],
  ["breaking.yml", "bot-breaking.js", "WRLDLINE_RSS_BREAKING_DISABLED"],
]) {
  test(`${workflow} is a manual, credential-free RSS status diagnostic`, async () => {
    const yaml = await readFile(new URL(`.github/workflows/${workflow}`, root), "utf8");
    assert.match(yaml, /^on:\r?\n[ \t]+workflow_dispatch:\r?\n(?=\S)/m);
    assert.doesNotMatch(yaml, /secrets\s*(?:\.|\[)|SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(yaml, /^[ \t]+persist-credentials: false$/m);
    const executions = [...yaml.matchAll(/^[ \t]+run:\s*(.+)$/gm)].map(([, run]) => run.trim());
    assert.deepEqual(executions, [`node ${script}`]);
    const output = execFileSync(process.execPath, [fileURLToPath(new URL(script, root))], {
      cwd: fileURLToPath(root),
      encoding: "utf8",
      env: {},
    });
    assert.match(output, new RegExp(`^${code}:`));
  });
}

test("old Cloudflare cron slots enqueue nothing even when producer switches are on", async (t) => {
  const send = t.mock.fn(async () => {});
  const env = {
    WRLDLINE_PRODUCERS_ENABLED: "true",
    WRLDLINE_GENERAL_PRODUCER_ENABLED: "true",
    WRLDLINE_BREAKING_PRODUCER_ENABLED: "true",
    CLASSIFICATION_QUEUE: { send },
    TRANSLATION_QUEUE: { send },
    ...Object.fromEntries(routes.map(([, , , binding]) => [binding, { send }])),
  };
  const log = t.mock.method(console, "warn", () => {});
  for (const [, , cron] of routes) {
    await worker.scheduled({ cron, scheduledTime: Date.now() }, env);
  }
  assert.equal(send.mock.callCount(), 0);
  assert.deepEqual(log.mock.calls.map(({ arguments: [line] }) => JSON.parse(line).event),
    ["unknown_cron", "unknown_cron"]);
});

test("backlogged legacy queue messages are discarded without a request or a retry", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () => new Response("Unexpected request", { status: 500 }));
  t.mock.method(console, "error", () => {});
  for (const [queue, task] of routes) {
    // Even a stale payload that claims an otherwise supported task may not revive either queue.
    for (const candidate of [task, "classification", "translation", undefined]) {
      const ack = t.mock.fn();
      const retry = t.mock.fn();
      const message = { body: { task: candidate, scheduled_at: new Date().toISOString() }, ack, retry };
      await worker.queue({ queue, messages: [message] }, {
        SUPABASE_PUBLISHABLE_KEY: "fixture-only",
        WRLDLINE_CRON_SECRET: "fixture-only",
      });
      assert.equal(ack.mock.callCount(), 1);
      assert.equal(retry.mock.callCount(), 0);
    }
  }
  assert.equal(request.mock.callCount(), 0);
});

test("translation is routed explicitly in translation mode; classification retains its own route", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    requests.push({ path: new URL(input).pathname, body: JSON.parse(init.body) });
    return new Response("{}", { status: 200 });
  });
  t.mock.method(console, "log", () => {});
  for (const task of ["classification", "translation"]) {
    const ack = t.mock.fn();
    const retry = t.mock.fn();
    await worker.queue({
      queue: `wrldline-news-${task}`,
      messages: [{ body: { task, scheduled_at: new Date().toISOString() }, ack, retry }],
    }, { SUPABASE_PUBLISHABLE_KEY: "fixture-only", WRLDLINE_CRON_SECRET: "fixture-only" });
    assert.equal(ack.mock.callCount(), 1);
    assert.equal(retry.mock.callCount(), 0);
  }
  assert.deepEqual(requests, [
    { path: "/functions/v1/classify-news-worker", body: {} },
    { path: "/functions/v1/wrldline-news-ingest", body: { mode: "translation" } },
  ]);
});
