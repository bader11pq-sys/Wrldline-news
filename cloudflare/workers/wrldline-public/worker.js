/* WRLDLINE public summary SSR. Module Worker; no service-role key or user sessions. */
/** @typedef {Record<string, unknown> & {id: string, published_at: string}} PublicArticle */
/** @typedef {{title: string, description: string, body: string, canonical?: string, lang?: string, image?: string, schema?: Record<string, unknown> | null, noindex?: boolean, enhance?: boolean}} PageOptions */
/** @typedef {{SUPABASE_URL?: string, SUPABASE_ANON_KEY?: string, PUBLIC_TRUST_ENABLED?: string}} WorkerEnv */
const PUBLIC_ORIGIN = "https://al-ghaib.us.ci";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';
const SITEMAP_NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
const MAX_INDEX_PAGES = 50000;
const PUBLIC_FIELDS = ["id", "title", "summary", "image_url", "author", "lang", "category", "country", "event_country", "source_language", "source_name", "source_url", "url", "published_at", "is_breaking", "verification", "correction_note", "corrected_at"];
// ISO 3166-1 alpha-2 values, matching editorial-display.js. Never pass regional
// pseudo-codes such as 001 or EU to Intl as if they were an event country.
const EVENT_REGIONS = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ
BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM
DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS
GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN
KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ
MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM
PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV
SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI
VN VU WF WS YE YT ZA ZM ZW`.trim().split(/\s+/);
/** @type {Record<string, string[]>} */
const EVENT_REGION_ALIASES = {
  AE:["UAE", "U.A.E.", "الإمارات"], CI:["Ivory Coast"], CZ:["Czech Republic"], GB:["UK", "U.K.", "Britain", "بريطانيا"],
  PS:["Palestine", "State of Palestine", "فلسطين"], RU:["Russian Federation", "روسيا الاتحادية"], SA:["السعودية"],
  SY:["Syrian Arab Republic", "سورية"], TR:["Turkey"], US:["USA", "U.S.", "U.S.A.", "United States of America", "الولايات المتحدة الأمريكية", "أمريكا"],
  VN:["Viet Nam"]
};
const EVENT_REGION_NAMES = {
  ar: new Intl.DisplayNames(["ar"], {type:"region", fallback:"none"}),
  en: new Intl.DisplayNames(["en"], {type:"region", fallback:"none"})
};

/** @param {unknown} value */
function countryKey(value) {
  return text(value, 120).normalize("NFKD").toLowerCase().replace(/[\p{M}\u0640]/gu, "")
    .replace(/ى/g, "ي").replace(/[.’']/g, "").replace(/\s+/g, " ");
}
const EVENT_REGION_LOOKUP = new Map();
for (const code of EVENT_REGIONS) {
  for (const name of [EVENT_REGION_NAMES.ar.of(code), EVENT_REGION_NAMES.en.of(code), ...(EVENT_REGION_ALIASES[code] || [])]) {
    const key = countryKey(name), previous = EVENT_REGION_LOOKUP.get(key);
    if (key) EVENT_REGION_LOOKUP.set(key, previous === undefined || previous === code ? code : null);
  }
}
/** @param {unknown} value @param {boolean} english */
function renderEventCountry(value, english) {
  if (typeof value !== "string") return "";
  const code = EVENT_REGION_LOOKUP.get(countryKey(value));
  return code ? EVENT_REGION_NAMES[english ? "en" : "ar"].of(code) || "" : "";
}

/** @param {unknown} value @param {number} [max] */
export function text(value, max = 12000) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufffe\uffff]/g, "").slice(0, max).trim();
}
/** @param {unknown} value */
export function escapeHTML(value) {
  return text(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}
/** @param {unknown} value */
export function safeURL(value) {
  const raw = text(value, 4096);
  if (!/^https?:\/\//i.test(raw) || /[\s\\]/.test(raw)) return "";
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    return url.href;
  } catch { return ""; }
}
/** @param {unknown} value */
export function jsonLD(value) {
  return (JSON.stringify(value) || "null").replace(/[<>&\u2028\u2029]/g, c => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" }[c] || c));
}
/** @param {unknown} value */
function iso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT/.test(value)) return "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}
/** @param {unknown} value */
function language(value) {
  const lang = text(value, 30).toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(lang) ? lang : "ar";
}
/** @param {string} lang */
function labels(lang) {
  const en = !/^(ar|fa|he|ur)(-|$)/.test(lang);
  return { en, home: en ? "Newsroom" : "غرفة الأخبار", news: en ? "Published news" : "الأخبار المنشورة", source: en ? "Original source" : "المصدر الأصلي", published: en ? "Published" : "تاريخ النشر", author: en ? "By" : "الكاتب", correction: en ? "Published correction" : "تصحيح منشور", share: en ? "Share story" : "مشاركة الخبر", copy: en ? "Copy article link" : "نسخ رابط الخبر", original: en ? "Read at the original source" : "قراءة الخبر لدى المصدر الأصلي", missing: en ? "Original source link unavailable; no substitute link is invented." : "رابط المصدر الأصلي غير متوفر؛ لا نستبدله برابط وهمي.", reading: en ? "WRLDLINE Arabic reader note" : "قراءة WRLDLINE للقارئ العربي", impact: en ? "Why it may matter" : "وش يعني لك؟", watch: en ? "What to watch next" : "ما الذي نراقبه تالياً؟", aiNotice: en ? "AI-assisted context based on the available article text. It is not human verification, a prediction, or personal financial advice." : "سياق مساعد بالذكاء الاصطناعي مستند إلى نص الخبر المتاح؛ لا يُعد تحققاً بشرياً أو تنبؤاً أو نصيحة مالية شخصية.", disclosure: en ? "This page publishes a summary, not the full source story. Full reporting and subsequent updates remain with the attributed source." : "تنشر هذه الصفحة ملخصاً، لا النص الكامل للخبر لدى المصدر. التغطية الكاملة وتحديثاتها متاحة لدى المصدر المنسوب إليه الخبر." };
}
/** @param {string} id */
function articleURL(id) { return `${PUBLIC_ORIGIN}/news/${id.toLowerCase()}`; }
/** @param {unknown} value @param {string} lang */
function dateLabel(value, lang) {
  const valid = iso(value);
  if (!valid) return "";
  return new Intl.DateTimeFormat(lang, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(valid)) + " UTC";
}
/** @param {unknown} value */
function authors(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.filter(v => typeof v === "string").map(v => text(v, 180)).filter(Boolean).slice(0, 10);
}
/** @param {Record<string, unknown>} article */
function source(article) {
  const url = safeURL(article.url) || safeURL(article.source_url);
  const name = text(article.source_name, 300) || (url ? new URL(url).hostname.replace(/^www\./, "") : "");
  return { url, name };
}
/** @param {Record<string, unknown>} row @param {Date} now @returns {PublicArticle | null} */
function projectArticle(row, now) {
  if (!row || typeof row.id !== "string" || !UUID.test(row.id)) throw new Error("Invalid public projection");
  if (Object.hasOwn(row, "editorial_status") && row.editorial_status !== "published") return null;
  const published = iso(row.published_at);
  if (!published || Date.parse(published) > now.getTime()) return null;
  // Defensive allowlist: even an accidentally expanded RPC cannot leak private fields.
  const result = /** @type {PublicArticle} */ (Object.fromEntries(PUBLIC_FIELDS.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]])));
  result.id = row.id.toLowerCase();
  result.published_at = published;
  return result;
}
/** @param {Record<string, unknown>} row @param {Date} now */
function sitemapRow(row, now) {
  if (!row || typeof row.id !== "string" || !UUID.test(row.id)) throw new Error("Invalid sitemap projection");
  const published = iso(row.published_at);
  if (!published || Date.parse(published) > now.getTime()) throw new Error("Invalid sitemap publication date");
  return { id: row.id.toLowerCase(), published_at: published, corrected_at: iso(row.corrected_at) };
}
/** @param {PublicArticle} article @param {Date} now */
function modified(article, now) {
  const correction = iso(article.corrected_at);
  return correction && correction >= article.published_at && Date.parse(correction) <= now.getTime() ? correction : article.published_at;
}
/** @param {PublicArticle} article @param {Record<string, unknown> | null} record @param {string} lang @param {Date} now */
function trustSummary(article, record, lang, now) {
  const l = labels(lang), valid = record && record.id === article.id;
  const reviewed = valid ? iso(record.trust_reviewed_at) : "";
  const translationDate = valid ? iso(record.human_translation_reviewed_at) : "";
  const translated = language(article.source_language || article.lang) !== language(article.lang);
  const humanTranslation = valid && record.human_translation_status === "reviewed" && translationDate && Date.parse(translationDate) <= now.getTime();
  const confirmed = valid && record.editorial_trust_status === "confirmed" && record.trust_needs_review === false && reviewed && Date.parse(reviewed) <= now.getTime() && (!translated || humanTranslation);
  const disputed = valid ? record.editorial_trust_status === "disputed" : article.verification === "disputed";
  const heading = l.en ? "Verification context" : "سياق التحقق";
  const status = confirmed ? (l.en ? "Human editorial confirmation recorded" : "تأكيد تحريري بشري مسجل") : disputed ? (l.en ? "Disputed — consult the evidence and source" : "خبر محل خلاف — راجع الأدلة والمصدر") : (l.en ? "Human confirmation not established on this page" : "لم يُثبت تأكيد بشري في هذه الصفحة");
  const note = l.en ? "Breaking labels, AI analysis and source counts alone are not human verification." : "وسم العاجل وتحليل الذكاء الاصطناعي وأعداد المصادر وحدها ليست تحققاً بشرياً.";
  const translation = translated ? `<p>${humanTranslation ? (l.en ? "Human translation review recorded." : "مراجعة بشرية للترجمة مسجلة.") : (l.en ? "Human translation review is not established." : "لم تُثبت مراجعة بشرية للترجمة.")}</p>` : "";
  return `<section class="public-news-source" data-server-trust><h2>${heading}</h2><p><strong>${status}</strong></p><p>${note}</p>${translation}</section>`;
}

/** @param {PageOptions} options */
function shell({ title, description, canonical, lang = "ar", image = "", body, schema = null, noindex = false, enhance = false }) {
  const l = labels(lang), direction = l.en ? "ltr" : "rtl";
  // Nonce permits JSON-LD, while executable scripts must be same-origin files.
  const nonce = schema ? crypto.randomUUID().replace(/-/g, "") : "";
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0d1a2b"><title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(description)}"><meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large"}">
${canonical ? `<link rel="canonical" href="${escapeHTML(canonical)}">` : ""}
<meta property="og:type" content="${schema ? "article" : "website"}"><meta property="og:site_name" content="WRLDLINE NEWS">
<meta property="og:title" content="${escapeHTML(title)}"><meta property="og:description" content="${escapeHTML(description)}">
${canonical ? `<meta property="og:url" content="${escapeHTML(canonical)}">` : ""}
${image ? `<meta property="og:image" content="${escapeHTML(image)}"><meta name="twitter:image" content="${escapeHTML(image)}">` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}"><meta name="twitter:title" content="${escapeHTML(title)}"><meta name="twitter:description" content="${escapeHTML(description)}">
${schema ? `<meta property="article:published_time" content="${escapeHTML(schema.datePublished)}"><script nonce="${nonce}" type="application/ld+json">${jsonLD(schema)}</script>` : ""}
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/wrld.css?v=20261115-public"><link rel="stylesheet" href="/public-news.css?v=20261115-1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Kufi+Arabic:wght@500;700&family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<link rel="alternate" type="application/rss+xml" title="WRLDLINE NEWS RSS" href="${PUBLIC_ORIGIN}/rss.xml"><link rel="alternate" type="application/atom+xml" title="WRLDLINE NEWS Atom" href="${PUBLIC_ORIGIN}/atom.xml">
${!noindex ? '<script src="/analytics-config.js?v=20261115-1" defer></script><script src="/analytics.js?v=20261115-1" defer></script>' : ""}
${enhance ? '<link rel="stylesheet" href="/article-trust.css?v=20261115-1"><script src="/share.js?v=20261115-canonical" defer></script><script src="/public-news.js?v=20261115-1" defer></script><script src="/article-trust.js?v=20261115-1" defer></script>' : ""}`;
  const html = `<!doctype html><html lang="${escapeHTML(lang)}" dir="${direction}" data-theme="dark"><head>${head}</head><body class="wl-public-news">
<a class="skip-link" href="#mainContent">${l.en ? "Skip to content" : "تجاوز إلى المحتوى"}</a>
<header class="wl-header public-news-header"><div class="wl-container wl-masthead"><a class="wl-brand" href="/" aria-label="WRLDLINE NEWS"><span class="wl-brand-mark" aria-hidden="true">W</span><span class="wl-brand-copy"><strong>WRLDLINE</strong><small>GLOBAL NEWS NETWORK</small></span></a><a class="wl-account" href="/account.html">${l.en ? "My account" : "حسابي"}</a></div>
<nav class="wl-container public-news-nav" aria-label="${l.en ? "News navigation" : "تصفح الأخبار"}"><a href="/">${l.home}</a><a href="/news/">${l.news}</a><a href="/sources.html">${l.en ? "Sources" : "المصادر"}</a><a href="/about.html">${l.en ? "About" : "عن ورلدلاين"}</a></nav></header>
<main class="public-news-main" id="mainContent">${body}</main>
<footer class="public-news-footer"><div class="wl-container">WRLDLINE NEWS · <a href="/about.html">${l.en ? "Editorial policy" : "السياسة التحريرية"}</a> · <a href="/corrections.html">${l.en ? "Corrections" : "التصحيحات"}</a> · <a href="/rss.xml">RSS</a> · <a href="/atom.xml">Atom</a></div></footer></body></html>`;
  return { html, nonce };
}
/** @param {PageOptions} options @param {number} [status] */
function htmlResponse(options, status = 200) {
  const { html, nonce } = shell(options);
  return new Response(html, { status, headers: {
    "Content-Type": "text/html; charset=utf-8",
    // Public only, but deliberately no shared cache: corrections/rejections should not linger.
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": `default-src 'self'; script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ""}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: http: data: blob:; connect-src 'self' https://vmaxbnogmmfyrcucapnq.supabase.co; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'`,
    ...(status !== 200 ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
    ...(status === 503 ? { "Retry-After": "60" } : {})
  } });
}
/** @param {number} status */
function errorPage(status) {
  const missing = status === 404;
  return htmlResponse({ title: missing ? "الخبر غير متوفر | WRLDLINE" : "الأخبار غير متاحة مؤقتاً | WRLDLINE", description: missing ? "لم نعثر على خبر منشور في هذا الرابط." : "تعذر تحميل الخبر الآن. يرجى المحاولة لاحقاً.", noindex: true, body: `<h1>${missing ? "الخبر غير متوفر" : "الأخبار غير متاحة مؤقتاً"}</h1><p class="public-news-summary">${missing ? "قد يكون الرابط غير صحيح أو الخبر غير منشور." : "تعذر تحميل الخبر الآن. يرجى المحاولة لاحقاً."}</p><a href="/news/">العودة إلى الأخبار المنشورة</a>` }, status);
}
/** @param {string} body @param {string} [type] */
function xmlResponse(body, type = "application/xml") {
  return new Response(XML_HEAD + body, { headers: { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
/** @param {PublicArticle} article @param {Date} now @param {Record<string, unknown> | null} [trust] */
export function renderArticle(article, now, trust = null) {
  const lang = language(article.lang || article.source_language), l = labels(lang);
  const title = text(article.title, 1000) || (l.en ? "Published news" : "خبر منشور");
  const summary = text(article.summary), description = (summary || title).replace(/\s+/g, " ").slice(0, 160);
  const canonical = articleURL(article.id), image = safeURL(article.image_url), original = source(article), by = authors(article.author);
  /** @type {Record<string, unknown>} */
  const schema = { "@context": "https://schema.org", "@type": "NewsArticle", "@id": `${canonical}#article`, url: canonical, mainEntityOfPage: canonical, headline: title, description, inLanguage: lang, datePublished: article.published_at, publisher: { "@type": "Organization", name: "WRLDLINE NEWS", url: PUBLIC_ORIGIN } };
  if (summary) schema.articleBody = summary;
  if (image) schema.image = [image];
  if (by.length) schema.author = by.map(name => ({ "@type": "Person", name }));
  if (modified(article, now) !== article.published_at) schema.dateModified = modified(article, now);
  if (original.url) schema.isBasedOn = original.url;
  if (text(article.category, 120)) schema.articleSection = text(article.category, 120);
  const correction = text(article.correction_note, 4000);
  const eventCountry = renderEventCountry(article.event_country, l.en);
  const shareUrl = encodeURIComponent(canonical);
  const shareTitle = encodeURIComponent(title);
  const shareCaption = encodeURIComponent(`${title} — ${description}`);
  const socialShare = `<div class="public-news-social" aria-label="${l.en ? "Share on social networks" : "مشاركة عبر الشبكات"}"><a href="https://wa.me/?text=${shareCaption}%20${shareUrl}" target="_blank" rel="noopener noreferrer">WhatsApp</a><a href="https://twitter.com/intent/tweet?text=${shareTitle}&url=${shareUrl}" target="_blank" rel="noopener noreferrer">X</a><a href="https://t.me/share/url?url=${shareUrl}&text=${shareTitle}" target="_blank" rel="noopener noreferrer">Telegram</a></div>`;
  const body = `<nav class="public-news-breadcrumb" aria-label="${l.en ? "Breadcrumb" : "مسار الصفحة"}"><a href="/news/">${l.news}</a> / ${escapeHTML(text(article.category, 120))}</nav>
<article data-public-article data-audience-article data-article-id="${article.id}" data-category="${escapeHTML(text(article.category, 120))}" data-share-title="${escapeHTML(title)}" data-share-text="${escapeHTML(description)}" data-share-source="${escapeHTML(original.name)}" data-share-image="${escapeHTML(image)}" data-share-url="${canonical}">
${text(article.category, 120) ? `<p class="public-news-kicker">${escapeHTML(text(article.category, 120))}</p>` : ""}
<h1>${escapeHTML(title)}</h1><div class="public-news-meta"><span>${l.published}: <time datetime="${article.published_at}">${escapeHTML(dateLabel(article.published_at, lang))}</time></span>${eventCountry ? `<span class="public-news-event-country">${l.en ? "Event country" : "دولة الحدث"}: <bdi>${escapeHTML(eventCountry)}</bdi></span>` : ""}${by.length ? `<span>${l.author}: ${escapeHTML(by.join(" · "))}</span>` : ""}${original.name ? `<span>${l.source}: ${escapeHTML(original.name)}</span>` : ""}</div>
${image ? `<figure class="public-news-image"><img src="${escapeHTML(image)}" alt="${escapeHTML(title)}" fetchpriority="high" decoding="async" referrerpolicy="no-referrer"></figure>` : ""}
<div class="public-news-summary">${summary ? summary.split(/\n\s*\n/).filter(Boolean).map(p => `<p>${escapeHTML(p)}</p>`).join("") : `<p>${l.en ? "A published summary is not available. Consult the original source for the story." : "الملخص المنشور غير متوفر. يُرجى الرجوع إلى المصدر الأصلي للخبر."}</p>`}</div>
${(text(article.ai_summary, 1200) || text(article.ai_reader_impact, 900) || text(article.ai_watch_next, 900)) ? `<section class="public-news-intelligence"><h2>${l.reading}</h2>${text(article.ai_summary, 1200) ? `<div><h3>${l.en ? "Analysis" : "القراءة التحليلية"}</h3><p>${escapeHTML(text(article.ai_summary, 1200))}</p></div>` : ""}${text(article.ai_reader_impact, 900) ? `<div><h3>${l.impact}</h3><p>${escapeHTML(text(article.ai_reader_impact, 900))}</p></div>` : ""}${text(article.ai_watch_next, 900) ? `<div><h3>${l.watch}</h3><p>${escapeHTML(text(article.ai_watch_next, 900))}</p></div>` : ""}<small>${l.aiNotice}</small></section>` : ""}
${correction ? `<section class="public-news-correction" role="note"><h2>${l.correction}</h2><p>${escapeHTML(correction)}</p>${iso(article.corrected_at) ? `<time datetime="${escapeHTML(iso(article.corrected_at))}">${escapeHTML(dateLabel(article.corrected_at, lang))}</time>` : ""}</section>` : ""}
<section class="public-news-source"><h2>${l.source}</h2>${original.name ? `<p>${escapeHTML(original.name)}</p>` : ""}${original.url ? `<a href="${escapeHTML(original.url)}" target="_blank" rel="noopener noreferrer">${l.original} ↗</a>` : `<p>${l.missing}</p>`}</section>
<p class="public-news-disclosure">${l.disclosure}</p>
<div id="articleTrust" data-article-id="${article.id}" data-trust-ssr="1">${trustSummary(article, trust, lang, now)}</div>
<div class="public-news-actions"><button type="button" id="publicNewsShare">${l.share}</button><button type="button" id="publicNewsCopy">${l.copy}</button><a href="${canonical}">${l.en ? "Permanent article link" : "الرابط الدائم للخبر"}</a></div>${socialShare}<span class="public-news-status" id="publicNewsStatus" role="status" aria-live="polite"></span>
<noscript><p class="public-news-disclosure">${l.en ? "This published summary and source link are available without JavaScript." : "الملخص المنشور ورابط المصدر متاحان دون جافاسكريبت."}</p></noscript></article>`;
  return htmlResponse({ title: `${title} | WRLDLINE NEWS`, description, canonical, lang, image, body, schema, enhance: true });
}
/** @param {PublicArticle[]} articles @param {number} page */
function renderIndex(articles, page) {
  const shown = articles.slice(0, 50), canonical = `${PUBLIC_ORIGIN}/news/${page > 1 ? `?page=${page}` : ""}`;
  const body = `<p class="public-news-kicker">WRLDLINE · PUBLIC NEWS</p><h1>الأخبار المنشورة</h1><p class="public-news-disclosure">ملخصات الأخبار المنشورة مع روابط المصادر وتواريخ النشر الأصلية.</p>
<ul class="public-news-list">${shown.map(a => { const s = source(a); return `<li><article><h2><a href="${articleURL(a.id)}" dir="auto">${escapeHTML(text(a.title, 1000) || "خبر منشور")}</a></h2><p dir="auto">${escapeHTML(text(a.summary, 260))}</p><small>${escapeHTML(s.name)} · <time datetime="${a.published_at}">${escapeHTML(dateLabel(a.published_at, "ar"))}</time></small></article></li>`; }).join("")}</ul>
${!shown.length ? '<p class="public-news-summary">لا توجد أخبار منشورة في هذه الصفحة.</p>' : ""}
<nav class="public-news-paging" aria-label="صفحات الأخبار">${page > 1 ? `<a href="/news/${page === 2 ? "" : `?page=${page - 1}`}">الصفحة السابقة</a>` : "<span></span>"}${articles.length > 50 ? `<a href="/news/?page=${page + 1}">الصفحة التالية</a>` : ""}</nav>`;
  return htmlResponse({ title: `الأخبار المنشورة${page > 1 ? ` — ${page}` : ""} | WRLDLINE NEWS`, description: "ملخصات الأخبار المنشورة من WRLDLINE مع روابط المصادر وتواريخ النشر الأصلية. تصفح الأخبار دون تسجيل الدخول.", canonical, body });
}
/** @param {PublicArticle[]} articles @param {Date} now */
function newsSitemap(articles, now) {
  const since = now.getTime() - 48 * 60 * 60 * 1000;
  const recent = articles.filter(a => Date.parse(a.published_at) >= since && Date.parse(a.published_at) <= now.getTime()).slice(0, 1000);
  return xmlResponse(`<urlset ${SITEMAP_NS} xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${recent.map(a => `<url><loc>${articleURL(a.id)}</loc><news:news><news:publication><news:name>WRLDLINE NEWS</news:name><news:language>${escapeHTML(language(a.lang || a.source_language).split("-")[0])}</news:language></news:publication><news:publication_date>${a.published_at}</news:publication_date><news:title>${escapeHTML(text(a.title, 1000))}</news:title></news:news></url>`).join("")}</urlset>`);
}
/** @param {PublicArticle[]} articles */
function rss(articles) {
  return xmlResponse(`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>WRLDLINE NEWS</title><link>${PUBLIC_ORIGIN}/news/</link><description>Published news summaries and original sources / ملخصات الأخبار وروابط مصادرها</description><atom:link href="${PUBLIC_ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>${articles.length ? `<lastBuildDate>${new Date(articles[0].published_at).toUTCString()}</lastBuildDate>` : ""}${articles.map(a => { const s = source(a); return `<item><title>${escapeHTML(text(a.title, 1000))}</title><link>${articleURL(a.id)}</link><guid isPermaLink="true">${articleURL(a.id)}</guid><description>${escapeHTML(text(a.summary))}</description><pubDate>${new Date(a.published_at).toUTCString()}</pubDate>${s.url ? `<source url="${escapeHTML(s.url)}">${escapeHTML(s.name || new URL(s.url).hostname)}</source>` : ""}</item>`; }).join("")}</channel></rss>`, "application/rss+xml");
}
/** @param {PublicArticle[]} articles @param {Date} now */
function atom(articles, now) {
  const latest = articles.map(a => modified(a, now)).sort().at(-1) || now.toISOString();
  return xmlResponse(`<feed xmlns="http://www.w3.org/2005/Atom"><id>${PUBLIC_ORIGIN}/atom.xml</id><title>WRLDLINE NEWS</title><subtitle>Published summaries / ملخصات الأخبار المنشورة</subtitle><updated>${latest}</updated><author><name>WRLDLINE NEWS</name><uri>${PUBLIC_ORIGIN}</uri></author><link href="${PUBLIC_ORIGIN}/atom.xml" rel="self" type="application/atom+xml"/><link href="${PUBLIC_ORIGIN}/news/" rel="alternate"/>${articles.map(a => { const s = source(a), by = authors(a.author); return `<entry><id>${articleURL(a.id)}</id><title type="text">${escapeHTML(text(a.title, 1000))}</title><link href="${articleURL(a.id)}" rel="alternate"/><published>${a.published_at}</published><updated>${modified(a, now)}</updated><summary type="text">${escapeHTML(text(a.summary))}</summary>${by.map(name => `<author><name>${escapeHTML(name)}</name></author>`).join("")}${s.name ? `<contributor><name>${escapeHTML(s.name)}</name></contributor>` : ""}${s.url ? `<link href="${escapeHTML(s.url)}" rel="related" title="Original source"/>` : ""}</entry>`; }).join("")}</feed>`, "application/atom+xml");
}

/** @param {{fetchImpl?: typeof fetch, now?: () => Date}} [options] */
export function createWorker({ fetchImpl = globalThis.fetch.bind(globalThis), now = () => new Date() } = {}) {
  return {
  /** @param {Request} request @param {WorkerEnv} env */
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    const owned = path === "/news" || path.startsWith("/news/") || path.startsWith("/news-sitemap.xml") || path.startsWith("/article-sitemap") || path.startsWith("/rss.xml") || path.startsWith("/atom.xml");
    // Defensive origin preservation if an overbroad Cloudflare route is accidentally installed.
    if (!owned) return fetchImpl(request);
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
    const finish = /** @param {Response} response */ response => request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
    const clock = now(), deadline = Date.now() + 20000;
    /** @param {string} name @param {Record<string, unknown>} args @param {number} maxRows @param {boolean} [scalar] @returns {Promise<any>} */
    async function rpc(name, args, maxRows, scalar = false) {
      const base = safeURL(env?.SUPABASE_URL);
      if (!base || !base.startsWith("https://") || !env?.SUPABASE_ANON_KEY) throw new Error("Public backend unconfigured");
      const baseURL = new URL(base);
      if (baseURL.pathname !== "/" || baseURL.search || baseURL.hash) throw new Error("Invalid backend origin");
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Backend deadline exceeded");
      const response = await fetchImpl(`${baseURL.origin}/rest/v1/rpc/${name}`, {
        method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(args), signal: AbortSignal.timeout(Math.min(remaining, 8000)), redirect: "manual"
      });
      // Never forward caller cookies or Authorization; publishable sb_* keys use apikey only.
      if (!response.ok) {
        console.warn(JSON.stringify({ event: "public_rpc_failure", rpc: name, status: response.status }));
        throw new Error("Public backend failed");
      }
      if (Number(response.headers.get("content-length") || 0) > 20000000) throw new Error("Projection too large");
      const raw = await response.text();
      if (raw.length > 20000000) throw new Error("Projection too large");
      const rows = JSON.parse(raw);
      if (scalar) {
        if (raw.length > 1500000 || (rows !== null && (typeof rows !== "object" || Array.isArray(rows)))) throw new Error("Invalid trust projection");
        return rows;
      }
      if (!Array.isArray(rows) || rows.length > maxRows) throw new Error("Invalid bounded projection");
      return rows;
    }
    /** @param {number} limit @param {string | null} [since] @param {number} [offset] @returns {Promise<PublicArticle[]>} */
    async function recent(limit, since = null, offset = 0) {
      /** @type {Record<string, unknown>[]} */
      const rows = await rpc("public_news_recent", { p_limit: limit, p_before: clock.toISOString(), p_since: since, p_offset: offset }, limit);
      return rows.map(row => projectArticle(row, clock)).filter(/** @returns {a is PublicArticle} */ a => Boolean(a && (!since || a.published_at >= since))).sort((a, b) => b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id));
    }
    try {
      if (path === "/news") return finish(new Response(null, { status: 308, headers: { Location: `${PUBLIC_ORIGIN}/news/${url.search}`, "Cache-Control": "no-store" } }));
      if (path === "/news/") {
        const value = url.searchParams.get("page") || "1";
        if (!/^[1-9]\d{0,5}$/.test(value) || Number(value) > 50000) return finish(errorPage(404));
        const page = Number(value), articles = await recent(51, null, (page - 1) * 50);
        if (page > 1 && !articles.length) return finish(errorPage(404));
        return finish(renderIndex(articles, page));
      }
      if (path.startsWith("/news/")) {
        const match = path.match(/^\/news\/([^/]+)(\/?)$/);
        if (!match || !UUID.test(match[1])) return finish(errorPage(404));
        const id = match[1].toLowerCase();
        const rows = await rpc("public_news_article", { p_id: id }, 1);
        const article = rows.length ? projectArticle(rows[0], clock) : null;
        if (!article || article.id !== id) return finish(errorPage(404));
        if (match[2] || match[1] !== id || url.search) return finish(new Response(null, { status: 308, headers: { Location: articleURL(id), "Cache-Control": "no-store" } }));
        let trust = null;
        if (env.PUBLIC_TRUST_ENABLED === "true") {
          try { trust = await rpc("get_public_article_trust", { p_article_id: id, p_lang: language(article.lang) }, 1, true); }
          catch { /* Optional credibility data must not remove the public summary. */ }
        }
        let intelligence = null;
        try {
          const rows = await rpc("public_news_article_intelligence", { p_id: id }, 1);
          intelligence = rows[0] && rows[0].id === id ? rows[0] : null;
        } catch { /* New reader context is optional until its migration is deployed. */ }
        return finish(renderArticle(intelligence ? { ...article, ...intelligence } : article, clock, trust));
      }
      if (path === "/news-sitemap.xml") return finish(newsSitemap(await recent(1000, new Date(clock.getTime() - 48 * 60 * 60 * 1000).toISOString()), clock));
      if (path === "/rss.xml" || path === "/atom.xml") {
        const articles = await recent(100, new Date(clock.getTime() - 7 * 86400000).toISOString());
        return finish(path === "/rss.xml" ? rss(articles) : atom(articles, clock));
      }
      if (path === "/article-sitemap.xml") {
        const pages = [];
        for (let offset = 0; offset <= MAX_INDEX_PAGES; offset += 1000) {
          const chunk = await rpc("public_news_sitemap_index", { p_page: null, p_offset: offset }, 1000);
          for (const row of chunk) {
            const page = Number(row.page);
            if (!Number.isInteger(page) || page !== pages.length + 1 || page > MAX_INDEX_PAGES || (page === 1 ? row.after_id !== null : !UUID.test(row.after_id || ""))) throw new Error("Invalid sitemap index");
            pages.push({ page });
          }
          if (chunk.length < 1000) break;
        }
        return finish(xmlResponse(`<sitemapindex ${SITEMAP_NS}>${pages.map(p => `<sitemap><loc>${PUBLIC_ORIGIN}/article-sitemap-${p.page}.xml</loc></sitemap>`).join("")}</sitemapindex>`));
      }
      const pageMatch = path.match(/^\/article-sitemap-([1-9]\d{0,4})\.xml$/);
      if (!pageMatch || Number(pageMatch[1]) > MAX_INDEX_PAGES) return finish(errorPage(404));
      const page = Number(pageMatch[1]);
      const boundaries = await rpc("public_news_sitemap_index", { p_page: page, p_offset: 0 }, 1);
      if (!boundaries.length) return finish(errorPage(404));
      const boundary = boundaries[0];
      if (Number(boundary.page) !== page || (page === 1 ? boundary.after_id !== null : !UUID.test(boundary.after_id || ""))) throw new Error("Invalid sitemap boundary");
      /** @type {Record<string, unknown>[]} */
      const projection = await rpc("public_news_sitemap", { p_after: boundary.after_id }, 1000);
      const rows = projection.map(row => sitemapRow(row, clock));
      for (let i = 0; i < rows.length; i++) if ((i && rows[i].id <= rows[i - 1].id) || (boundary.after_id && rows[i].id <= boundary.after_id.toLowerCase())) throw new Error("Unordered sitemap projection");
      return finish(xmlResponse(`<urlset ${SITEMAP_NS}>${rows.map(row => `<url><loc>${articleURL(row.id)}</loc><lastmod>${modified(row, clock)}</lastmod></url>`).join("")}</urlset>`));
    } catch (error) {
      const safeReasons = ["Public backend unconfigured", "Invalid backend origin", "Backend deadline exceeded", "Public backend failed", "Projection too large", "Invalid trust projection", "Invalid bounded projection", "Invalid public projection", "Invalid sitemap index", "Invalid sitemap boundary", "Unordered sitemap projection"];
      const reason = error instanceof Error && safeReasons.includes(error.message) ? error.message : error instanceof Error ? error.name : "Unknown";
      console.warn(JSON.stringify({ event: "public_route_failure", reason }));
      // Backend details, keys and error payloads never enter public HTML or logs.
      return finish(errorPage(503));
    }
  } };
}
export default createWorker();
