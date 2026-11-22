const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const editions = require("../article-editions");
const id = "10000000-0000-4000-8000-000000000001";
const picked = { lang: "en", title: "In the news", summary: "a".repeat(999980) + "\n\nLast paragraph", reviewed_at: "2020-01-01T00:00:00Z", translation_source: "editorial" };
const send = (value, options) => new Response(JSON.stringify(value), options);
const tick = () => new Promise(resolve => setImmediate(resolve));

test("reads only the existing public projection and keeps entire human-reviewed editorial prose", async () => {
  const result = await editions.load(id, "en", undefined, async (url, req) => {
    assert.equal(url.pathname, "/rest/v1/rpc/get_public_article_trust");
    assert.deepEqual(JSON.parse(req.body), { p_article_id: id, p_lang: "en" });
    assert.equal(req.cache, "no-store");
    return send({ id, reviewed_translation: picked });
  });
  assert.equal(result.title, picked.title);
  assert.equal(result.body.length, picked.summary.length);
  assert.ok(result.body.endsWith("Last paragraph"));
  assert.equal(result.editorialEdition, true);
});

test("rejects machine origin, review absence, incorrect language, wrong UUID and unavailable RPC", async () => {
  for (const v of [
    null, { ...picked, translation_source: "machine_draft" }, { ...picked, reviewed_at: null },
    { ...picked, reviewed_at: "2999-01-01T00:00:00Z" }, { ...picked, summary: " " }, { ...picked, lang: "ar" }
  ]) assert.equal(await editions.load(id, "en", undefined, async () => send({ id, reviewed_translation: v })), null);
  assert.equal(await editions.load(id, "en", undefined, async () => send(null)), null);
  await assert.rejects(editions.load(id, "en", undefined, async () => send({ id: "wrong", reviewed_translation: picked })));
  await assert.rejects(editions.load(id, "en", undefined, async () => send({}, { status: 503 })));
  await assert.rejects(editions.load(id, "fr", undefined, () => assert.fail("must not fetch unsupported editions")));
});

test("native-language names, script direction and explicit edition share links", () => {
  const canonical = "https://al-ghaib.us.ci/news/" + id;
  assert.equal(editions.link(canonical, "en"), canonical + "#lang=en");
  assert.equal(editions.requested(editions.link(canonical, "en")), "en");
  assert.equal(editions.requested(canonical + "?lang=ar#lang=en"), "ar");
  assert.equal(editions.originalLanguage("fr-CA", "Titre"), "fr-ca");
  assert.equal(editions.originalLanguage("und", "عنوان"), "ar");
  assert.equal(editions.direction("ar-sa"), "rtl");
});

test("prefetched version swaps title and body in one click and does not fetch again", async () => {
  const dom = new JSDOM("<h1></h1><div id='tools'></div><div id='body'></div>");
  const doc = dom.window.document;
  const [heading, tools, host] = doc.body.children;
  const backup = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; return send({ id, reviewed_translation: picked }); };
  try {
    const pane = editions.mount({ heading, tools, host, id, title: "عنوان", body: "نص", lang: "ar", preferred: "ar" });
    const [ar, en] = tools.querySelectorAll("button");
    await tick();
    en.click();
    assert.equal(heading.textContent, "In the news");
    assert.equal(host.textContent, picked.summary);
    assert.equal(host.dir, "ltr");
    assert.equal(en.getAttribute("aria-pressed"), "true");
    ar.click();
    assert.equal(heading.textContent, "عنوان");
    assert.equal(host.dir, "rtl");
    assert.equal(requests, 1);
    pane.stop();
  } finally { globalThis.fetch = backup; dom.window.close(); }
});
