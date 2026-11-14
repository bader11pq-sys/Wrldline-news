/* WRLDLINE shared news taxonomy.
 * This file is intentionally dependency-free and works in two modes:
 *   - browser: exposes window.WRLDLINE_TAXONOMY
 *   - Node/CommonJS: module.exports
 * It is the single client/Node source of truth for article categories,
 * source scopes, source-language resolution and translation labels.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WRLDLINE_TAXONOMY = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TAXONOMY_VERSION = "wrldline-1";

  const CATEGORY_DEFINITIONS = [
    { key: "politics", ar: "سياسة", en: "Politics" },
    { key: "economy", ar: "اقتصاد", en: "Economy" },
    { key: "security", ar: "أمن ودفاع", en: "Security & Defence" },
    { key: "tech", ar: "تقنية", en: "Technology" },
    { key: "sports", ar: "رياضة", en: "Sports" },
    { key: "culture", ar: "ثقافة", en: "Culture" },
    { key: "health", ar: "صحة", en: "Health" },
    { key: "science", ar: "علوم", en: "Science" },
    { key: "environment", ar: "بيئة", en: "Environment" },
    { key: "society", ar: "مجتمع", en: "Society" },
    { key: "world", ar: "حول العالم", en: "Around the world" },
    { key: "uncategorized", ar: "غير مصنف", en: "Uncategorized" }
  ];

  const CATEGORY_KEYS = CATEGORY_DEFINITIONS.map((item) => item.key);
  const ALLOWED_CATEGORIES = new Set(CATEGORY_KEYS);
  const CATEGORY_NAMES = { ar: {}, en: {} };
  for (const item of CATEGORY_DEFINITIONS) {
    CATEGORY_NAMES.ar[item.key] = item.ar;
    CATEGORY_NAMES.en[item.key] = item.en;
  }

  const SOURCE_SCOPES = ["local", "national", "regional", "international", "cross-border", "unknown"];
  const SCOPE_NAMES = {
    ar: { local: "محلي", national: "وطني", regional: "إقليمي", international: "دولي", "cross-border": "عابر للحدود", unknown: "غير معروف" },
    en: { local: "Local", national: "National", regional: "Regional", international: "International", "cross-border": "Cross-border", unknown: "Unknown" }
  };

  const TRANSLATION_STATUSES = ["none", "draft", "review", "published", "rejected"];
  const TRANSLATION_SOURCES = ["editorial", "machine_draft", "external_source"];
  const LANGUAGE_DETECTION_VALUES = ["declared", "detected", "conflict", "legacy", "unknown"];

  function normalizeCategory(value) {
    const key = String(value || "").trim().toLowerCase();
    return ALLOWED_CATEGORIES.has(key) ? key : "uncategorized";
  }

  function categoryName(value, lang) {
    return CATEGORY_NAMES[lang === "en" ? "en" : "ar"][normalizeCategory(value)];
  }

  function detectLanguage(text) {
    const value = String(text || "");
    const arabic = (value.match(/[\u0600-\u06FF]/g) || []).length;
    const latin = (value.match(/[A-Za-z]/g) || []).length;
    if (!arabic && !latin) return "unknown";
    return arabic >= latin ? "ar" : "en";
  }

  /**
   * The source-declared language wins. Title/summary detection is a check,
   * never a silent replacement. A mismatch is reported so it can be reviewed.
   */
  function resolveSourceLanguage(declared, text) {
    const raw = String(declared || "").trim().toLowerCase();
    const declaredLanguage = raw.startsWith("ar") ? "ar" : (raw.startsWith("en") ? "en" : null);
    const detected = detectLanguage(text);
    if (declaredLanguage && detected !== "unknown" && declaredLanguage !== detected) {
      return { language: declaredLanguage, detection: "conflict", detected };
    }
    if (declaredLanguage) return { language: declaredLanguage, detection: "declared", detected };
    if (detected !== "unknown") return { language: detected, detection: "detected", detected };
    return { language: "en", detection: "unknown", detected: "unknown" };
  }

  function normalizeScope(value) {
    const key = String(value || "").trim().toLowerCase();
    return SOURCE_SCOPES.includes(key) ? key : "unknown";
  }

  function scopeName(value, lang) {
    return SCOPE_NAMES[lang === "en" ? "en" : "ar"][normalizeScope(value)];
  }

  /**
   * Feed-level category is only a signal. General feeds must not be promoted
   * to "world" just because their publisher is international.
   */
  function inferCategoryFromFeed(feed) {
    const declared = String(feed && feed.category || "").trim().toLowerCase();
    if (ALLOWED_CATEGORIES.has(declared)) return declared;
    const haystack = [feed && feed.name, feed && feed.url].filter(Boolean).join(" ").toLowerCase();
    const rules = [
      ["sports", /(?:^|[^a-z])(sport|sports|football|soccer|nba|nfl|cricket|tennis|olympic)/i],
      ["economy", /(?:^|[^a-z])(business|economy|economic|markets?|finance|financial|money|trade)/i],
      ["tech", /(?:^|[^a-z])(tech|technology|gadget|digital|artificial intelligence)/i],
      ["health", /(?:^|[^a-z])(health|medical|medicine|wellness)/i],
      ["culture", /(?:^|[^a-z])(culture|arts?|entertainment|celebrity|music|film|cinema)/i],
      ["science", /(?:^|[^a-z])(science|space|research)/i],
      ["environment", /(?:^|[^a-z])(environment|climate|nature|energy)/i],
      ["security", /(?:^|[^a-z])(security|defence|defense|military)/i],
      ["politics", /(?:^|[^a-z])(politic|politics|election|government|parliament|diplomacy)/i],
      ["world", /(?:^|[^a-z])(world|international|global|foreign)/i]
    ];
    for (const [key, pattern] of rules) {
      if (pattern.test(haystack)) return key;
    }
    return "uncategorized";
  }

  /**
   * Source scope describes the publisher's reach, not the event location.
   */
  function inferSourceScope(feed) {
    const declared = String(feed && feed.source_scope || "").trim().toLowerCase();
    if (SOURCE_SCOPES.includes(declared)) return declared;
    const haystack = [feed && feed.name, feed && feed.url, feed && feed.country].filter(Boolean).join(" ").toLowerCase();
    if (/دولي|international|world|global|foreign|afp|reuters|associated press|ap news|bbc|cnn|al jazeera english|dw|france 24|npr|guardian|new york times|sky news/.test(haystack)) return "international";
    if (/السعودية|كويت|الإمارات|قطر|البحرين|عمان|اليمن|مصر|الأردن|لبنان|فلسطين|سوريا|العراق|المغرب|الجزائر|تونس|ليبيا|السودان|saudi|kuwait|emirates|qatar|bahrain|oman|yemen|egypt|jordan|lebanon|palestine|syria|iraq|morocco|algeria|tunisia|libya|sudan/.test(haystack)) return "national";
    return "unknown";
  }

  function translationStatusLabel(status, source, lang) {
    const l = lang === "en" ? "en" : "ar";
    const statusKey = TRANSLATION_STATUSES.includes(String(status || "")) ? String(status) : "none";
    if (statusKey === "published") {
      if (source === "editorial") return l === "ar" ? "ترجمة تحريرية معتمدة" : "Verified editorial translation";
      if (source === "external_source") return l === "ar" ? "ترجمة من مصدر خارجي" : "External-source translation";
      return l === "ar" ? "ترجمة آلية منشورة" : "Published machine translation";
    }
    if (statusKey === "review") return l === "ar" ? "ترجمة قيد المراجعة" : "Translation under review";
    if (statusKey === "draft") return l === "ar" ? "ترجمة آلية — مسودة غير منشورة" : "Machine draft — unpublished";
    if (statusKey === "rejected") return l === "ar" ? "ترجمة مرفوضة" : "Rejected translation";
    return "";
  }

  return {
    TAXONOMY_VERSION,
    CATEGORY_DEFINITIONS,
    CATEGORY_KEYS,
    ALLOWED_CATEGORIES,
    CATEGORY_NAMES,
    SOURCE_SCOPES,
    SCOPE_NAMES,
    TRANSLATION_STATUSES,
    TRANSLATION_SOURCES,
    LANGUAGE_DETECTION_VALUES,
    normalizeCategory,
    categoryName,
    detectLanguage,
    resolveSourceLanguage,
    normalizeScope,
    scopeName,
    inferCategoryFromFeed,
    inferSourceScope,
    translationStatusLabel
  };
});
