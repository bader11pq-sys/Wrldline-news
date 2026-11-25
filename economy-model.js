/* WRLDLINE economic dashboard model (UMD: WLEconomy). Pure functions: URL state, comparison tables and
 * chart series built from World Bank rows. Missing observations stay missing. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./worldbank.js"), require("./editorial-display.js"));
  else root.WLEconomy = factory(root.WLWorldBank, root.WLEditorial);
})(typeof window === "undefined" ? globalThis : window, function (WB, E) {
  "use strict";
  const MAX_COUNTRIES = 6;
  const DEFAULTS = Object.freeze({ countries: ["SAU", "USA", "CHN"], indicator: "NY.GDP.MKTP.KD.ZG", years: 20 });
  const RANGES = [10, 20, 35];
  const dashboardIndicators = () => Object.keys(WB.INDICATORS).filter((id) => ["economy", "dashboard"].includes(WB.INDICATORS[id].group));

  /** Reads ?c=SAU,USA&i=ID&y=20 and discards anything that is not a known country, indicator or range. */
  function parseState(search) {
    const p = new URLSearchParams(search || "");
    const countries = [];
    for (const raw of String(p.get("c") || "").split(",")) {
      const iso = E.iso3Of(raw.trim());
      if (iso && !countries.includes(iso) && countries.length < MAX_COUNTRIES) countries.push(iso);
    }
    const i = p.get("i");
    const y = Number.parseInt(p.get("y"), 10);
    return { countries: countries.length ? countries : DEFAULTS.countries.slice(), indicator: dashboardIndicators().includes(i) ? i : DEFAULTS.indicator, years: RANGES.includes(y) ? y : DEFAULTS.years };
  }
  function serializeState(state) {
    return new URLSearchParams({ c: state.countries.join(","), i: state.indicator, y: String(state.years) }).toString();
  }
  function addCountry(state, iso3) {
    const iso = E.iso3Of(iso3);
    if (!iso || state.countries.includes(iso) || state.countries.length >= MAX_COUNTRIES) return state;
    return Object.assign({}, state, { countries: [...state.countries, iso] });
  }
  function removeCountry(state, iso3) {
    const next = state.countries.filter((c) => c !== iso3);
    return next.length ? Object.assign({}, state, { countries: next }) : state;
  }

  /** rows: {[indicatorId]: result of fetchIndicator[Multi]}. Returns one row per indicator with cells per country. */
  function matrix(results, countries, ids) {
    return (ids || dashboardIndicators()).map((id) => {
      const res = results[id];
      const cells = countries.map((iso3) => {
        const last = res && res.ok ? WB.latest(res.rows, iso3) : null;
        return last ? { iso3, value: last.value, year: last.date } : { iso3, value: null, year: null };
      });
      return { id, def: WB.INDICATORS[id], ok: Boolean(res && res.ok), cells };
    });
  }

  function chartSeries(result, countries, years, nowYear) {
    const from = nowYear - years;
    return countries.map((iso3) => ({ iso3, points: result && result.ok ? WB.series(result.rows, iso3).filter((p) => p.date >= from).map((p) => ({ x: p.date, y: p.value })) : [] }));
  }

  /** Latest values sorted high to low; countries without data are kept at the end, never dropped or zeroed. */
  function comparison(result, countries) {
    const items = countries.map((iso3) => { const l = result && result.ok ? WB.latest(result.rows, iso3) : null; return { iso3, value: l ? l.value : null, year: l ? l.date : null }; });
    const withData = items.filter((i) => i.value !== null).sort((a, b) => b.value - a.value);
    const years = new Set(withData.map((i) => i.year));
    return { items: [...withData, ...items.filter((i) => i.value === null)], mixedYears: years.size > 1 };
  }

  /** Group validated market quotes by category, newest observation first. */
  function groupQuotes(quotes) {
    const order = ["index", "fx", "energy", "metals", "crypto", "stock", "etf", "other"];
    const groups = new Map();
    for (const q of quotes) { if (!groups.has(q.category)) groups.set(q.category, []); groups.get(q.category).push(q); }
    return order.filter((c) => groups.has(c)).map((c) => ({ category: c, quotes: groups.get(c).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)) }));
  }

  return Object.freeze({ MAX_COUNTRIES, DEFAULTS, RANGES, dashboardIndicators, parseState, serializeState, addCountry, removeCountry, matrix, chartSeries, comparison, groupQuotes });
});
