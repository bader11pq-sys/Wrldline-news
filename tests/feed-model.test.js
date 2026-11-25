const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../feed-model.js");

const NOW = Date.parse("2026-11-25T12:00:00Z");
const ago = (h) => new Date(NOW - h * 3600000).toISOString();
let n = 0;
const row = (o = {}) => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, title: `Headline ${n}`, summary: "", category: "world",
  event_country: "", source_name: `Src${n}`, url: `https://example.org/${n}`, published_at: ago(1), is_breaking: false, content_type: "news",
  editorial_trust_status: "unconfirmed", source_language: "en", ...o });
const art = (o, lang = "en") => F.toArticle(row(o), lang);

test("validateFollow accepts only known types and sanitises values", () => {
  assert.deepEqual(F.validateFollow("country", "sa"), { ok: true, value: "SAU" });
  assert.deepEqual(F.validateFollow("country", "Saudi Arabia"), { ok: false, reason: "value" });
  assert.equal(F.validateFollow("topic", "ai").ok, true);
  assert.equal(F.validateFollow("topic", "nonsense").ok, false);
  assert.equal(F.validateFollow("category", "economy").ok, true);
  assert.equal(F.validateFollow("category", "Eco<script>").ok, false);
  assert.equal(F.validateFollow("device", "x").ok, false);
  assert.equal(F.validateFollow("interest", " <b>x</b> ").value, "b x /b");
  assert.equal(F.validateFollow("interest", "a").ok, false);
  assert.equal(F.validateFollow("interest", "x".repeat(200)).value.length, 40);
});

test("parseFollows maps legacy country names and ignores bad rows", () => {
  const f = F.parseFollows([
    { target_type: "country", target_value: "Saudi Arabia" }, { target_type: "country", target_value: "SAU" },
    { target_type: "category", target_value: "economy" }, { target_type: "bogus", target_value: "x" }, null, { target_type: "topic", target_value: "" }]);
  assert.deepEqual(f.country, ["SAU"]);
  assert.deepEqual(f.category, ["economy"]);
});

test("followed category and country outrank an equally fresh unrelated article", () => {
  const items = [art({ title: "A", category: "sports", source_name: "S1" }), art({ title: "B", category: "economy", event_country: "SAU", source_name: "S2" })];
  const ranked = F.rank(items, { now: NOW, follows: { category: ["economy"], country: ["SAU"] } });
  assert.equal(ranked[0].article.title, "B");
  assert.deepEqual(ranked[0].reasons.map((r) => r.type).sort(), ["category", "country"]);
});

test("Arabic topic and interest matching normalises diacritics and alef forms", () => {
  const a = art({ title: "اتفاق جديد حول الذكاءَ الاصطناعي في المنطقة", source_language: "ar" }, "ar");
  const b = art({ title: "Unrelated", summary: "nothing" });
  const ranked = F.rank([a, b], { now: NOW, follows: { topic: ["ai"], interest: ["المنطقة"] } });
  assert.equal(ranked[0].article.id, a.id);
  assert.ok(ranked[0].reasons.some((r) => r.type === "topic") && ranked[0].reasons.some((r) => r.type === "interest"));
});

test("recency decays: a fresh story beats an old one with identical signals", () => {
  const fresh = art({ published_at: ago(1), source_name: "A" }), old = art({ published_at: ago(72), source_name: "B" });
  assert.equal(F.rank([old, fresh], { now: NOW })[0].article.id, fresh.id);
});

test("reading history only matters when supplied, decays, and cannot beat explicit follows", () => {
  const sports = art({ category: "sports", source_name: "S1" }), econ = art({ category: "economy", source_name: "S2" });
  const history = Array.from({ length: 30 }, (_, i) => ({ id: `h${i}`, category: "sports", country: null, source: "x", at: NOW - i * 1000 }));
  assert.equal(F.rank([econ, sports], { now: NOW, history })[0].article.id, sports.id);
  const noHistory = F.rank([econ, sports], { now: NOW, history: [] });
  assert.ok(noHistory.every((r) => !r.reasons.some((x) => x.type.startsWith("history"))));
  const explicit = F.rank([econ, sports], { now: NOW, history, follows: { category: ["economy"] } });
  assert.equal(explicit[0].article.id, econ.id);
  const stale = history.map((e) => ({ ...e, at: NOW - 200 * 86400000 }));
  assert.equal(F.buildProfile(stale, NOW).size, 0);
});

test("already-read articles are demoted and saved ones flagged", () => {
  const a = art({ source_name: "A" }), b = art({ source_name: "B" });
  const ranked = F.rank([a, b], { now: NOW, readIds: new Set([a.id]), savedIds: new Set([b.id]) });
  assert.equal(ranked[0].article.id, b.id);
});

test("diversity: no source dominates and exploration promotes unfollowed items", () => {
  const followed = Array.from({ length: 8 }, (_, i) => art({ category: "economy", source_name: "Same", title: `Eco ${i}`, published_at: ago(1 + i) }));
  const other = Array.from({ length: 3 }, (_, i) => art({ category: "culture", source_name: `Other${i}`, title: `Cul ${i}`, published_at: ago(2 + i) }));
  const ranked = F.rank([...followed, ...other], { now: NOW, follows: { category: ["economy"] }, maxPerSource: 3, exploreEvery: 5 });
  assert.equal(ranked.length, 11, "nothing is dropped");
  assert.ok(ranked.slice(0, 6).filter((r) => r.article.source === "Same").length <= 3);
  assert.equal(ranked[4].explicit, 0, "slot 5 is an exploration slot");
  assert.equal(ranked[4].explore, true);
});

test("an unpersonalised reader gets a plain recency ranking without exploration marks", () => {
  const items = [art({ published_at: ago(5), source_name: "A" }), art({ published_at: ago(1), source_name: "B" }), art({ published_at: ago(3), source_name: "C" })];
  const ranked = F.rank(items, { now: NOW });
  assert.deepEqual(ranked.map((r) => r.article.id), [items[1].id, items[2].id, items[0].id]);
  assert.ok(ranked.every((r) => !r.explore));
});

test("duplicates and sponsored or newsdata-only items never enter the feed", () => {
  const a = art({ title: "Same title", url: "https://x.org/1", source_name: "A" }), dup = art({ title: "Same  title!", url: "https://x.org/2", source_name: "B" });
  const sp = art({ content_type: "sponsored", title: "Ad" }), nd = art({ newsdata_only: true, title: "ND" });
  const ranked = F.rank([a, dup, sp, nd], { now: NOW });
  assert.equal(ranked.length, 1);
});

test("editorial translation is used only when published by editors in the reader language", () => {
  const base = { title: "عنوان", source_language: "ar", summary: "ملخص" };
  const withDraft = F.toArticle(row({ ...base, article_translations: [{ lang: "en", title: "Draft", translation_status: "draft", translation_source: "machine_draft" }] }), "en");
  assert.equal(withDraft.title, "عنوان"); assert.equal(withDraft.translated, false); assert.equal(withDraft.titleLang, "ar");
  const published = F.toArticle(row({ ...base, article_translations: [{ lang: "en", title: "Headline", summary: "S", translation_status: "published", translation_source: "editorial" }] }), "en");
  assert.equal(published.title, "Headline"); assert.equal(published.titleLang, "en");
});

test("filters: category, country, range, language, trust, unread, query, followed-only, sorting", () => {
  const items = F.rank([
    art({ category: "economy", event_country: "SAU", source_name: "A", published_at: ago(2), title: "Oil output rises" }),
    art({ category: "sports", event_country: "FRA", source_name: "B", published_at: ago(30), title: "Cup final", editorial_trust_status: "confirmed" }),
    art({ category: "economy", source_name: "C", published_at: ago(24 * 10), title: "Old budget", source_language: "ar" })], { now: NOW, follows: { category: ["economy"] } });
  const run = (f) => F.applyFilters(items, f, NOW).map((i) => i.article.title);
  assert.deepEqual(run({ category: "economy", sort: "newest" }), ["Oil output rises", "Old budget"]);
  assert.deepEqual(run({ country: "FRA" }), ["Cup final"]);
  assert.deepEqual(run({ range: "24h" }), ["Oil output rises"]);
  assert.deepEqual(run({ range: "7d" }).length, 2);
  assert.deepEqual(run({ lang: "ar" }), ["Old budget"]);
  assert.deepEqual(run({ trust: "confirmed" }), ["Cup final"]);
  assert.deepEqual(run({ query: "oil" }), ["Oil output rises"]);
  assert.equal(run({ followedOnly: true }).length, 2);
  assert.deepEqual(run({ sort: "oldest" })[0], "Old budget");
  assert.deepEqual(run({ unreadOnly: true, readIds: new Set([items[0].article.id]) }).includes(items[0].article.title), false);
});

test("history helpers cap size, de-duplicate and store only coarse metadata", () => {
  let list = [];
  for (let i = 0; i < 400; i++) list = F.addToHistory(list, F.historyEntry(art({ source_name: "X" }), NOW - i));
  assert.equal(list.length, F.MAX_HISTORY);
  const again = F.addToHistory(list, list[10]);
  assert.equal(again.length, F.MAX_HISTORY); assert.equal(again[0].id, list[10].id);
  assert.deepEqual(Object.keys(list[0]).sort(), ["at", "category", "country", "id", "source"]);
});

test("local storage loaders validate untrusted data", () => {
  const store = (v) => ({ getItem: () => v });
  assert.deepEqual(F.loadLocalFollows(store("{bad json")), F.emptyFollows());
  const f = F.loadLocalFollows(store(JSON.stringify({ country: ["SAU", "<img>"], topic: ["ai", "zzz"], category: ["economy"], interest: ["solar"] })));
  assert.deepEqual(f, { category: ["economy"], country: ["SAU"], topic: ["ai"], interest: ["solar"] });
  assert.equal(F.loadLocalHistory(store(JSON.stringify([{ id: "a", at: 1 }, { id: 5, at: 1 }, null]))).length, 1);
});

test("reasonText is bilingual", () => {
  const r = { type: "category", value: "economy" };
  assert.match(F.reasonText(r, "ar", { category: () => "اقتصاد" }), /اقتصاد/);
  assert.match(F.reasonText(r, "en", { category: () => "Economy" }), /^You follow Economy$/);
  assert.equal(F.reasonText({ type: "topic", value: "ai" }, "en"), "Topic you follow: Artificial intelligence");
});
