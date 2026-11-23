(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WLBriefing = factory();
})(globalThis, function () {
  "use strict";
  const base = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const apikey = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const dayMs = 86400000;
  const fields = [
    "briefing_date", "window_start", "window_end", "generated_at", "article_count",
    "selected_article_count", "source_count", "executive_summary", "top_developments",
    "sections", "global_trends", "watchlist"
  ].join(",");
  const previousDay = (now = Date.now()) => new Date(+now - dayMs).toISOString().slice(0, 10);
  function windowOf(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const start = Date.parse(day + "T00:00:00Z");
    if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== day) return null;
    return { start, end: start + dayMs };
  }
  function accountReturn(value, now = Date.now()) {
    const match = /^\/daily-briefing\.html(?:\?date=(\d{4}-\d{2}-\d{2}))?$/.exec(value || "");
    if (!match || match[1] && (!windowOf(match[1]) || match[1] > previousDay(now))) return "";
    return match[0];
  }
  function link(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  }
  const fingerprint = (v) => String(v ?? "").normalize("NFKC").toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const aggregators = /(?:^|\.)(?:news\.google\.com|newsbreak\.com|digg\.com|smartnews\.com)$/i;
  function publisherLink(value) {
    const safe = link(value);
    return safe && !aggregators.test(new URL(safe).hostname) ? safe : "";
  }
  async function read(response) {
    if (!response.ok) throw Object.assign(new Error("Briefing data unavailable"), { status: response.status });
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new TypeError("Unexpected briefing response");
    return rows;
  }
  async function edition(token, day, latest = false, fetcher = fetch) {
    if (!token || !windowOf(day)) return null;
    const params = new URLSearchParams({
      select: fields, briefing_date: (latest ? "lte." : "eq.") + day,
      order: "briefing_date.desc", limit: "1"
    });
    const rows = await read(await fetcher(`${base}/rest/v1/daily_news_briefings?${params}`, {
      headers: { apikey, Authorization: `Bearer ${token}` },
      credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(9000)
    }));
    return rows[0] && windowOf(rows[0].briefing_date) &&
      (latest ? rows[0].briefing_date <= day : rows[0].briefing_date === day) ? rows[0] : null;
  }
  function publicItems(rows, day) {
    const time = windowOf(day);
    if (!time) return [];
    const seen = new Set(), ids = new Set();
    return rows.flatMap(row => {
      if (!row || ["retracted", "disputed"].includes(row.editorial_trust_status) ||
          Number(row.verification_retraction_count) > 0 || Number(row.verification_conflict_count) > 0 ||
          String(row.content_type || "").toLowerCase() === "sponsored") return [];
      const published = Date.parse(row.published_at);
      if (!Number.isFinite(published) || published < time.start || published >= time.end || published > Date.now()) return [];
      const translated = String(row.lang || "").startsWith("ar") ? null : Array.isArray(row.article_translations) &&
        row.article_translations.find(t => t?.lang === "ar" && t.translation_status === "published" && t.title);
      const title = String(translated?.title || row.title || "").trim();
      const key = fingerprint(title), source = String(row.source_name || "").trim();
      const url = publisherLink(row.source_url) || publisherLink(row.url);
      const id = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(row.id || "") ? row.id : "";
      if (!title || key.length < 8 || seen.has(key) || (id && ids.has(id)) || !source || !url) return [];
      seen.add(key);
      if (id) ids.add(id);
      return [{
        id, title, source, url, category: row.category === "uncategorized" ? "world" : row.category, published,
        needsReview: row.trust_needs_review === true || ["unconfirmed", "unverified"].includes(row.editorial_trust_status),
        language: translated ? "ar" : row.lang || "",
        summary: String((translated ? translated.summary : row.summary) || "").trim().slice(0, 400)
      }];
    });
  }
  function selectPublic(items, limit = 10) {
    const selected = [], counts = new Map(), sections = new Set();
    function add(item, varied) {
      const category = item.category || "world", source = fingerprint(item.source);
      if (selected.length >= limit || selected.includes(item) ||
          (varied && sections.has(category)) || (counts.get(source) || 0) >= 3) return;
      selected.push(item);
      sections.add(category);
      counts.set(source, (counts.get(source) || 0) + 1);
    }
    const sorted = [...items].sort((a, b) => Number(a.needsReview) - Number(b.needsReview) || b.published - a.published);
    sorted.forEach(item => add(item, true));
    sorted.forEach(item => add(item, false));
    return selected;
  }
  async function publicEdition(day, fetcher = fetch) {
    const time = windowOf(day);
    if (!time) return [];
    const response = await fetcher(`${base}/rest/v1/rpc/public_home_news_recent_v3`, {
      method: "POST", headers: { apikey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ p_limit: 24, p_since: new Date(time.start).toISOString(), p_before: new Date(time.end - 1).toISOString().replace(".999Z", ".999999Z") }),
      credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(9000)
    });
    return selectPublic(publicItems(await read(response), day));
  }
  return { base, apikey, previousDay, windowOf, accountReturn, link, fingerprint, edition, publicItems, selectPublic, publicEdition };
});
