(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WLMarkets = factory();
})(globalThis, function () {
  "use strict";
  const number = value => typeof value === "number" && Number.isFinite(value) ? value : null;
  const categories = ["stock", "etf", "crypto", "energy", "metals", "fx", "index", "other"];
  const freshnessHours = { crypto: 2, fx: 36, stock: 96, etf: 96, index: 96, energy: 96, metals: 96, other: 36 };
  function normalize(row, now = Date.now(), fx = false) {
    if (!row || row.ok !== true || !(number(row.price) > 0) ||
        !/^[A-Z]{3,5}$/.test(row.currency || "") ||
        typeof row.provider !== "string" || !row.provider.trim()) return null;
    if (fx && !(row.from === "USD" && row.to === "SAR" && row.currency === "SAR")) return null;
    const symbol = fx ? "USD/SAR" : row.symbol;
    if (!symbol || !/^[\dA-Z:/_!.^-]{1,27}$/.test(symbol)) return null;
    const category = fx ? "fx" : categories.includes(row.category) ? row.category : "other";
    const value = fx ? (row.timeZone === "UTC" && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(row.asOf || "") ? row.asOf.replace(" ", "T") + "Z" : null) : row.timestamp;
    let timestamp = typeof value === "string" ? Date.parse(value) : number(value);
    if (timestamp && timestamp < 1e11) timestamp *= 1000;
    if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now + 300000) timestamp = null;
    const safe = (v, n = 100) => typeof v === "string" ? v.trim().slice(0, n) : "";
    return { symbol, category, currency: row.currency, price: row.price, change: fx ? null : number(row.change),
      changePercent: fx ? null : number(row.changePercent), previousClose: fx || !(number(row.previousClose) > 0) ? null : row.previousClose,
      timestamp, provider: safe(row.provider, 60), label: safe(row.label) || symbol, labelAr: safe(row.labelAr) || safe(row.label) || symbol,
      freshness: timestamp === null ? "unknown" : now - timestamp > freshnessHours[category] * 3600000 ? "old" : "dated" };
  }
  function quotes(rows, now = Date.now()) {
    return [...new Map((Array.isArray(rows) ? rows : []).slice(0, 200).map(r => normalize(r, now))
      .filter(Boolean).map(q => [q.symbol, q])).values()];
  }
  function filter(rows, category, query, sort) {
    const normalizeText = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").trim();
    const key = normalizeText(query);
    const chosen = rows.filter(row => (category === "all" || row.category === category) &&
      normalizeText(`${row.symbol} ${row.label} ${row.labelAr}`).includes(key));
    if (sort === "newest") return chosen.sort((a,b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    if (sort === "up" || sort === "down") return chosen.sort((a,b) => a.changePercent === null ? Number(b.changePercent !== null) :
      b.changePercent === null ? -1 : (sort === "up" ? b.changePercent - a.changePercent : a.changePercent - b.changePercent));
    return chosen;
  }
  return { normalize, quotes, filter, categories };
});
