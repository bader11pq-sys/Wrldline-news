/* WRLDLINE editorial ranking — used only to choose the homepage lead and top rail.
   The chronological feed is never re-ordered by this file. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WLRank = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CATEGORY = {
    security: 80,
    politics: 75,
    economy: 65,
    environment: 40,
    world: 30,
    society: 22,
    science: 20,
    health: 18,
    tech: 8,
    culture: -15,
    sports: -35,
    entertainment: -45,
    uncategorized: 0,
  };

  const GULF = new Set(["SA", "AE", "QA", "KW", "BH", "OM", "YE", "IQ"]);
  const GULF_TERMS = /السعودية|السعودي|الخليج|الخليجي|هرمز|البحر الأحمر|باب المندب|أوبك|أرامكو|قطر|الإمارات|الكويت|البحرين|عُمان|عمان|اليمن|جدة|الرياض|الدمام|الفجيرة|دبي|أبوظبي/;

  // "world" is a catch-all in the feed. These heuristics only affect homepage
  // ranking; they never change the article's published category.
  const SPORT = /مباراة|الدوري|لاعب|لاعبة|منتخب|بطولة|كأس|أولمبي|تنس|ملاكمة|سباق|ريال مدريد|برشلونة|ليفربول|مانشستر|هدف في|ملعب|ميدالية|ذهبية|فضية|برونزية|رباع|أثقال|الكومنولث|منافسة قوية/;
  const ENTERTAINMENT = /فيلم|مسلسل|ممثل|ممثلة|مهرجان سينمائي|أوسكار|موسيقى|حفل غنائي|ألبوم|دراما|جائزة إيمي|نيتفليكس/;
  const HEALTH = /مرض|علاج|لقاح|فيروس|سرطان|ألزهايمر|صحة|طبي|مستشفى|وباء/;
  const SOFT = /حرفة|تراث|أزياء|موضة|مهرجان|موسيقى|فيلم|مسلسل|ممثل|ممثلة|ديكور|طهي|وصفات/;
  const LOW_VALUE = /أسعار العملات|سعر الصرف|سعر الدولار|الريال مقابل|مواعيد|حالة الطقس|درجات الحرارة|أسعار الذهب|سعر الذهب|نتائج مباريات|جدول الترتيب|برجك|حظك/;

  const OUTLET_SUFFIX = /Forbes Middle East|Forbes|بلومبرغ|CNBC|العربية Business|جريدة الرياض|الرياض|الشرق الأوسط|عكاظ|الوطن|الجزيرة نت|العربية|سي إن إن بالعربية|بي بي سي عربي|رويترز|فرانس برس|سبوتنيك|إرم نيوز|الحدث|سكاي نيوز عربية/;

  function cleanHeadline(title, sourceName) {
    let value = String(title || "").replace(/\s+/g, " ").trim();
    if (!value) return "";
    const source = String(sourceName || "").replace(/\s+/g, " ").trim();
    if (source) {
      const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      value = value.replace(new RegExp(`\\s*[-–—|]\\s*${escaped}\\s*$`, "i"), "").trim();
    }
    value = value.replace(new RegExp(`\\s*[-–—|]\\s*(?:${OUTLET_SUFFIX.source})\\s*$`), "").trim();
    return value || String(title || "").trim();
  }

  function textOf(article) {
    return String((article && (article.title || "")) + " " + (article && (article.summary || "")));
  }

  function categoryBase(article, text) {
    const category = String(article.cat || article.category || "uncategorized").toLowerCase();
    let value = Object.prototype.hasOwnProperty.call(CATEGORY, category) ? CATEGORY[category] : 0;
    if (category === "world") {
      if (SPORT.test(text)) value = CATEGORY.sports;
      else if (ENTERTAINMENT.test(text)) value = CATEGORY.entertainment;
      else if (HEALTH.test(text)) value = CATEGORY.health;
    }
    return value;
  }

  function score(article, now) {
    if (!article) return -Infinity;
    const at = Number.isFinite(now) ? now : Date.now();
    const text = textOf(article);
    let value = categoryBase(article, text);

    const country = String(article.country || article.aiCountryCode || "").toUpperCase();
    if (GULF.has(country)) value += 45;

    const arabicTitle = /[\u0600-\u06FF]/.test(String(article.title || ""));
    if (arabicTitle) value += 12;
    else if (!article.hasTranslation) value -= 55;

    const summary = String(article.summary || "").trim();
    const title = String(article.title || "").trim();
    if (summary.length >= 120 && summary !== title) value += 8;
    if (summary && summary === title) value -= 10;

    if (GULF_TERMS.test(text)) value += 25;
    if (LOW_VALUE.test(text)) value -= 60;
    if (String(article.ai_summary || article.aiSummary || "").trim().length >= 80) value += 15;
    if (String(article.verification || "") === "verified") value += 10;

    const published = Date.parse(article.published_at || article.publishedAt || "");
    if (Number.isFinite(published)) {
      const hours = Math.max(0, (at - published) / 3600000);
      value += Math.max(0, 30 - hours / 6);
    }

    // A lead without an image is still eligible; the visual penalty is deliberately small.
    if (!article.img || article.img === "#") value -= 2;
    return value;
  }

  function rank(list, now) {
    if (!Array.isArray(list)) return [];
    return list
      .map((article, index) => ({ article, index, score: score(article, now) }))
      .sort((a, b) => (b.score - a.score) || (a.index - b.index))
      .map((entry) => entry.article);
  }

  const NOT_LEAD = new Set(["sports", "culture", "entertainment"]);

  function isLeadEligible(article) {
    if (!article) return false;
    const title = String(article.title || "").trim();
    const summary = String(article.summary || "").trim();
    if (title.length < 20) return false;
    if (summary && summary === title) return false;
    const category = String(article.cat || article.category || "").toLowerCase();
    if (NOT_LEAD.has(category)) return false;
    if (LOW_VALUE.test(title + " " + summary)) return false;
    if (SOFT.test(title + " " + summary)) return false;
    return true;
  }

  return { score, rank, cleanHeadline, isLeadEligible, CATEGORY, GULF };
});
