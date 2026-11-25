/* WRLDLINE personalised feed model.
 * Pure, side-effect-free ranking, filtering and privacy-aware profile logic.
 * Works in the browser (window.WLFeed) and in Node tests (module.exports).
 *
 * Privacy design:
 *  - Explicit follows are the dominant ranking signal.
 *  - Reading behaviour is only used when the reader switched it on, is kept as
 *    coarse metadata (category / country / source / time), and decays away.
 *  - The ranking never leaves the device; the server only stores follows and,
 *    only if opted in, article ids with a read timestamp.
 *  - Every ranked item carries human-readable reasons so the ranking is explainable.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./editorial-display.js"), require("./reader-discovery.js"));
  else root.WLFeed = factory(root.WLEditorial, root.WLDiscovery);
})(typeof window === "undefined" ? globalThis : window, function (editorial, discovery) {
  "use strict";

  const FOLLOW_TYPES = Object.freeze(["category", "country", "topic", "interest"]);
  const MAX_FOLLOWS = 200;
  const MAX_INTEREST_LENGTH = 40;
  const MAX_HISTORY = 300;
  const HOUR = 3600000, DAY = 24 * HOUR;
  const WEIGHTS = Object.freeze({
    category: 3, country: 3, topic: 2.5, interest: 2.5,
    implicitCategory: 1.5, implicitCountry: 1.5, implicitSource: 0.75,
    recency: 4, breaking: 1.5, alreadyRead: -2.5, saved: -0.5
  });

  /** Curated topics: keywords are matched against normalised title + summary. */
  const TOPICS = Object.freeze({
    ai: { ar: "الذكاء الاصطناعي", en: "Artificial intelligence", words: ["ذكاء اصطناعي", "الذكاء الاصطناعي", "artificial intelligence", "chatbot", "machine learning", "openai", "generative ai"] },
    energy: { ar: "الطاقة والنفط", en: "Energy & oil", words: ["نفط", "النفط", "غاز", "الطاقة", "أوبك", "oil", "opec", "natural gas", "energy", "lng", "refinery"] },
    climate: { ar: "المناخ", en: "Climate", words: ["مناخ", "المناخ", "الاحتباس", "انبعاثات", "climate", "emissions", "global warming", "cop"] },
    cyber: { ar: "الأمن السيبراني", en: "Cybersecurity", words: ["سيبراني", "اختراق", "فدية", "cyber", "ransomware", "data breach", "hackers"] },
    elections: { ar: "الانتخابات", en: "Elections", words: ["انتخابات", "الانتخابات", "اقتراع", "election", "elections", "ballot", "voters"] },
    trade: { ar: "التجارة والرسوم", en: "Trade & tariffs", words: ["تجارة", "رسوم جمركية", "تعريفات", "trade", "tariff", "tariffs", "exports", "imports"] },
    banks: { ar: "البنوك المركزية", en: "Central banks", words: ["البنك المركزي", "الفائدة", "التضخم", "central bank", "interest rate", "inflation", "federal reserve"] },
    space: { ar: "الفضاء", en: "Space", words: ["فضاء", "الفضاء", "مدار", "space", "nasa", "rocket", "satellite", "orbit"] },
    health: { ar: "الصحة العامة", en: "Public health", words: ["وباء", "لقاح", "الصحة العامة", "outbreak", "vaccine", "public health", "who"] },
    migration: { ar: "الهجرة واللجوء", en: "Migration", words: ["هجرة", "لاجئ", "لجوء", "migration", "refugees", "asylum", "migrants"] }
  });

  const normalize = (value) => discovery.normalize(value);
  const hay = (article) => ` ${normalize(`${article.title} ${article.summary}`)} `;
  const wordRe = (word) => normalize(word);

  function cleanInterest(value) {
    const text = String(value ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 2) return null;
    return text.slice(0, MAX_INTEREST_LENGTH);
  }

  /** Follow value validation used before anything is stored. */
  function validateFollow(type, value) {
    if (!FOLLOW_TYPES.includes(type)) return { ok: false, reason: "type" };
    let v = String(value ?? "").trim();
    if (type === "interest") v = cleanInterest(v);
    else if (type === "country") v = editorial.iso3Of(v) || null;
    else if (type === "topic") v = Object.hasOwn(TOPICS, v) ? v : null;
    else if (type === "category") v = /^[a-z]{3,20}$/.test(v) ? v : null;
    return v ? { ok: true, value: v } : { ok: false, reason: "value" };
  }

  function emptyFollows() { return { category: [], country: [], topic: [], interest: [] }; }

  /** Rows from user_follows (or local storage) -> {type:[values]}; tolerant of legacy country names. */
  function parseFollows(rows) {
    const out = emptyFollows();
    for (const row of Array.isArray(rows) ? rows : []) {
      const type = row && row.target_type;
      if (!FOLLOW_TYPES.includes(type)) continue;
      let value = String(row.target_value ?? "").trim();
      if (!value) continue;
      if (type === "country") value = editorial.iso3Of(value) || editorial.eventCountryCode({ event_country: value }) || value;
      if (type === "interest") value = cleanInterest(value);
      if (value && !out[type].includes(value)) out[type].push(value);
    }
    return out;
  }

  function followCount(follows) { return FOLLOW_TYPES.reduce((n, t) => n + (follows[t] || []).length, 0); }

  /** Maps an RPC row (or normalised article) to the shape the ranker uses. */
  function toArticle(row, lang) {
    const wanted = lang === "en" ? "en" : "ar";
    const translations = Array.isArray(row.article_translations) ? row.article_translations : [];
    const translation = translations.find((t) => t && t.lang === wanted && t.translation_status === "published"
      && t.translation_source === "editorial" && t.title);
    const sourceLang = String(row.source_language || row.lang || "").toLowerCase().slice(0, 2);
    const published = Date.parse(row.published_at);
    const iso3 = editorial.eventCountryCode(row) || null;
    return {
      id: String(row.id),
      title: String((translation && translation.title) || row.title || ""),
      summary: String((translation && translation.summary) || row.summary || ""),
      titleLang: translation ? wanted : (sourceLang === "ar" || sourceLang === "en" ? sourceLang : ""),
      translated: Boolean(translation),
      category: String(row.category || "uncategorized"),
      country: iso3,
      rawCountry: String(row.country || ""),
      source: String(row.source_name || "").trim(),
      url: String(row.url || row.source_url || ""),
      image: String(row.image_url || ""),
      published: Number.isFinite(published) ? published : null,
      breaking: row.is_breaking === true,
      contentType: String(row.content_type || "news"),
      trust: ["confirmed", "unconfirmed", "disputed"].includes(row.editorial_trust_status) ? row.editorial_trust_status : "unconfirmed",
      sponsored: row.content_type === "sponsored",
      newsdataOnly: row.newsdata_only === true
    };
  }

  /** Reading entries are coarse metadata only: {id, category, country, source, at}. */
  function historyEntry(article, at) {
    return { id: article.id, category: article.category, country: article.country, source: article.source.toLowerCase().slice(0, 80), at: at || Date.now() };
  }

  function addToHistory(list, entry, max = MAX_HISTORY) {
    const next = [entry, ...(Array.isArray(list) ? list : []).filter((e) => e && e.id !== entry.id)];
    return next.slice(0, max);
  }

  /** Time-decayed affinity (half-life 14 days) normalised to 0..1 per dimension. */
  function buildProfile(history, now = Date.now()) {
    const profile = { category: {}, country: {}, source: {}, size: 0 };
    const half = 14 * DAY;
    for (const e of Array.isArray(history) ? history : []) {
      if (!e || !Number.isFinite(e.at)) continue;
      const age = Math.max(0, now - e.at);
      const w = Math.pow(0.5, age / half);
      if (w < 0.02) continue;
      profile.size++;
      if (e.category && e.category !== "uncategorized") profile.category[e.category] = (profile.category[e.category] || 0) + w;
      if (e.country) profile.country[e.country] = (profile.country[e.country] || 0) + w;
      if (e.source) profile.source[e.source] = (profile.source[e.source] || 0) + w;
    }
    for (const dim of ["category", "country", "source"]) {
      const max = Math.max(0, ...Object.values(profile[dim]));
      if (max > 0) for (const k of Object.keys(profile[dim])) profile[dim][k] = profile[dim][k] / max;
    }
    return profile;
  }

  function topicMatches(article, key) {
    const text = hay(article);
    return TOPICS[key].words.some((w) => text.includes(` ${wordRe(w)} `) || (wordRe(w).length > 4 && text.includes(wordRe(w))));
  }

  function followsCountry(article, follows) {
    if (!article.country && !article.rawCountry) return false;
    return follows.country.some((v) => v === article.country || v === article.rawCountry);
  }

  /** Score one article; returns the score and the reasons that explain it. */
  function score(article, ctx) {
    const { follows, profile, now, readIds, savedIds } = ctx;
    const reasons = [];
    let total = 0;
    const add = (type, value, points) => { total += points; reasons.push({ type, value, points: Math.round(points * 100) / 100 }); };

    if (follows.category.includes(article.category)) add("category", article.category, WEIGHTS.category);
    if (followsCountry(article, follows)) add("country", article.country || article.rawCountry, WEIGHTS.country);
    for (const key of follows.topic) if (TOPICS[key] && topicMatches(article, key)) add("topic", key, WEIGHTS.topic);
    const text = follows.interest.length ? hay(article) : "";
    for (const word of follows.interest) {
      const n = normalize(word);
      if (n && text.includes(` ${n} `)) add("interest", word, WEIGHTS.interest);
    }
    const explicit = total;

    if (profile && profile.size) {
      const c = profile.category[article.category];
      if (c) add("history-category", article.category, WEIGHTS.implicitCategory * c);
      const k = article.country && profile.country[article.country];
      if (k) add("history-country", article.country, WEIGHTS.implicitCountry * k);
      const s = article.source && profile.source[article.source.toLowerCase().slice(0, 80)];
      if (s) add("history-source", article.source, WEIGHTS.implicitSource * s);
    }

    if (Number.isFinite(article.published)) {
      const age = Math.max(0, now - article.published);
      total += WEIGHTS.recency * Math.pow(0.5, age / (18 * HOUR));
    }
    if (article.breaking && Number.isFinite(article.published) && now - article.published < 12 * HOUR) add("breaking", "breaking", WEIGHTS.breaking);
    if (readIds && readIds.has(article.id)) add("read", "read", WEIGHTS.alreadyRead);
    if (savedIds && savedIds.has(article.id)) add("saved", "saved", WEIGHTS.saved);
    return { score: total, explicit, reasons };
  }

  function dedupe(articles) {
    const adapted = articles.map((a) => ({ ...a, sourceURL: a.url, originalTitle: "", published_at: a.published === null ? null : new Date(a.published).toISOString() }));
    return discovery.dedupe(adapted).map((a) => { const { sourceURL, originalTitle, published_at, ...rest } = a; return rest; });
  }

  /**
   * Rank articles for one reader.
   * options: { follows, history, readIds, savedIds, now, limit, exploreEvery, maxPerSource }
   * Diversity: no source may take more than maxPerSource slots in the first page and,
   * every `exploreEvery`-th slot, the best article the reader did NOT explicitly follow
   * is promoted so the feed cannot collapse into a filter bubble.
   */
  function rank(articles, options = {}) {
    const now = options.now ?? Date.now();
    const follows = { ...emptyFollows(), ...(options.follows || {}) };
    const profile = options.useHistory === false ? null : buildProfile(options.history, now);
    const ctx = { follows, profile, now, readIds: options.readIds, savedIds: options.savedIds };
    const scored = dedupe(articles.filter((a) => a && a.title && !a.sponsored && !a.newsdataOnly)).map((article) => {
      const r = score(article, ctx);
      return { article, score: r.score, explicit: r.explicit, reasons: r.reasons };
    });
    scored.sort((a, b) => b.score - a.score || (b.article.published ?? 0) - (a.article.published ?? 0) || a.article.id.localeCompare(b.article.id));

    const exploreEvery = options.exploreEvery ?? 5;
    const maxPerSource = options.maxPerSource ?? 3;
    const limit = options.limit ?? scored.length;
    const personalised = followCount(follows) > 0 || (profile && profile.size > 0);
    const out = [], perSource = new Map(), pool = [...scored], deferred = [];
    const takeable = (item) => !item.article.source || (perSource.get(item.article.source) || 0) < maxPerSource;
    const take = (index) => { const [item] = pool.splice(index, 1); if (!item) return; perSource.set(item.article.source, (perSource.get(item.article.source) || 0) + 1); out.push(item); };
    while (pool.length && out.length < limit) {
      const slot = out.length + 1;
      let index = -1;
      if (personalised && exploreEvery > 0 && slot % exploreEvery === 0) {
        index = pool.findIndex((item) => item.explicit === 0 && takeable(item));
        if (index >= 0) pool[index].explore = true;
      }
      if (index < 0) index = pool.findIndex(takeable);
      if (index < 0) { deferred.push(...pool.splice(0)); break; }
      take(index);
    }
    // Over-represented sources are never dropped, only pushed behind the diverse head.
    for (const item of deferred) if (out.length < limit) out.push(item);
    return out;
  }

  /** Filters & sorting; independent from ranking so a reader can always override it. */
  function applyFilters(items, f = {}, now = Date.now()) {
    const q = normalize(f.query || "");
    const windows = { "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY };
    const cutoff = windows[f.range] ? now - windows[f.range] : null;
    let list = items.filter(({ article: a }) =>
      (!f.category || f.category === "all" || a.category === f.category)
      && (!f.country || f.country === "all" || a.country === f.country)
      && (!f.topic || f.topic === "all" || (TOPICS[f.topic] && topicMatches(a, f.topic)))
      && (!f.lang || f.lang === "all" || a.titleLang === f.lang)
      && (!f.trust || f.trust === "all" || a.trust === f.trust)
      && (!f.format || f.format === "all" || a.contentType === f.format)
      && (!f.unreadOnly || !(f.readIds && f.readIds.has(a.id)))
      && (cutoff === null || (a.published !== null && a.published >= cutoff))
      && (!q || q.split(" ").every((t) => hay(a).includes(t))));
    if (f.followedOnly) list = list.filter((i) => i.explicit > 0);
    if (f.sort === "newest") list = [...list].sort((a, b) => (b.article.published ?? 0) - (a.article.published ?? 0));
    else if (f.sort === "oldest") list = [...list].sort((a, b) => (a.article.published ?? Infinity) - (b.article.published ?? Infinity));
    return list;
  }

  /** Facets (value -> count) for the filter controls; computed from the unfiltered set. */
  function facets(items) {
    const out = { category: {}, country: {}, trust: {} };
    for (const { article: a } of items) {
      out.category[a.category] = (out.category[a.category] || 0) + 1;
      if (a.country) out.country[a.country] = (out.country[a.country] || 0) + 1;
      out.trust[a.trust] = (out.trust[a.trust] || 0) + 1;
    }
    return out;
  }

  function reasonText(reason, lang, names = {}) {
    const ar = lang !== "en";
    const topic = reason.type === "topic" && TOPICS[reason.value] ? TOPICS[reason.value][ar ? "ar" : "en"] : reason.value;
    const label = reason.type === "country" || reason.type === "history-country" ? (names.country ? names.country(reason.value) : reason.value)
      : reason.type === "category" || reason.type === "history-category" ? (names.category ? names.category(reason.value) : reason.value) : topic;
    const map = {
      category: ar ? `لأنك تتابع قسم ${label}` : `You follow ${label}`,
      country: ar ? `لأنك تتابع ${label}` : `You follow ${label}`,
      topic: ar ? `موضوع تتابعه: ${label}` : `Topic you follow: ${label}`,
      interest: ar ? `اهتمام أضفته: ${label}` : `Interest you added: ${label}`,
      "history-category": ar ? `تقرأ كثيراً في ${label}` : `You often read ${label}`,
      "history-country": ar ? `تقرأ كثيراً عن ${label}` : `You often read about ${label}`,
      "history-source": ar ? `مصدر تقرأ منه: ${label}` : `A source you read: ${label}`,
      breaking: ar ? "خبر عاجل حديث" : "Recent breaking story",
      read: ar ? "قرأته سابقاً" : "Already read", saved: ar ? "محفوظ" : "Saved"
    };
    return map[reason.type] || "";
  }

  /** Local-storage key helpers, namespaced and versioned; values are validated on read. */
  const KEYS = Object.freeze({ follows: "wl:follows:v1", history: "wl:reading:v1", consent: "wl:reading-consent:v1" });
  function safeParse(text, fallback) { try { const v = JSON.parse(text); return v ?? fallback; } catch { return fallback; } }
  function loadLocalFollows(storage) {
    const raw = safeParse(storage && storage.getItem(KEYS.follows), {});
    const out = emptyFollows();
    for (const type of FOLLOW_TYPES) for (const value of Array.isArray(raw[type]) ? raw[type] : []) {
      const v = validateFollow(type, value);
      if (v.ok && !out[type].includes(v.value) && followCount(out) < MAX_FOLLOWS) out[type].push(v.value);
    }
    return out;
  }
  function loadLocalHistory(storage) {
    const raw = safeParse(storage && storage.getItem(KEYS.history), []);
    return (Array.isArray(raw) ? raw : []).filter((e) => e && typeof e.id === "string" && Number.isFinite(e.at)).slice(0, MAX_HISTORY);
  }

  return Object.freeze({ FOLLOW_TYPES, MAX_FOLLOWS, MAX_HISTORY, WEIGHTS, TOPICS, KEYS, validateFollow, parseFollows, emptyFollows,
    followCount, toArticle, historyEntry, addToHistory, buildProfile, score, rank, applyFilters, facets, reasonText, cleanInterest,
    loadLocalFollows, loadLocalHistory, topicMatches });
});
