const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../news-map-model.js");
const WB = require("../worldbank.js");
const DAY = 86400000, now = Date.UTC(2026, 10, 25, 12);
const art = (id, country, category, trust, ageDays) => ({ id, country, category, trust, published: now - ageDays * DAY });
const rows = [art("a", "SAU", "politics", "confirmed", 0.5), art("b", "SAU", "economy", "unconfirmed", 2), art("c", "USA", "politics", "disputed", 5),
  art("d", "USA", "politics", "confirmed", 20), art("e", null, "politics", "confirmed", 1), art("f", "FRA", "tech", "confirmed", -1)];
const f = (o) => Object.assign({}, M.DEFAULTS, o);
const region = (c) => ({ SAU: "MENA", USA: "NA", FRA: "ECA" })[c];

test("state parsing falls back to defaults on invalid input", () => {
  const s = M.parseState("?topic=nope&days=9&trust=x&layer=y&c=zz", ["politics"], () => true);
  assert.deepEqual(s, M.DEFAULTS);
  assert.equal(M.parseState("?topic=politics&days=30&trust=confirmed&layer=risk&c=sau", ["politics"], (c) => c === "SAU").country, "SAU");
});
test("state round-trips and omits defaults", () => {
  assert.equal(M.serializeState(M.DEFAULTS), "");
  const s = f({ topic: "politics", days: 30, country: "SAU" });
  assert.deepEqual(M.parseState(M.serializeState(s), ["politics"], () => true), s);
});
test("date window excludes old and future-dated articles", () => {
  assert.equal(M.aggregate(rows, f({ days: 7 }), now, region).total, 4);
  assert.equal(M.aggregate(rows, f({ days: 30 }), now, region).total, 5);
  assert.equal(M.aggregate(rows, f({ days: 1 }), now, region).total, 2);
});
test("topic filter", () => {
  const r = M.aggregate(rows, f({ days: 30, topic: "politics" }), now, region);
  assert.equal(r.total, 4); assert.equal(r.byCountry.get("SAU").count, 1);
});
test("verification filter keeps developing and disputed apart from confirmed", () => {
  const c = M.aggregate(rows, f({ days: 30, trust: "confirmed" }), now, region);
  assert.equal(c.articles.every((a) => a.trust === "confirmed"), true);
  const d = M.aggregate(rows, f({ days: 30, trust: "developing" }), now, region);
  assert.deepEqual(d.articles.map((a) => a.id).sort(), ["b", "c"]);
  const all = M.aggregate(rows, f({ days: 30 }), now, region).byCountry.get("USA");
  assert.equal(all.confirmed, 1); assert.equal(all.disputed, 1); assert.equal(all.developing, 0);
});
test("articles without a country are counted as unlocated, not guessed", () => {
  const r = M.aggregate(rows, f({ days: 7 }), now, region);
  assert.equal(r.unlocated, 1); assert.equal(r.located, 3); assert.equal(r.byCountry.has(null), false);
});
test("country selection narrows the list but not the map totals", () => {
  const r = M.aggregate(rows, f({ days: 30, country: "USA" }), now, region);
  assert.equal(r.articles.length, 2); assert.equal(r.byCountry.size, 2);
});
test("regions aggregate located articles and keep unknown regions separate", () => {
  const r = M.aggregate(rows, f({ days: 30 }), now, (c) => (c === "SAU" ? "MENA" : undefined));
  assert.equal(r.regions.find((g) => g.region === "MENA").count, 2);
  assert.equal(r.regions.find((g) => g.region === "").count, 2);
});
test("articles sorted newest first with stable ids", () => {
  const r = M.aggregate(rows, f({ days: 30 }), now, region);
  assert.deepEqual(r.articles.map((a) => a.id), ["a", "e", "b", "c", "d"]);
});
test("level and feed window", () => {
  assert.equal(M.level(0, 10), 0); assert.equal(M.level(1, 10), 1); assert.equal(M.level(10, 10), 4); assert.equal(M.level(5, 0), 0);
  assert.equal(M.feedWindow([]), null);
  assert.equal(M.feedWindow(rows).size, 6);
});
test("world bank country list parser drops aggregates and incomplete rows", () => {
  const payload = [{}, [
    { id: "SAU", iso2Code: "SA", name: "Saudi Arabia", region: { value: "Middle East & North Africa" }, incomeLevel: { value: "High income" } },
    { id: "WLD", iso2Code: "1W", name: "World", region: { value: "Aggregates" }, incomeLevel: { value: "Aggregates" } },
    { id: "XX", name: "bad", region: { value: "x" } }]];
  assert.deepEqual(Object.keys(WB.parseCountryList(payload)), ["SAU"]);
  assert.deepEqual(WB.parseCountryList(null), {});
});
