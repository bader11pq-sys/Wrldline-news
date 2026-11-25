const test = require("node:test");
const assert = require("node:assert/strict");
const EC = require("../economy-model.js");
const WB = require("../worldbank.js");

const rows = (iso, pairs) => pairs.map(([date, value]) => ({ iso3: iso, country: iso, date, value }));
const res = { ok: true, rows: [...rows("SAU", [[2022, 9.9], [2023, 0.5], [2024, 2.6]]), ...rows("USA", [[2023, 2.9], [2024, 2.8], [2025, 2.1]])] };

test("parseState sanitises countries, indicator and range", () => {
  const s = EC.parseState("?c=sau,USA,xx,SAU,../etc,FRA,DEU,JPN,ITA,ESP&i=bad&y=7");
  assert.deepEqual(s.countries, ["SAU", "USA", "FRA", "DEU", "JPN", "ITA"]);
  assert.equal(s.indicator, EC.DEFAULTS.indicator); assert.equal(s.years, 20);
  assert.deepEqual(EC.parseState("").countries, EC.DEFAULTS.countries);
  assert.equal(EC.parseState("?i=FP.CPI.TOTL.ZG&y=35").years, 35);
  assert.equal(EC.parseState("?i=SP.POP.TOTL").indicator, EC.DEFAULTS.indicator, "non-economic indicators are rejected");
});
test("serializeState round trips", () => {
  const s = { countries: ["SAU", "EGY"], indicator: "FP.CPI.TOTL.ZG", years: 10 };
  assert.deepEqual(EC.parseState(EC.serializeState(s)), s);
});
test("add/remove respect the limit and never empty the selection", () => {
  let s = { countries: ["SAU"], indicator: "x", years: 10 };
  assert.equal(EC.removeCountry(s, "SAU").countries.length, 1);
  for (const c of ["USA", "FRA", "DEU", "JPN", "ITA", "ESP"]) s = EC.addCountry(s, c);
  assert.equal(s.countries.length, EC.MAX_COUNTRIES);
  assert.equal(EC.addCountry(s, "SAU"), s);
  assert.equal(EC.addCountry(s, "nope"), s);
});
test("matrix reports each country's own latest year and leaves gaps empty", () => {
  const m = EC.matrix({ "NY.GDP.MKTP.KD.ZG": res }, ["SAU", "USA", "FRA"], ["NY.GDP.MKTP.KD.ZG", "FP.CPI.TOTL.ZG"]);
  assert.deepEqual(m[0].cells.map((c) => [c.value, c.year]), [[2.6, 2024], [2.1, 2025], [null, null]]);
  assert.equal(m[1].ok, false); assert.ok(m[1].cells.every((c) => c.value === null));
});
test("comparison sorts descending, flags mixed years and keeps no-data countries last", () => {
  const c = EC.comparison(res, ["SAU", "USA", "FRA"]);
  assert.deepEqual(c.items.map((i) => i.iso3), ["SAU", "USA", "FRA"]);
  assert.equal(c.mixedYears, true);
  assert.equal(c.items[2].value, null);
  assert.equal(EC.comparison({ ok: false, rows: [] }, ["SAU"]).items[0].value, null);
});
test("chartSeries trims to the selected window without inventing points", () => {
  const s = EC.chartSeries(res, ["SAU", "USA"], 2, 2025);
  assert.deepEqual(s[0].points, [{ x: 2023, y: 0.5 }, { x: 2024, y: 2.6 }]);
  assert.equal(EC.chartSeries({ ok: false, rows: [] }, ["SAU"], 10, 2025)[0].points.length, 0);
});
test("groupQuotes orders categories and newest first", () => {
  const g = EC.groupQuotes([{ category: "crypto", timestamp: 1, symbol: "a" }, { category: "index", timestamp: 1, symbol: "b" }, { category: "index", timestamp: 5, symbol: "c" }]);
  assert.deepEqual(g.map((x) => x.category), ["index", "crypto"]);
  assert.equal(g[0].quotes[0].symbol, "c");
});
test("dashboard indicators exist in the World Bank catalogue", () => {
  for (const id of EC.dashboardIndicators()) assert.ok(WB.INDICATORS[id]);
  assert.ok(EC.dashboardIndicators().length >= 10);
});
