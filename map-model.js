(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./editorial-display.js"));
  else root.WLMonitor = factory(root.WLEditorial);
})(typeof window === "undefined" ? globalThis : window, function (editorial) {
  const levels = Object.freeze(["low", "guarded", "elevated", "high", "critical"]);
  const hour = 3600000;
  const maxRows = 1000;
  const defaults = Object.freeze({hours:24, country:"all", severity:"all", type:"all", order:"severity"});
  const rpc = "https://vmaxbnogmmfyrcucapnq.supabase.co/rest/v1/rpc/public_world_monitor_feed";
  const publishableKey = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  async function fetchFeed(fetcher = fetch) {
    const response = await fetcher(rpc, {
      method:"POST", headers:{apikey:publishableKey, "Content-Type":"application/json", Accept:"application/json"},
      body:JSON.stringify({p_hours:24,p_limit:maxRows}), credentials:"omit", cache:"no-store", signal:AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error("Monitor feed unavailable");
    const rows = await response.json(), checked = Date.now();
    return {items:normalize(rows,checked), capped:rows.length===maxRows, checked};
  }
  function filtersFrom(params) {
    const hours = Number(params.get("hours"));
    const severity = params.get("severity");
    return {hours:[1,6,24].includes(hours)?hours:defaults.hours,
      country:editorial.iso3Of(params.get("country"))||defaults.country,
      severity:levels.includes(severity)?severity:defaults.severity,
      type:editorial.eventType(params.get("type"))||defaults.type,
      order:params.get("order")==="latest"?"latest":defaults.order};
  }
  function filtersTo(filters, current) {
    const url = new URL(current);
    for (const key of Object.keys(defaults)) {
      if (filters[key] === defaults[key]) url.searchParams.delete(key);
      else url.searchParams.set(key, String(filters[key]));
    }
    return url;
  }
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
    const selection = filters.country === "all" ? matching : byCountry.get(filters.country) || [];
    const events = filters.order === "latest" ? [...selection].sort((a,b)=>b.published-a.published||compare(a,b)) : selection;
    const distribution = Object.fromEntries(levels.map(level=>[level,0]));
    const buckets = Array(6).fill(0);
    for(const event of selection){
      distribution[event.severity]++;
      const index=Math.min(5,Math.max(0,Math.floor((event.published-(now-hours*hour))/(hours*hour/6))));
      buckets[index]++;
    }
    const leaders=[...byCountry].map(([code,reports])=>({code,count:reports.length,top:reports[0]}))
      .sort((a,b)=>b.top.rank-a.top.rank||b.count-a.count||compare(a.top,b.top)||a.code.localeCompare(b.code));
    return {
      byCountry, events, types, leaders, distribution, buckets, highest:selection[0]||null,
      high: distribution.critical+distribution.high,
      countries: filters.country === "all" ? byCountry.size : Number(events.length > 0)
    };
  }
  function countryStats(byCountry, code) {
    const reports = byCountry.get(code) || [];
    const distribution = Object.fromEntries(levels.map(level => [level, 0]));
    const sources = new Set();
    let latest = null;
    for (const report of reports) {
      distribution[report.severity]++;
      const publisher = typeof report.source_name === "string" ? report.source_name.trim().normalize("NFKC").toLowerCase() : "";
      if (publisher) sources.add(publisher);
      latest = Math.max(latest ?? -Infinity, report.published);
    }
    return {count:reports.length, high:distribution.high+distribution.critical, sources:sources.size,
      top:reports[0]?.severity || null, latest, distribution};
  }
  return Object.freeze({ levels, maxRows, defaults, fetchFeed, filtersFrom, filtersTo, normalize, select, countryStats });
});
