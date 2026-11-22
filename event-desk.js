/* One conservative matcher for the front page and each event's coverage list. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WLEventDesk = api;
})(globalThis, function () {
  "use strict";

  const labels = Object.freeze({
    dossier: ["ملف الحدث", "Event dossier"],
    original: ["تقرير WRLDLINE الأصلي", "WRLDLINE original reporting"],
    reported: ["خبر منقول", "Reported news"],
    analysis: ["تحليل", "Analysis"],
    opinion: ["رأي", "Opinion"],
    sponsored: ["محتوى مدعوم", "Sponsored"],
  });
  function isOriginal(article) {
    const row = article?.raw || article;
    return /^WRLDLINE NEWS$/i.test(String(row?.source_name || "").trim()) &&
      /^editorial-\d+$/.test(String(row?.url || "")) && !row.source_url;
  }
  function kind(article) {
    const type = String(article?.content_type || article?.contentType || "").trim().toLowerCase();
    return ["analysis", "opinion", "sponsored"].includes(type) ? type : type === "news" && isOriginal(article) ? "original" : "reported";
  }
  function label(type, lang) { return (labels[type] || labels.reported)[lang === "en" ? 1 : 0]; }
  function normalize(value) {
    return String(value || "").normalize("NFKC").toLowerCase()
      .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  function prepare(entries) {
    return (Array.isArray(entries) ? entries : []).filter(d => d && typeof d.slug === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug) && Array.isArray(d.groups)).map(d => ({
      ...d,
      start: d.from ? Date.parse(d.from) : -Infinity,
      end: d.until ? Date.parse(d.until) : Infinity,
      ids: new Set(d.articleIds || []),
      patterns: d.groups.map(group => group.map(phrase => ` ${normalize(phrase)} `)),
    }));
  }
  function match(article, catalog) {
    const status = article?.editorial_status || article?.editorialStatus;
    if (!article || (status && status !== "published") || ["opinion", "sponsored"].includes(kind(article))) return null;
    const id = String(article.id || "").toLowerCase();
    const explicit = catalog.filter(d => d.ids.has(id));
    if (explicit.length) return explicit.length === 1 ? explicit[0] : null;
    const date = Date.parse(article.published_at || article.publishedAt);
    if (!Number.isFinite(date)) return null;
    // Only use the original headline: topic mentions in a summary or a
    // language switch alone must not redirect an unrelated story.
    const title = ` ${normalize(article.originalTitle || article.title)} `;
    const eligible = catalog.filter(d => date >= d.start && date < d.end &&
      d.patterns.some(group => group.every(phrase => title.includes(phrase))));
    return eligible.length === 1 ? eligible[0] : null;
  }
  function group(items, catalog) {
    const blocks = [], events = new Map();
    for (const item of items) {
      const dossier = match(item, catalog);
      if (!dossier) { blocks.push({ item }); continue; }
      if (!events.has(dossier.slug)) {
        const block = { dossier, items: [] };
        events.set(dossier.slug, block);
        blocks.push(block);
      }
      events.get(dossier.slug).items.push(item);
    }
    return blocks;
  }
  function fromPage(doc) {
    try { return prepare(JSON.parse(doc.getElementById("eventDeskCatalog")?.textContent || "[]")); }
    catch { return []; }
  }
  return { kind, label, normalize, prepare, match, group, fromPage };
});
