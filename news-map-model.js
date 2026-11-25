/* WRLDLINE coverage map model. Pure functions: aggregate published articles by event country, topic,
   date window and verification status. Counts describe coverage in the loaded feed, never the
   condition of a country. UMD; no DOM access. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WLNewsMap = factory();
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const DAY = 86400000;
  const DAYS = Object.freeze([1, 3, 7, 30]);
  const TRUSTS = Object.freeze(["all", "confirmed", "developing"]);
  const LAYERS = Object.freeze(["coverage", "risk"]);
  const DEFAULTS = Object.freeze({ topic: "all", days: 7, trust: "all", layer: "coverage", country: "all" });

  function parseState(search, topics, isIso3) {
    const p = new URLSearchParams(search || "");
    const topic = p.get("topic"), days = Number(p.get("days")), trust = p.get("trust"), layer = p.get("layer");
    const country = String(p.get("c") || "").toUpperCase();
    return {
      topic: topic && (topics || []).includes(topic) ? topic : DEFAULTS.topic,
      days: DAYS.includes(days) ? days : DEFAULTS.days,
      trust: TRUSTS.includes(trust) ? trust : DEFAULTS.trust,
      layer: LAYERS.includes(layer) ? layer : DEFAULTS.layer,
      country: /^[A-Z]{3}$/.test(country) && (!isIso3 || isIso3(country)) ? country : DEFAULTS.country
    };
  }
  function serializeState(state) {
    const p = new URLSearchParams();
    for (const k of ["topic", "days", "trust", "layer"]) if (state[k] !== DEFAULTS[k]) p.set(k, String(state[k]));
    if (state.country !== DEFAULTS.country) p.set("c", state.country);
    const s = p.toString();
    return s ? "?" + s : "";
  }
  /** "developing" = reported but not editorially confirmed (unconfirmed). Disputed stays separate. */
  const trustBucket = (a) => (a.trust === "confirmed" ? "confirmed" : a.trust === "disputed" ? "disputed" : "developing");

  function matches(a, f, now) {
    if (a.published == null || a.published > now || a.published < now - f.days * DAY) return false;
    if (f.topic !== "all" && a.category !== f.topic) return false;
    if (f.trust === "confirmed" && trustBucket(a) !== "confirmed") return false;
    if (f.trust === "developing" && trustBucket(a) === "confirmed") return false;
    return true;
  }

  /** articles: normalised via WLFeed.toArticle (country = ISO3 or null). regionOf: iso3 -> region string|undefined. */
  function aggregate(articles, f, now, regionOf) {
    const list = (articles || []).filter((a) => a && matches(a, f, now));
    list.sort((a, b) => b.published - a.published || String(a.id).localeCompare(String(b.id)));
    const byCountry = new Map();
    let unlocated = 0;
    for (const a of list) {
      if (!a.country) { unlocated++; continue; }
      let c = byCountry.get(a.country);
      if (!c) { c = { iso3: a.country, count: 0, confirmed: 0, developing: 0, disputed: 0, latest: 0 }; byCountry.set(a.country, c); }
      c.count++; c[trustBucket(a)]++; c.latest = Math.max(c.latest, a.published);
    }
    const regions = new Map();
    for (const c of byCountry.values()) {
      const r = regionOf ? regionOf(c.iso3) : undefined;
      const key = r || "";
      let g = regions.get(key);
      if (!g) { g = { region: key, count: 0, countries: 0, confirmed: 0, developing: 0, disputed: 0 }; regions.set(key, g); }
      g.count += c.count; g.countries++; g.confirmed += c.confirmed; g.developing += c.developing; g.disputed += c.disputed;
    }
    const max = Math.max(0, ...[...byCountry.values()].map((c) => c.count));
    const forCountry = f.country === "all" ? list : list.filter((a) => a.country === f.country);
    return {
      articles: forCountry, total: list.length, located: list.length - unlocated, unlocated, byCountry, max,
      countries: [...byCountry.values()].sort((a, b) => b.count - a.count || b.latest - a.latest || a.iso3.localeCompare(b.iso3)),
      regions: [...regions.values()].sort((a, b) => b.count - a.count || a.region.localeCompare(b.region))
    };
  }
  /** 0 = no coverage, 1..4 = quartile-like steps relative to the busiest country in the current filter. */
  function level(count, max) {
    if (!count || !max) return 0;
    return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
  }
  /** Oldest and newest dates present in the loaded feed so the page can state what the counts cover. */
  function feedWindow(articles) {
    const dates = (articles || []).map((a) => a && a.published).filter((d) => Number.isFinite(d));
    return dates.length ? { oldest: Math.min(...dates), newest: Math.max(...dates), size: dates.length } : null;
  }
  return Object.freeze({ DAYS, TRUSTS, LAYERS, DEFAULTS, parseState, serializeState, trustBucket, aggregate, level, feedWindow });
});
