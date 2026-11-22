/* Shared, side-effect-free helpers for homepage discovery. */
((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WLDiscovery = api;
})(globalThis, () => {
  function normalize(value) {
    return String(value ?? "").normalize("NFKD").toLowerCase()
      .replace(/[\p{M}\p{Cf}\u0640]/gu, "")
      .replace(/\u0671/g, "ا").replace(/ى/g, "ي")
      .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0))
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  function search(articles, input, labels = () => [], limit = 30) {
    const query = normalize(input);
    if (!query) return { count: 0, matches: [] };
    const terms = [...new Set(query.split(" "))];
    const matches = [];
    for (const article of articles) {
      const title = normalize(article.title);
      const original = normalize(article.originalTitle);
      const translated = normalize(article.translationTitle);
      const titles = [title, original, translated];
      const metadata = normalize([article.src, article.country, ...labels(article)].join(" "));
      const body = normalize([article.summary, article.originalSummary, article.translationSummary].join(" "));
      const haystack = `${titles.join(" ")} ${metadata} ${body}`;
      if (!terms.every(term => haystack.includes(term))) continue;
      const score = (titles.some(value => value.includes(query)) ? 12 : 0)
        + terms.reduce((total, term) => total + (titles.some(value => value.includes(term)) ? 4 : metadata.includes(term) ? 2 : 1), 0);
      matches.push({ article, score });
    }
    matches.sort((a, b) => b.score - a.score || compareDates(a.article, b.article, "newest"));
    return { count: matches.length, matches: matches.slice(0, limit).map(hit => hit.article) };
  }

  function compareDates(a, b, order) {
    const first = Date.parse(a.published_at), second = Date.parse(b.published_at);
    if (!Number.isFinite(first)) return Number.isFinite(second) ? 1 : 0;
    if (!Number.isFinite(second)) return -1;
    return order === "oldest" ? first - second : second - first;
  }

  function feedFreshness(articles, checkedAt) {
    const quietAfter = 6 * 60 * 60 * 1000;
    let hasVisibleArticles = false, newest = null;
    for (const article of articles) {
      if (article.isNewsDataOnly) continue;
      hasVisibleArticles = true;
      const publishedAt = Date.parse(article.published_at);
      if (Number.isFinite(publishedAt) && publishedAt <= checkedAt && (newest === null || publishedAt > newest)) {
        newest = publishedAt;
      }
    }
    if (newest === null) return { status: hasVisibleArticles ? "undated" : "empty", newest };
    return { status: checkedAt - newest >= quietAfter ? "quiet" : "recent", newest };
  }

  const formats = Object.freeze(["news","analysis","opinion","sponsored"]);

  function filter(articles, { category, country, format = "all", sort, followOnly, follows }) {
    return articles.filter(a => !a.isNewsDataOnly
      && (category === "all" || a.cat === category)
      && (country === "all" || a.eventCountryCode === country)
      && (format === "all" || a.contentType === format)
      && (!followOnly || follows.category.includes(a.cat) || follows.country.includes(a.country)))
      .sort((a, b) => compareDates(a, b, sort));
  }

  function related(articles, current, limit = 3) {
    if (current.cat === "uncategorized" && !current.eventCountryCode) return [];
    return dedupe(articles.filter(a => a.id !== current.id && !a.isNewsDataOnly && a.contentType !== "sponsored"
      && (!a.sourceURL || a.sourceURL !== current.sourceURL)
      && normalize(a.title) !== normalize(current.title)
      && ((current.cat !== "uncategorized" && a.cat === current.cat)
        || (current.eventCountryCode && a.eventCountryCode === current.eventCountryCode))))
      .sort((a,b) => Number(b.cat === current.cat) + Number(!!current.eventCountryCode && b.eventCountryCode === current.eventCountryCode)
        - Number(a.cat === current.cat) - Number(!!current.eventCountryCode && a.eventCountryCode === current.eventCountryCode)
        || compareDates(a,b,"newest")).slice(0,limit);
  }

  function isPromotionalHeadline(value) {
    const title = normalize(value);
    return /\b(?:promo(?:tional)?|bonus|coupon|referral|discount) code\b|\b(?:betting|casino|sportsbook) promo\b|(?:^| )(?:كود|رمز) (?:ال)?(?:خصم|ترويجي)(?: |$)/.test(title);
  }

  function dedupe(articles) {
    const ids = new Set(), titles = new Set(), urls = new Set();
    return [...articles].sort((a,b) => compareDates(a,b,"newest")).filter(article => {
      const key = normalize(article.title || article.originalTitle);
      const url = String(article.sourceURL || "").split("#")[0].replace(/\/$/, "");
      if (ids.has(article.id) || (key && titles.has(key)) || (url && urls.has(url))) return false;
      ids.add(article.id);
      if (key) titles.add(key);
      if (url) urls.add(url);
      return true;
    });
  }

  return { normalize, search, formats, filter, related, isPromotionalHeadline, dedupe, feedFreshness };
});
