(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./editorial-display.js"));
  else root.WLMonitor = factory(root.WLEditorial);
})(typeof window === "undefined" ? globalThis : window, function (editorial) {
  const levels = Object.freeze(["low", "guarded", "elevated", "high", "critical"]);
  const hour = 3600000;
  const maxRows = 1000;
  function normalize(rows, now) {
    if (!Array.isArray(rows) || rows.length > maxRows) throw new TypeError("Unexpected monitor feed");
    const seen = new Set();
    return rows.flatMap(row => {
      if (!row || typeof row.id !== "string" || !row.id.trim() || seen.has(row.id) ||
          typeof row.title !== "string" || !row.title.trim() || !editorial.codeOf(row.ai_country_code) ||
          !levels.includes(row.ai_risk_level) || typeof row.published_at !== "string") return [];
      const published = Date.parse(row.published_at);
      if (!Number.isFinite(published) || published > now || published < now - 24 * hour) return [];
      seen.add(row.id);
      return [{
        ...row, published,
        countryCode: row.ai_country_code.trim().toUpperCase(), eventType: editorial.eventType(row.ai_event_type),
        severity: row.ai_risk_level, rank: levels.indexOf(row.ai_risk_level) + 1,
        score: Number.isInteger(row.ai_risk_score) && row.ai_risk_score >= 0 && row.ai_risk_score <= 100 ? row.ai_risk_score : null
      }];
    });
  }
  function compare(a, b) {
    return b.rank - a.rank || (b.score ?? -1) - (a.score ?? -1) || b.published - a.published || a.id.localeCompare(b.id);
  }
  function select(items, filters, now) {
    const hours = [1, 6, 24].includes(filters.hours) ? filters.hours : 24;
    const types = new Set(), matching = [];
    for (const event of items) {
      if (event.published < now - hours * hour || event.published > now) continue;
      if (event.eventType) types.add(event.eventType);
      if ((filters.severity === "all" || event.severity === filters.severity) &&
          (filters.type === "all" || event.eventType === filters.type)) matching.push(event);
    }
    matching.sort(compare);
    const byCountry = new Map();
    for (const event of matching) {
      if (!byCountry.has(event.countryCode)) byCountry.set(event.countryCode, []);
      byCountry.get(event.countryCode).push(event);
    }
    const events = filters.country === "all" ? matching : byCountry.get(filters.country) || [];
    return {
      byCountry, events, types, high: events.filter(event => event.rank >= levels.indexOf("high") + 1).length,
      countries: filters.country === "all" ? byCountry.size : Number(events.length > 0)
    };
  }
  return Object.freeze({ levels, maxRows, normalize, select });
});
