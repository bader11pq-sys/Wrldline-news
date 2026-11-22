import assert from "node:assert/strict";
import { test } from "node:test";

test("NewsData sync distinguishes new receipts, duplicate URLs, timeout, and recovery offline", async (t) => {
  const origin = "https://database.example.test";
  const sourceURL = "https://publisher.example.test";
  const articles = new Map();
  const publishedAt = new Date(Date.now() - 10 * 60_000).toISOString();
  const first = { article_id: "fixture-1", link: `${sourceURL}/stories/one`, source_url: sourceURL,
    source_name: "Fixture Publisher", title: "New transit report released", description: "A test description.",
    language: "en", category: ["world"], pubDate: publishedAt };
  let providerRows = [first];
  let failure = false;
  let handler;
  let providerCalls = 0;
  let databaseWrites = 0;
  const oldDeno = globalThis.Deno;
  globalThis.Deno = {
    env: { get: (key) => ({ SUPABASE_URL: origin, SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
      NEWSDATA_API_KEY: "fixture-only" })[key] },
    serve: (callback) => { handler = callback; },
  };
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(input);
    if (url.origin === origin && url.pathname === "/rest/v1/rpc/verify_wrldline_cron_secret") {
      return Response.json(JSON.parse(init.body).p_secret === "fixture-only");
    }
    if (url.origin === "https://newsdata.io" && url.pathname === "/api/1/latest") {
      providerCalls++;
      if (failure) throw new DOMException("Fixture request timed out", "TimeoutError");
      return Response.json({ status: "success", results: providerRows, totalResults: providerRows.length });
    }
    if (url.origin === origin && url.pathname === "/rest/v1/articles") {
      databaseWrites++;
      assert.equal(init.method, "POST");
      assert.equal(url.searchParams.get("on_conflict"), "url");
      assert.equal(new Headers(init.headers).get("Prefer"), "resolution=ignore-duplicates,return=representation");
      const inserted = [];
      for (const row of JSON.parse(init.body)) {
        if (articles.has(row.url)) continue;
        articles.set(row.url, row);
        inserted.push(row);
      }
      return Response.json(inserted, { status: 201 });
    }
    assert.fail(`Unexpected fixture request to ${url.origin}${url.pathname}`);
  });

  try {
    await import("../supabase/functions/newsdata-integration/index.ts");
    assert.equal(typeof handler, "function");
    const sync = (secret = "fixture-only") => handler(new Request(`${origin}/functions/v1/newsdata-integration`, {
      method: "POST", headers: { "x-wrldline-cron-secret": secret }, body: JSON.stringify({ mode: "sync" }),
    }));

    assert.equal((await sync("wrong-fixture")).status, 401);
    assert.equal(providerCalls, 0);
    assert.equal(databaseWrites, 0);

    const initial = await sync();
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).saved_or_updated, 1);
    assert.equal(articles.get(first.link).published_at, publishedAt);
    assert.equal(articles.get(first.link).editorial_status, "published");
    assert.equal(articles.get(first.link).is_breaking, false);

    const replay = await sync();
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).saved_or_updated, 0);
    assert.equal(articles.size, 1);

    failure = true;
    const failed = await sync();
    assert.equal(failed.status, 502);
    assert.match((await failed.json()).error, /timed out/);
    assert.equal(databaseWrites, 2);
    assert.equal(articles.size, 1);

    failure = false;
    const second = { ...first, article_id: "fixture-2", link: `${sourceURL}/stories/two`,
      title: "A second transit update" };
    providerRows = [first, second, { ...second }]; // One old row, one new row, and a repeated input.
    const recovered = await sync();
    assert.equal(recovered.status, 200);
    const result = await recovered.json();
    assert.equal(result.api_results, 3);
    assert.equal(result.eligible_within_48h, 2);
    assert.equal(result.saved_or_updated, 1);
    assert.equal(articles.size, 2);
    assert.equal(articles.get(second.link).source_url, articles.get(first.link).source_url);
  } finally {
    if (oldDeno === undefined) delete globalThis.Deno;
    else globalThis.Deno = oldDeno;
  }
});
