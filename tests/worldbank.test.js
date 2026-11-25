const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const WB = require("../worldbank.js");
const gdp = JSON.parse(fs.readFileSync(__dirname + "/fixtures/worldbank-gdp-growth-sau-usa.json", "utf8"));
const meta = JSON.parse(fs.readFileSync(__dirname + "/fixtures/worldbank-country-sau.json", "utf8"));

test("parseIndicator reads real API payload shape and last-updated date", () => {
  const p = WB.parseIndicator(gdp);
  assert.equal(p.ok, true);
  assert.match(p.lastUpdated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(p.rows.some((r) => r.iso3 === "SAU") && p.rows.some((r) => r.iso3 === "USA"));
});
test("series is ascending, latest picks newest non-null, change compares last two", () => {
  const p = WB.parseIndicator(gdp);
  const s = WB.series(p.rows, "SAU");
  assert.deepEqual(s.map((r) => r.date), [...s.map((r) => r.date)].sort((a, b) => a - b));
  assert.equal(WB.latest(p.rows, "SAU").date, s[s.length - 1].date);
  const ch = WB.change(s);
  assert.equal(ch.to, s[s.length - 1].date);
  assert.ok(Math.abs(ch.delta - (s[s.length - 1].value - s[s.length - 2].value)) < 1e-9);
  assert.equal(WB.latest(p.rows, "ZZZ"), null);
});
test("null observations are dropped, never zero-filled", () => {
  const payload = [{ lastupdated: "2026-01-01" }, [{ indicator: { id: "X", value: "x" }, countryiso3code: "SAU", country: { value: "S" }, date: "2024", value: null }, { indicator: { id: "X" }, countryiso3code: "SAU", country: { value: "S" }, date: "2023", value: 0 }]];
  const p = WB.parseIndicator(payload);
  assert.deepEqual(p.rows.map((r) => r.date), [2023]);
  assert.equal(p.rows[0].value, 0);
});
test("malformed or error payloads are rejected without throwing", () => {
  for (const bad of [null, {}, [], [{ message: [{ id: "175" }] }], [{}, null], "x"]) assert.equal(WB.parseIndicator(bad).ok, false);
});
test("parseCountry extracts capital, region, income and coordinates", () => {
  const c = WB.parseCountry(meta);
  assert.equal(c.iso3, "SAU");
  assert.equal(c.capital, "Riyadh");
  assert.ok(c.region && c.income && Number.isFinite(c.lat) && Number.isFinite(c.lon));
  assert.equal(c.isAggregate, false);
});
test("buildUrl validates codes and indicators (no injection into the URL)", () => {
  assert.match(WB.buildUrl({ countries: ["sau", "usa"], indicator: "NY.GDP.MKTP.CD", from: 2000, to: 2025 }), /country\/SAU;USA\/indicator\/NY\.GDP\.MKTP\.CD\?.*date=2000%3A2025/);
  assert.throws(() => WB.buildUrl({ countries: ["SA/../x"], indicator: "A" }));
  assert.throws(() => WB.buildUrl({ countries: ["SAU"], indicator: "A?x=1" }));
});
test("fetchIndicator: success, cache hit, http error, bad payload, network error", async () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  let calls = 0;
  const ok = async () => { calls++; return { ok: true, json: async () => gdp }; };
  const opts = { countries: ["SAU"], indicator: "NY.GDP.MKTP.KD.ZG", from: 2021, to: 2025 };
  const a = await WB.fetchIndicator(opts, { fetch: ok, storage, now: 1000 });
  assert.equal(a.ok, true); assert.equal(a.fromCache, false); assert.equal(a.source.name, "World Bank Open Data");
  const b = await WB.fetchIndicator(opts, { fetch: ok, storage, now: 2000 });
  assert.equal(b.fromCache, true); assert.equal(calls, 1);
  const stale = await WB.fetchIndicator(opts, { fetch: ok, storage, now: 1000 + 7 * 3600e3 });
  assert.equal(stale.fromCache, false); assert.equal(calls, 2);
  assert.equal((await WB.fetchIndicator(opts, { fetch: async () => ({ ok: false, status: 503 }) })).error, "http_503");
  assert.equal((await WB.fetchIndicator(opts, { fetch: async () => ({ ok: true, json: async () => ({}) }) })).error, "bad_payload");
  assert.equal((await WB.fetchIndicator(opts, { fetch: async () => { throw new Error("x"); } })).error, "network");
});
test("formatValue localizes and never invents a number for missing data", () => {
  assert.equal(WB.formatValue(NaN, "pct", "en"), "—");
  assert.equal(WB.formatValue(4.56, "pct", "en"), "4.6%");
  assert.match(WB.formatValue(1.2e12, "usd", "en"), /^US\$ 1\.2T$/);
});
test("every indicator has both languages, a known group and a unit", () => {
  for (const [id, d] of Object.entries(WB.INDICATORS)) {
    assert.ok(d.ar && d.en, id); assert.ok(WB.GROUPS.includes(d.group), id); assert.ok(d.unit, id);
  }
});

test("fetchIndicatorMulti falls back per country when one code breaks the combined request", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes("SAU;ZZZ")) return { ok: true, json: async () => [{ message: [{ id: "120" }] }] };
    if (url.includes("/ZZZ/")) return { ok: true, json: async () => [{ message: [{ id: "120" }] }] };
    return { ok: true, json: async () => gdp };
  };
  const r = await WB.fetchIndicatorMulti({ countries: ["SAU", "ZZZ"], indicator: "NY.GDP.MKTP.KD.ZG", from: 2021, to: 2025 }, { fetch: fetchImpl });
  assert.equal(r.ok, true);
  assert.deepEqual(r.failed, ["ZZZ"]);
  assert.ok(r.rows.some((x) => x.iso3 === "SAU"));
  assert.equal(urls.length, 3);
  const none = await WB.fetchIndicatorMulti({ countries: ["ZZZ", "YYY"], indicator: "NY.GDP.MKTP.KD.ZG", from: 2021, to: 2025 }, { fetch: async () => ({ ok: true, json: async () => [{ message: [] }] }) });
  assert.equal(none.ok, false); assert.deepEqual(none.failed, ["ZZZ", "YYY"]);
});
test("PPP income is labelled as international dollars, not US dollars", () => {
  assert.equal(WB.formatValue(74400, "intl", "en"), "Int$ 74,400");
});
