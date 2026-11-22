import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const { PGlite } = createRequire(import.meta.url)("@electric-sql/pglite");
const migration = (name) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

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

test("NewsData handler persists through a disposable SQL URL constraint and the actual public RPC", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  // Stand-in for the pre-existing Supabase base schema, not a migration replay
  // or attestation of production constraints. The provider columns, dedicated
  // lane default, and public reader RPC below come from the real migrations.
  await db.exec(`
    create role anon;
    create role authenticated;
    create table public.articles (
      id uuid primary key default gen_random_uuid(), url text not null unique, guid text, title text, summary text, image_url text,
      lang text, category text, country text, event_country text, source_language text, source_scope text, language_detection text,
      source_name text, source_url text, published_at timestamptz, received_at timestamptz not null default clock_timestamp(),
      is_breaking boolean default false, verification text, correction_note text, corrected_at timestamptz,
      media_type text, content_type text, sponsor_name text, sponsor_url text, ai_country_code text, ai_summary text,
      ai_reader_impact text, ai_watch_next text, ai_risk_level text, ai_risk_score integer, is_exclusive boolean default false,
      exclusive_type text, editorial_status text not null check (editorial_status in ('published','review','rejected')),
      verification_source_count integer, verification_independent_count integer, verification_official_count integer,
      verification_conflict_count integer, verification_correction_count integer, verification_retraction_count integer,
      verification_updated_at timestamptz, verification_note text, editorial_trust_status text, trust_needs_review boolean
    );
    create table public.article_translations (
      article_id uuid references public.articles, lang text, title text, summary text, ai_summary text,
      translation_status text, translation_source text
    );
  `);
  await db.exec(migration("20261114040000_newsdata_provider_integration"));
  await db.exec(`insert into public.articles
    (url, guid, newsdata_article_id, source_name, published_at, editorial_status)
    values ('https://publisher.example.test/legacy', 'legacy', 'legacy', 'Fixture', now()-interval '3 days', 'published')`);
  for (const name of [
    "20261114043000_separate_newsdata_missed_stories",
    "20261121120000_public_home_news_recent_v3",
  ]) await db.exec(migration(name));

  const now = Date.now();
  const date = (minutes) => new Date(now + minutes * 60_000).toISOString();
  const provider = (id, title, minutes) => ({ article_id: id, title, pubDate: date(minutes),
    fetched_at: date(-2), link: `https://publisher.example.test/${id}`, language: "en", category: ["world"] });
  const standard = provider("standard", "Transit council publishes revised report", -30);
  let upstream = [standard, provider("review", "Promo code for example transit tickets", -20),
    provider("expired", "Transit report from three days ago", -4320),
    provider("future", "Transit committee future-dated report", 4),
    provider("invalid-future", "Transit committee report dated tomorrow", 1440)];
  let handler;
  const previousDeno = globalThis.Deno;
  globalThis.Deno = {
    env: { get: (key) => ({ SUPABASE_URL: "https://database.example.test", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
      NEWSDATA_API_KEY: "fixture-only" })[key] },
    serve: (callback) => { handler = callback; },
  };
  t.after(() => { if (previousDeno === undefined) delete globalThis.Deno; else globalThis.Deno = previousDeno; });
  t.mock.method(console, "log", () => {});
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(input);
    if (url.origin === "https://newsdata.io" && url.pathname === "/api/1/latest") {
      return Response.json({ status: "success", results: upstream });
    }
    assert.equal(url.origin, "https://database.example.test");
    if (url.pathname === "/rest/v1/rpc/verify_wrldline_cron_secret") return Response.json(true);
    assert.equal(url.pathname, "/rest/v1/articles");
    assert.equal(url.searchParams.get("on_conflict"), "url");
    assert.equal(new Headers(init.headers).get("Prefer"), "resolution=ignore-duplicates,return=representation");
    // Model PostgREST's insert and representation for the relevant columns;
    // the driver still executes SQL constraints and conflict handling.
    const cols = `url, guid, title, lang, category, source_language, source_url, source_name, content_type, verification,
      published_at, newsdata_fetched_at, newsdata_article_id, newsdata_categories, editorial_status, is_breaking`;
    const result = await db.query(`insert into public.articles (${cols})
      select ${cols} from jsonb_populate_recordset(null::public.articles,$1::jsonb)
      on conflict (url) do nothing returning id`, [init.body]);
    return Response.json(result.rows, { status: 201 });
  });

  // A distinct module instance registers against this fixture's environment.
  await import("../supabase/functions/newsdata-integration/index.ts?sql-contract");
  const sync = async () => {
    const response = await handler(new Request("https://database.example.test/functions/v1/newsdata-integration", {
      method: "POST", headers: { "x-wrldline-cron-secret": "fixture-only" }, body: JSON.stringify({ mode: "sync" }),
    }));
    assert.equal(response.status, 200);
    return response.json();
  };
  const result = await sync();
  assert.equal(result.api_results, 5);
  assert.equal(result.eligible_within_48h, 3);
  assert.equal(result.saved_or_updated, 3);

  upstream = [{ ...standard, title: "Replay must not replace the original" }];
  assert.equal((await sync()).saved_or_updated, 0);
  const stored = (await db.query(`select newsdata_article_id, editorial_status, received_at, newsdata_only
    from public.articles where newsdata_article_id <> 'legacy' order by newsdata_article_id`)).rows;
  assert.deepEqual(stored.map(({ newsdata_article_id, editorial_status, newsdata_only }) =>
    [newsdata_article_id, editorial_status, newsdata_only]),
  [["future", "published", false], ["review", "review", false], ["standard", "published", false]]);
  assert.ok(stored.every(row => row.received_at >= new Date(date(-2))));

  await db.exec("set role anon");
  await assert.rejects(db.query("select received_at from public.articles"), /permission denied/);
  const ordinary = (await db.query(`select * from public.public_home_news_recent_v3(
    p_before => $1, p_newsdata_only => false)`, [date(10)])).rows;
  assert.deepEqual(ordinary.map(row => row.newsdata_article_id), ["standard"]);
  assert.equal(ordinary[0].title, standard.title);
  assert.equal(ordinary[0].published_at.toISOString(), standard.pubDate);
  assert.equal(ordinary[0].newsdata_fetched_at.toISOString(), date(-2));
  assert.equal(ordinary[0].is_breaking, false);
  assert.equal(Object.hasOwn(ordinary[0], "received_at"), false);
  const dedicated = (await db.query("select newsdata_article_id from public.public_home_news_recent_v3(p_newsdata_only => true)")).rows;
  assert.deepEqual(dedicated.map(row => row.newsdata_article_id), ["legacy"]);
});
