const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm"), fs = require("node:fs");
const C = require("../country-model.js");
const E = require("../editorial-display.js");

function loadHistory() {
  const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ["history-data.js", "history-entities-a.js", "history-entities-b.js", "history-entities-c.js", "history-events.js", "history-en.js"]) vm.runInContext(fs.readFileSync(__dirname + "/../" + f, "utf8"), ctx);
  return ctx;
}
const ctx = loadHistory();

test("every mapped ISO3 code is a real country code and ids are unique", () => {
  const seen = new Set();
  for (const [id, iso] of Object.entries(C.HISTORY_TO_ISO3)) {
    assert.ok(E.codeOf(iso), `${id} -> ${iso}`);
    assert.ok(!seen.has(iso), "duplicate " + iso); seen.add(iso);
  }
});
test("every atlas entity is either mapped or explicitly excluded (no silent gaps)", () => {
  const unmapped = ctx.WL_HISTORY.entities.filter((e) => !C.HISTORY_TO_ISO3[e.id]).map((e) => e.id);
  assert.equal(unmapped.join(","), "by"); // Byzantine Empire has no modern counterpart
  for (const id of Object.keys(C.HISTORY_TO_ISO3)) assert.ok(ctx.WL_HISTORY.entities.some((e) => e.id === id), id);
});
test("atlas English name agrees with the ISO country name for modern states", () => {
  for (const e of ctx.WL_HISTORY.entities.filter((x) => x.type === "state")) {
    const iso = C.HISTORY_TO_ISO3[e.id];
    const names = [E.countryName(iso, "en"), e.en].map((n) => n.toLowerCase());
    const alias = { gb: "united kingdom", ru: "russia", tr: "türkiye", us: "united states", vn: "vietnam" };
    assert.ok(names[0].includes(names[1].slice(0, 5)) || names[1].includes(names[0].slice(0, 5)) || alias[e.id], `${e.id}: ${names}`);
  }
});
test("atlasSections keeps only http(s) sources and attaches events by entity", () => {
  const sa = ctx.WL_HISTORY.entities.find((e) => e.id === "sa");
  const s = C.atlasSections({ ...sa, sources: [...sa.sources, { title: "bad", url: "javascript:alert(1)" }] }, ctx.WL_HISTORY.events);
  assert.ok(s.sources.length >= 1 && s.sources.every((x) => /^https?:/.test(x.url)));
  assert.ok(s.events.every((e, i, a) => !i || a[i - 1].year <= e.year));
  assert.equal(C.atlasSections(null, []), null);
});
test("localize flags untranslated Arabic instead of machine translating", () => {
  const en = ctx.WRLDLINE_HISTORY_EN;
  const known = Object.keys(en)[0];
  assert.deepEqual(C.localize(known, "en", en), { text: en[known], lang: "en", translated: true });
  const unk = C.localize("نص غير مترجم", "en", en);
  assert.equal(unk.lang, "ar"); assert.equal(unk.translated, false);
  assert.equal(C.localize("نص", "ar", en).lang, "ar");
});
test("newsFor filters by ISO3, sorts newest first and ignores unknown codes", () => {
  const list = [{ id: "1", country: "SAU", published: 1 }, { id: "2", country: "SAU", published: 5 }, { id: "3", country: "USA", published: 9 }, { id: "4", country: null, published: 10 }];
  assert.deepEqual(C.newsFor(list, "sa").map((a) => a.id), ["2", "1"]);
  assert.deepEqual(C.newsFor(list, "xx"), []);
});
test("trustSummary counts confirmed, unconfirmed and disputed", () => {
  assert.deepEqual(C.trustSummary([{ trust: "confirmed" }, { trust: "disputed" }, { trust: "unconfirmed" }, { trust: "confirmed" }]), { confirmed: 2, unconfirmed: 1, disputed: 1, total: 4 });
});
test("overviewRows prefers World Bank metadata and falls back to atlas", () => {
  const atlas = { overview: { capital: "الرياض", government: "ملكية", languages: "", religion: "" } };
  const rows = C.overviewRows({ meta: { capital: "Riyadh", region: "MENA", income: "High income" }, atlas, lang: "en", enMap: {} });
  assert.equal(rows.find((r) => r.key === "capital").source, "wb");
  const rows2 = C.overviewRows({ meta: null, atlas, lang: "ar", enMap: {} });
  assert.equal(rows2.find((r) => r.key === "capital").value, "الرياض");
  assert.deepEqual(C.overviewRows({ meta: null, atlas: null, lang: "en", enMap: {} }), []);
});
test("Arabic UI shows the atlas capital and translates the closed World Bank vocabulary only", () => {
  const atlas = { overview: { capital: "الرياض", government: "", languages: "", religion: "" } };
  const rows = C.overviewRows({ meta: { capital: "Riyadh", region: "South Asia", income: "Unlisted income" }, atlas, lang: "ar", enMap: {} });
  assert.deepEqual(rows.map((r) => [r.key, r.value, r.lang]), [["capital", "الرياض", "ar"], ["region", "جنوب آسيا", "ar"], ["income", "Unlisted income", "en"]]);
});
test("directory lists countries once, localized and sorted", () => {
  const d = C.directory("en", ["sa"]);
  assert.equal(new Set(d.map((c) => c.iso3)).size, d.length);
  assert.ok(d.find((c) => c.iso3 === "SAU").hasHistory);
  assert.equal(d.find((c) => c.iso3 === "FRA").name, "France");
});
