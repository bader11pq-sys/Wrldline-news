/* WRLDLINE public summary SSR. Module Worker; no service-role key or user sessions. */
import { SECTION_ROUTES, PRIMARY_NAV as REGISTRY_PRIMARY_NAV } from "./sections.generated.js";
/** @typedef {Record<string, unknown> & {id: string, published_at: string}} PublicArticle */
/** @typedef {{title: string, description: string, body: string, canonical?: string, alternatesFor?: string, lang?: string, image?: string, schema?: Record<string, unknown> | null, noindex?: boolean, enhance?: boolean, currentPath?: string}} PageOptions */
/** @typedef {{SUPABASE_URL?: string, SUPABASE_ANON_KEY?: string, PUBLIC_TRUST_ENABLED?: string, ENVIRONMENT?: string, GIT_COMMIT?: string, DEPLOYED_AT?: string, WORKER_SERVICE?: string}} WorkerEnv */
export const PUBLIC_ORIGIN = "https://al-ghaib.us.ci";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';
const SITEMAP_NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
const MAX_INDEX_PAGES = 50000;
const PUBLIC_FIELDS = ["id", "title", "summary", "image_url", "author", "lang", "category", "country", "event_country", "source_language", "source_name", "source_url", "url", "published_at", "is_breaking", "verification", "correction_note", "corrected_at", "audience_lane", "content_type", "received_at", "gate_reason"];

/* Common guesses and older links: slug -> the section that covers it. */
const SECTION_ALIASES = new Map([
  ["energy", "economy"], ["business", "economy"], ["markets", "economy"], ["trade", "economy"], ["oil", "economy"],
  ["defence", "security"], ["defense", "security"], ["military", "security"],
  ["technology", "tech"], ["ai", "tech"], ["climate", "environment"],
  ["international", "world"], ["global", "world"],
  ["freedoms", "rights"], ["human-rights", "rights"], ["justice", "rights"],
  ["education", "society"]
]);
/* Editorial sections. Generated from site-sections.js by
   scripts/build-sections.mjs, so the worker cannot drift from the navigation
   registry: one hierarchy, one set of labels, one set of parents. `key` must
   match public.articles.category. */
export const SECTIONS = SECTION_ROUTES;
const SECTION_BY_SLUG = new Map(SECTIONS.map(section => [section.slug, section]));
const SECTION_BY_KEY = new Map(SECTIONS.map(section => [section.key, section]));

/* Renders the public news bar from the same registry the client-side
   navigation uses. Static pages get a leading slash; the language edition is
   carried as ?lang=en so the bar never points at a different page set. */
function registryNav(l, currentPath) {
  const withLang = href => {
    let out = href === "index.html" ? "/" : href.startsWith("/") ? href : `/${href}`;
    if (l.en) out += out.includes("?") ? "&lang=en" : "?lang=en";
    return out;
  };
  const newsHref = withLang("/news");
  const items = [
    REGISTRY_PRIMARY_NAV.find(item => item.key === "home"),
    { href: "/news", ar: "الأرشيف", en: "Archive" },
    ...REGISTRY_PRIMARY_NAV.filter(item => item.key !== "home")
  ].filter(Boolean);
  return items.map(item => {
    const href = item.href === "/news" ? newsHref : withLang(item.href);
    const current = currentPath && (currentPath === href.replace(/\?lang=en$/, "") || currentPath === href) ? ' aria-current="page"' : "";
    return `<a href="${escapeHTML(href)}"${current}>${escapeHTML(l.en ? item.en : item.ar)}</a>`;
  }).join("");
}

const ARCHIVE_LANES = {
  all: { ar: "كل الأخبار", en: "All published", note: "عربي ودولي مختار", noteEn: "Arabic and vetted international" },
  arabic: { ar: "عربي", en: "Arabic", note: "أولوية المنصة", noteEn: "Platform priority" },
  world: { ar: "دولي مختار", en: "Vetted world", note: "مصادر دولية موثوقة وذات صلة", noteEn: "Trusted international sources with a regional link" }
};

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
  return {
    en, home: en ? "Newsroom" : "غرفة الأخبار", news: en ? "Published news" : "الأخبار المنشورة",
    source: en ? "Original source" : "المصدر الأصلي", published: en ? "Published" : "تاريخ النشر",
    author: en ? "By" : "الكاتب", correction: en ? "Published correction" : "تصحيح منشور",
    share: en ? "Share story" : "مشاركة الخبر", copy: en ? "Copy article link" : "نسخ رابط الخبر",
    original: en ? "Read at the original source" : "قراءة الخبر لدى المصدر الأصلي",
    missing: en ? "The original source link is unavailable." : "رابط المصدر الأصلي غير متوفر.",
    event: en ? "What happened?" : "ماذا حدث؟", known: en ? "What do we know?" : "ماذا نعرف؟",
    sourceQuestion: en ? "What is the source?" : "ما المصدر؟",
    impact: en ? "Why does it matter?" : "لماذا يهم؟", watch: en ? "What to watch next?" : "ما الذي نراقبه تالياً؟",
    details: en ? "Further details and references" : "تفاصيل إضافية ومراجع",
    reading: en ? "AI-assisted reading" : "قراءة مساعدة بالذكاء الاصطناعي",
    noSummary: en ? "No published summary is available here. See the source below." : "لا يتوفر ملخص منشور هنا. راجع المصدر أدناه.",
    aiNotice: en ? "AI-assisted context based on the available article text. It is not human verification, a prediction, or personal financial advice." : "سياق مساعد بالذكاء الاصطناعي مستند إلى نص الخبر المتاح؛ لا يُعد تحققاً بشرياً أو تنبؤاً أو نصيحة مالية شخصية.",
    disclosure: en ? "This page publishes a summary, not the full source story. Full reporting and subsequent updates remain with the attributed source." : "تنشر هذه الصفحة ملخصاً، لا النص الكامل للخبر لدى المصدر. التغطية الكاملة وتحديثاتها متاحة لدى المصدر المنسوب إليه الخبر.",
    related: en ? "Follow this story" : "تابع الموضوع",
    sections: en ? "Sections" : "الأقسام",
    editorial: en ? "From the WRLDLINE desk" : "من تحرير WRLDLINE",
    gate: en ? "Every story passes a publication gate before it appears: language, source standing, topic and a supported link to the region. Reaching the database is not enough to be published." : "لا يظهر الخبر لمجرد وصوله إلى قاعدة البيانات؛ تمر كل مادة ببوابة نشر تتحقق من اللغة ومكانة المصدر والموضوع وصلته المدعومة بالمنطقة.",
    more: en ? "More stories" : "المزيد من الأخبار",
    emptySection: en ? "No published story in this section yet. We do not pad sections with unrelated material." : "لا توجد مادة منشورة في هذا القسم بعد. لا نملأ الأقسام بمواد غير ذات صلة.",
    withdrawn: en ? "This story is no longer published" : "هذا الخبر لم يعد منشوراً",
    withdrawnBody: en ? "It did not pass, or no longer meets, our publication gate. The archive keeps the permanent record of what was published and corrected." : "لم يجتز بوابة النشر أو لم يعد مطابقاً لها. يحفظ الأرشيف سجل ما نُشر وصُحّح."
  };
}
/** @param {string} id */
function articleURL(id) { return `${PUBLIC_ORIGIN}/news/${id.toLowerCase()}`; }
/** @param {unknown} value @param {string} lang */
function dateLabel(value, lang) {
  const valid = iso(value);
  if (!valid) return "";
  return new Intl.DateTimeFormat(lang, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(valid)) + " UTC";
}
/** @param {unknown} value @param {string} lang @param {Date} now */
function relativeLabel(value, lang, now) {
  const valid = iso(value);
  if (!valid) return "";
  const diff = Date.parse(valid) - now.getTime();
  const minutes = Math.round(diff / 60000);
  const formatter = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 8) return formatter.format(days, "day");
  return dateLabel(valid, lang);
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
/** @param {PublicArticle} article */
function sectionOf(article) {
  return SECTION_BY_KEY.get(text(article.category, 60).toLowerCase()) || null;
}
/** @param {PublicArticle} article @param {string} lang */
function typeBadge(article, lang) {
  const l = labels(lang);
  const kind = text(article.content_type, 40).toLowerCase();
  const isOriginal = kind === "original" || text(article.source_name, 120) === "WRLDLINE NEWS";
  if (isOriginal) return `<span class="pn-badge pn-badge--original">${l.editorial}</span>`;
  if (article.audience_lane === "world") return `<span class="pn-badge pn-badge--world">${l.en ? "Vetted world" : "دولي مختار"}</span>`;
  return `<span class="pn-badge">${l.en ? "Attributed summary" : "ملخص منسوب"}</span>`;
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
  const key = confirmed ? "confirmed" : disputed ? "disputed" : "unconfirmed";
  const status = confirmed ? (l.en ? "Human editorial confirmation recorded" : "تأكيد تحريري بشري مسجل") : disputed ? (l.en ? "Disputed — consult the evidence and source" : "الخبر محل خلاف. راجع الأدلة والمصدر.") : (l.en ? "Human confirmation not established on this page" : "لم يُثبت تأكيد بشري في هذه الصفحة");
  const note = l.en ? "Breaking labels, AI analysis and source counts alone are not human verification." : "وسم العاجل وتحليل الذكاء الاصطناعي وأعداد المصادر وحدها ليست تحققاً بشرياً.";
  const translation = translated ? `<p data-translation-review="${humanTranslation ? "reviewed" : "unconfirmed"}">${humanTranslation ? (l.en ? "Human translation review recorded." : "مراجعة بشرية للترجمة مسجلة.") : (l.en ? "Human translation review is not established." : "لم تُثبت مراجعة بشرية للترجمة.")}</p>` : "";
  return `<div data-server-trust="${key}"><p><strong>${status}</strong></p><p data-trust-note>${note}</p>${translation}</div>`;
}

/* Arabic and English editions of the same Worker page. Only pages that actually
   render an English edition declare alternates: section pages and the news
   index. Article pages are Arabic-only by design (any query string on an
   article URL is 308-redirected to the clean canonical), so declaring an
   English alternate there would advertise a URL that redirects straight back —
   worse for search engines than declaring nothing. */
/** @param {string} target canonical path, optionally with a query string */
function alternates(target) {
  const base = target.split("?")[0];
  const query = target.includes("?") ? target.slice(target.indexOf("?")) : "";
  const en = `${base}${query ? `${query}&lang=en` : "?lang=en"}`;
  return `<link rel="alternate" hreflang="ar" href="${escapeHTML(base + query)}">`
    + `<link rel="alternate" hreflang="en" href="${escapeHTML(en)}">`
    + `<link rel="alternate" hreflang="x-default" href="${escapeHTML(base + query)}">`;
}

/** @param {PageOptions} options */
function shell({ title, description, canonical, alternatesFor = "", lang = "ar", image = "", body, schema = null, noindex = false, enhance = false, currentPath = "" }) {
  const l = labels(lang), direction = l.en ? "ltr" : "rtl";
  // Nonce permits JSON-LD, while executable scripts must be same-origin files.
  const nonce = schema ? crypto.randomUUID().replace(/-/g, "") : "";
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0d1a2b"><title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(description)}"><meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large"}">
${canonical ? `<link rel="canonical" href="${escapeHTML(canonical)}">` : ""}${!noindex && alternatesFor ? alternates(alternatesFor) : ""}
<meta property="og:type" content="${schema ? "article" : "website"}"><meta property="og:site_name" content="WRLDLINE NEWS">
<meta property="og:locale" content="${l.en ? "en_US" : "ar_SA"}"><meta property="og:title" content="${escapeHTML(title)}"><meta property="og:description" content="${escapeHTML(description)}">
${canonical ? `<meta property="og:url" content="${escapeHTML(canonical)}">` : ""}
${image ? `<meta property="og:image" content="${escapeHTML(image)}"><meta name="twitter:image" content="${escapeHTML(image)}">` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}"><meta name="twitter:title" content="${escapeHTML(title)}"><meta name="twitter:description" content="${escapeHTML(description)}">
${schema ? `<meta property="article:published_time" content="${escapeHTML(schema.datePublished)}"><script nonce="${nonce}" type="application/ld+json">${jsonLD(schema)}</script>` : ""}
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/wrld.css?v=20261123-gate1"><link rel="stylesheet" href="/public-news.css?v=20261123-reading-order"><link rel="stylesheet" href="/quality.css?v=quality-1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Kufi+Arabic:wght@500;700&family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<link rel="alternate" type="application/rss+xml" title="WRLDLINE NEWS RSS" href="${PUBLIC_ORIGIN}/rss.xml"><link rel="alternate" type="application/atom+xml" title="WRLDLINE NEWS Atom" href="${PUBLIC_ORIGIN}/atom.xml">
${!noindex ? '<script src="/analytics-config.js?v=20261115-1" defer></script><script src="/analytics.js?v=20261115-1" defer></script>' : ""}
${!noindex ? '<script src="/site-editor.js?v=20261123-live-breaking" defer></script>' : ""}
${enhance ? '<link rel="stylesheet" href="/article-trust.css?v=20261125-upd"><script src="/share.js?v=20261115-canonical" defer></script><script src="/public-news.js?v=20261123-reading-order" defer></script><script src="/article-trust.js?v=20261125-upd" defer></script>' : ""}`;
  const html = `<!doctype html><html lang="${escapeHTML(lang)}" dir="${direction}" data-theme="dark"><head>${head}</head><body class="wl-public-news">
<a class="skip-link" href="#mainContent">${l.en ? "Skip to content" : "تجاوز إلى المحتوى"}</a>
<header class="wl-header public-news-header"><div class="wl-container wl-masthead"><a class="wl-brand" href="/" aria-label="WRLDLINE NEWS"><span class="wl-brand-mark" aria-hidden="true">W</span><span class="wl-brand-copy"><strong>WRLDLINE</strong><small>GLOBAL NEWS NETWORK</small></span></a><a class="wl-account" href="/account.html">${l.en ? "My account" : "حسابي"}</a></div>
<nav class="wl-container public-news-nav" aria-label="${l.en ? "News navigation" : "تصفح الأخبار"}">${registryNav(l, currentPath)}</nav></header>
<main class="public-news-main" id="mainContent">${body}</main>
<footer class="public-news-footer"><div class="wl-container"><p class="pn-gate-note">${l.gate}</p>WRLDLINE NEWS · <a href="/about.html">${l.en ? "Editorial policy" : "السياسة التحريرية"}</a> · <a href="/corrections.html">${l.en ? "Corrections" : "التصحيحات"}</a> · <a href="/rss.xml">RSS</a> · <a href="/atom.xml">Atom</a></div></footer></body></html>`;
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
    // No API surface here needs device sensors, camera, microphone or geolocation.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    // Keep article pages out of other sites' window references and cross-origin reads.
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": `default-src 'self'; script-src 'self' https://static.cloudflareinsights.com${nonce ? ` 'nonce-${nonce}'` : ""}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: http: data: blob:; connect-src 'self' https://vmaxbnogmmfyrcucapnq.supabase.co https://cloudflareinsights.com; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'`,
    ...(status !== 200 ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
    ...(status === 503 ? { "Retry-After": "60" } : {})
  } });
}
/** @param {number} status */
function errorPage(status) {
  const l = labels("ar");
  if (status === 410) {
    return htmlResponse({ title: `${l.withdrawn} | WRLDLINE`, description: l.withdrawnBody, noindex: true, body: `<p class="public-news-kicker">WRLDLINE · PUBLIC NEWS</p><h1>${l.withdrawn}</h1><p class="public-news-summary">${l.withdrawnBody}</p><p><a href="/news/">${l.news}</a> · <a href="/about.html">${l.en ? "Editorial policy" : "السياسة التحريرية"}</a></p>` }, 410);
  }
  const missing = status === 404;
  return htmlResponse({ title: missing ? "الخبر غير متوفر | WRLDLINE" : "الأخبار غير متاحة مؤقتاً | WRLDLINE", description: missing ? "لم نعثر على خبر منشور في هذا الرابط." : "تعذر تحميل الخبر الآن. يرجى المحاولة لاحقاً.", noindex: true, body: `<h1>${missing ? "الخبر غير متوفر" : "الأخبار غير متاحة مؤقتاً"}</h1><p class="public-news-summary">${missing ? "قد يكون الرابط غير صحيح أو الخبر غير منشور." : "تعذر تحميل الخبر الآن. يرجى المحاولة لاحقاً."}</p><a href="/news/">العودة إلى الأخبار المنشورة</a>` }, status);
}
/** @param {string} body @param {string} [type] */
function xmlResponse(body, type = "application/xml") {
  return new Response(XML_HEAD + body, { headers: { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

/** @param {PublicArticle[]} related @param {string} lang */
function relatedBlock(related, lang) {
  const l = labels(lang);
  if (!related.length) return "";
  const items = related.map(item => `<li><a href="${articleURL(item.id)}">${escapeHTML(text(item.title, 200))}</a><small>${escapeHTML(relativeLabel(item.published_at, lang, new Date()))}${text(item.source_name, 80) ? ` · ${escapeHTML(text(item.source_name, 80))}` : ""}</small></li>`).join("");
  return `<section class="pn-related"><h2>${l.related}</h2><ul>${items}</ul></section>`;
}

/** Keep in step with the progressive reader in reader-prose.js. @param {string} value */
export function splitLead(value) {
  const body = String(value ?? "").replace(/\r\n?/g, "\n").trim();
  const heading = /^#{2,4}\s+(.+)$/u, bullet = /^[•●▪]\s+(.+)$/u;
  let start = 0;
  for (const match of body.matchAll(/[^\n]+/gu)) {
    const line = match[0].trim();
    if (!line || heading.test(line)) continue;
    start = match.index;
    break;
  }
  const first = body.slice(start).match(/^[^\n]*/u)?.[0] || "";
  let end = start + first.length;
  if (first.length > 560 && !bullet.test(first.trim()) && !heading.test(first.trim())) {
    const stop = [...first.matchAll(/[.!?؟]\s+(?=\S)/gu)].find(match => match.index >= 140 && match.index < 520);
    if (stop) end = start + stop.index + 1;
  }
  return { lead: body.slice(0, end).trim(), details: body.slice(end).trim() };
}

/** @param {PublicArticle} article @param {Date} now @param {Record<string, unknown> | null} [trust] @param {PublicArticle[]} [related] */
export function renderArticle(article, now, trust = null, related = []) {
  const lang = language(article.lang || article.source_language), l = labels(lang);
  const title = text(article.title, 1000) || (l.en ? "Published news" : "خبر منشور");
  const summary = text(article.summary), description = (summary || title).replace(/\s+/g, " ").slice(0, 160);
  const canonical = articleURL(article.id), image = safeURL(article.image_url), original = source(article), by = authors(article.author);
  const section = sectionOf(article);
  const rawCategory = text(article.category, 120);
  // "uncategorized" is a database placeholder, not a section a reader can visit.
  const sectionLabel = section ? (l.en ? section.en : section.ar) : (/^(?:uncategorized|unknown|other|غير مصنف)$/iu.test(rawCategory) ? "" : rawCategory);
  const isOriginal = text(article.content_type, 40).toLowerCase() === "original" || text(article.source_name, 120) === "WRLDLINE NEWS";
  /** @type {Record<string, unknown>} */
  const schema = {
    "@context": "https://schema.org", "@type": "NewsArticle", "@id": `${canonical}#article`,
    url: canonical, mainEntityOfPage: { "@type": "WebPage", "@id": `${canonical}#webpage` },
    headline: title, description, inLanguage: lang,
    datePublished: article.published_at,
    isAccessibleForFree: true,
    publisher: {
      "@type": "Organization", name: "WRLDLINE NEWS", url: PUBLIC_ORIGIN,
      // Google needs the publisher mark to be a real, sized image, not just a URL.
      logo: { "@type": "ImageObject", url: `${PUBLIC_ORIGIN}/assets/brand/wrldline-symbol.png`, width: 499, height: 233 }
    }
  };
  if (summary) schema.articleBody = summary;
  if (image) schema.image = [image];
  // An aggregated summary is authored by the desk that selected and attributed it,
  // never by the source newsroom.
  schema.author = by.length
    ? by.map(name => ({ "@type": "Person", name }))
    : [{ "@type": "Organization", name: isOriginal ? "WRLDLINE NEWS" : "WRLDLINE NEWS editorial desk" }];
  const updated = modified(article, now);
  // dateModified is required for article rich results; an untouched story simply
  // reports its publication time rather than omitting the field.
  schema.dateModified = updated;
  if (original.url && !isOriginal) schema.isBasedOn = original.url;
  if (sectionLabel) schema.articleSection = sectionLabel;
  const country = text(article.country, 120);
  const keywords = [sectionLabel, country].filter(Boolean);
  if (keywords.length) schema.keywords = keywords.join(", ");
  const trail = [{ "@type": "ListItem", position: 1, name: l.en ? "Home" : "الرئيسية", item: `${PUBLIC_ORIGIN}/` }];
  if (section && sectionLabel) trail.push({ "@type": "ListItem", position: 2, name: sectionLabel, item: `${PUBLIC_ORIGIN}/section/${section.slug}` });
  trail.push({ "@type": "ListItem", position: trail.length + 1, name: title, item: canonical });
  schema.breadcrumb = { "@type": "BreadcrumbList", itemListElement: trail };
  const correction = text(article.correction_note, 4000);
  const { lead, details } = splitLead(summary);
  const readingSummary = text(article.ai_summary, 1200), impact = text(article.ai_reader_impact, 900), watch = text(article.ai_watch_next, 900);
  const paragraphs = (/** @type {string} */ value) => {
    const blocks = [];
    let list = [];
    const flush = () => { if (list.length) blocks.push(`<ul>${list.join("")}</ul>`); list = []; };
    for (const row of value.split("\n")) {
      const line = row.trim();
      if (!line) continue;
      const item = line.match(/^[•●▪]\s+(.+)$/u);
      if (item) { list.push(`<li dir="auto">${escapeHTML(item[1])}</li>`); continue; }
      flush();
      const heading = line.match(/^#{2,4}\s+(.+)$/u);
      blocks.push(heading ? `<h3 dir="auto">${escapeHTML(heading[1])}</h3>` : `<p dir="auto">${escapeHTML(line)}</p>`);
    }
    flush();
    return blocks.join("");
  };
  const reportedCountry = text(article.event_country, 120);
  const eventCountry = /^(?:دولي|غير محدد|unknown|international|world)$/iu.test(reportedCountry) ? "" : reportedCountry;
  const shareUrl = encodeURIComponent(canonical);
  const shareTitle = encodeURIComponent(title);
  const shareCaption = encodeURIComponent(`${title} — ${description}`);
  const socialShare = `<div class="public-news-social" aria-label="${l.en ? "Share on social networks" : "مشاركة عبر الشبكات"}"><a href="https://wa.me/?text=${shareCaption}%20${shareUrl}" target="_blank" rel="noopener noreferrer">WhatsApp</a><a href="https://twitter.com/intent/tweet?text=${shareTitle}&url=${shareUrl}" target="_blank" rel="noopener noreferrer">X</a><a href="https://t.me/share/url?url=${shareUrl}&text=${shareTitle}" target="_blank" rel="noopener noreferrer">Telegram</a></div>`;
  const breadcrumb = section
    ? `<a href="/news/">${l.news}</a> / <a href="/section/${section.slug}">${escapeHTML(sectionLabel)}</a>`
    : sectionLabel
      ? `<a href="/news/">${l.news}</a> / ${escapeHTML(sectionLabel)}`
      : `<a href="/news/">${l.news}</a>`;
  const body = `<nav class="public-news-breadcrumb" aria-label="${l.en ? "Breadcrumb" : "مسار الصفحة"}">${breadcrumb}</nav>
<article data-public-article data-audience-article data-article-id="${article.id}" data-category="${escapeHTML(text(article.category, 120))}" data-share-title="${escapeHTML(title)}" data-share-text="${escapeHTML(description)}" data-share-source="${escapeHTML(original.name)}" data-share-image="${escapeHTML(image)}" data-share-url="${canonical}">
<p class="public-news-kicker">${typeBadge(article, lang)}<span data-kicker-label data-kicker-country="${escapeHTML(eventCountry)}">${escapeHTML([sectionLabel, eventCountry].filter(Boolean).join(" · "))}</span></p>
<h1>${escapeHTML(title)}</h1><div class="public-news-meta"><span>${l.published}: <time datetime="${article.published_at}" title="${escapeHTML(dateLabel(article.published_at, lang))}">${escapeHTML(relativeLabel(article.published_at, lang, now))}</time></span>${by.length ? `<span>${l.author}: ${escapeHTML(by.join(" · "))}</span>` : ""}${original.name && !isOriginal ? `<span>${l.source}: ${escapeHTML(original.name)}</span>` : ""}${updated !== article.published_at ? `<span>${l.en ? "Updated" : "آخر تحديث"}: ${escapeHTML(dateLabel(updated, lang))}</span>` : ""}</div>
<section class="pn-reading-step" data-reader-step="event"><h2>${l.event}</h2><div class="public-news-summary" data-reading-lead>${paragraphs(lead)}</div><p data-reading-missing${lead ? " hidden" : ""}>${l.noSummary}</p></section>
<section class="pn-reading-step" data-reader-step="known"><h2>${l.known}</h2>${trustSummary(article, trust, lang, now)}
${correction ? `<aside class="public-news-correction" role="note"><h3>${l.correction}</h3><p>${escapeHTML(correction)}</p>${iso(article.corrected_at) ? `<time datetime="${escapeHTML(iso(article.corrected_at))}">${escapeHTML(dateLabel(article.corrected_at, lang))}</time>` : ""}</aside>` : ""}</section>
<section class="pn-reading-step public-news-source" data-reader-step="source" data-primary-source="${isOriginal}"><h2>${l.sourceQuestion}</h2>${original.name ? `<p dir="auto">${escapeHTML(original.name)}</p>` : ""}${original.url ? `<a href="${escapeHTML(original.url)}" target="_blank" rel="noopener noreferrer">${isOriginal ? (l.en ? "Open the primary source" : "فتح المصدر الأولي") : l.original} ↗</a>` : `<p data-source-missing>${l.missing}</p>`}</section>
${impact ? `<section class="pn-reading-step pn-reading-context" data-reader-step="impact"><h2>${l.impact}</h2><p dir="auto">${escapeHTML(impact)}</p><small data-ai-notice>${l.aiNotice}</small></section>` : ""}
${watch ? `<section class="pn-reading-step pn-reading-context" data-reader-step="watch"><h2>${l.watch}</h2><p dir="auto">${escapeHTML(watch)}</p><small data-ai-notice>${l.aiNotice}</small></section>` : ""}
<section class="pn-reading-step" data-reader-step="details"><h2>${l.details}</h2>
<div class="public-news-summary" data-reading-body>${paragraphs(details)}</div>
${image ? `<figure class="public-news-image"><img src="${escapeHTML(image)}" alt="${escapeHTML(title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></figure>` : ""}
${readingSummary ? `<aside class="pn-reading-context"><h3 data-ai-reading>${l.reading}</h3><p dir="auto">${escapeHTML(readingSummary)}</p><small data-ai-notice>${l.aiNotice}</small></aside>` : ""}
<p class="public-news-disclosure">${isOriginal ? (l.en ? "Published by the WRLDLINE newsroom." : "نشرته هيئة تحرير WRLDLINE.") : l.disclosure}</p>
<details class="pn-reading-evidence"><summary>${l.en ? "Verification record and references" : "سجل التحقق وروابط الأدلة"}</summary><div id="articleTrust" data-article-id="${article.id}"></div><noscript><p>${l.en ? "See the original source above for the documents and links available without JavaScript." : "راجع المصدر أعلاه للاطلاع على الروابط والوثائق المتاحة دون جافاسكريبت."}</p></noscript></details></section>
<div class="public-news-actions"><button type="button" id="publicNewsShare">${l.share}</button><button type="button" id="publicNewsCopy">${l.copy}</button><a href="${canonical}">${l.en ? "Permanent article link" : "الرابط الدائم للخبر"}</a></div>${socialShare}<span class="public-news-status" id="publicNewsStatus" role="status" aria-live="polite"></span>
<noscript><p class="public-news-disclosure">${l.en ? "This published summary and source link are available without JavaScript." : "الملخص المنشور ورابط المصدر متاحان دون جافاسكريبت."}</p></noscript></article>
${relatedBlock(related, lang)}`;
  return htmlResponse({ title: `${title} | WRLDLINE NEWS`, description, canonical, lang, image, body, schema, enhance: true, currentPath: section ? `/section/${section.slug}` : "" });
}

/** @param {PublicArticle} article @param {string} lang @param {Date} now */
function feedItem(article, lang, now) {
  const s = source(article), originalLang = language(article.source_language || article.lang);
  const section = sectionOf(article);
  const sectionLabel = section ? section.ar : "";
  const excerpt = text(article.summary).replace(/^[ \t]*(?:#{2,4}|[•●▪])[ \t]+/gmu, "").replace(/\s+/gu, " ").trim().slice(0, 220);
  // The hash carries the reader's edition preference to the article page; it is
  // never sent to the server, so it cannot affect canonicalisation.
  const link = articleURL(article.id) + (lang === "en" ? "#lang=en" : "");
  return `<li class="pn-card"><article data-site-editor-row="${escapeHTML(article.id)}"><p class="pn-card-top">${typeBadge(article, lang)}${sectionLabel ? `<a class="pn-card-section" href="/section/${section.slug}">${escapeHTML(sectionLabel)}</a>` : ""}</p><h2><a href="${link}" lang="${originalLang}" dir="auto">${escapeHTML(text(article.title, 1000) || labels(lang).news)}</a></h2><p class="pn-card-summary" lang="${originalLang}" dir="auto">${escapeHTML(excerpt)}</p><p class="pn-card-meta"><span>${escapeHTML(s.name || (lang === "en" ? "Source unavailable" : "المصدر غير متاح"))}</span><time datetime="${article.published_at}" title="${escapeHTML(dateLabel(article.published_at, lang))}">${escapeHTML(relativeLabel(article.published_at, lang, now))}</time></p></article></li>`;
}

/** @param {PublicArticle[]} articles @param {number} page @param {string} lang @param {string} lane @param {Date} now */
function renderIndex(articles, page, lang, lane, now) {
  const shown = articles.slice(0, 50);
  const l = labels(lang);
  /** @param {number} p @param {string} edition @param {string} targetLane */
  function pageURL(p, edition, targetLane) {
    const query = new URLSearchParams();
    if (p > 1) query.set("page", String(p));
    if (edition !== "ar") query.set("lang", edition);
    if (targetLane !== "all") query.set("lane", targetLane);
    const qs = query.toString();
    return "/news/" + (qs ? `?${qs}` : "");
  }
  // The Arabic edition is canonical for a given page and lane; ?lang=en is a
  // reading edition of the same stories, not a separate document.
  const canonical = `${PUBLIC_ORIGIN}${pageURL(page, "ar", lane)}`;
  const description = l.en
    ? "Browse published WRLDLINE news. Every story passes a publication gate on language, source standing, topic and a supported regional link before it appears."
    : "تصفّح الأخبار المنشورة في WRLDLINE. لا يظهر أي خبر قبل أن يجتاز بوابة نشر تتحقق من اللغة ومكانة المصدر والموضوع وصلته المدعومة بالمنطقة.";
  const tabs = Object.entries(ARCHIVE_LANES).map(([key, value]) => `<a href="${escapeHTML(pageURL(1, lang === "en" ? "en" : "ar", key))}"${key === lane ? ' aria-current="page"' : ""}>${l.en ? value.en : value.ar}</a>`).join("");
  const body = `<p class="public-news-kicker">WRLDLINE · PUBLIC NEWS</p><h1>${l.news}</h1>
<a class="public-news-edition-link" href="${escapeHTML(pageURL(page, lang === "en" ? "ar" : "en", lane))}" lang="${lang === "en" ? "ar" : "en"}">${l.en ? "العربية" : "English"}</a>
<nav class="pn-tabs" aria-label="${l.en ? "Publication lanes" : "مسارات النشر"}">${tabs}</nav>
<p class="public-news-disclosure">${description}</p>
<ul class="public-news-list pn-card-list">${shown.map(a => feedItem(a, lang, now)).join("")}</ul>
${!shown.length ? `<p class="public-news-summary">${l.en ? "No published news on this page." : "لا توجد أخبار منشورة في هذه الصفحة."}</p>` : ""}
<nav class="public-news-paging" aria-label="${l.en ? "News pages" : "صفحات الأخبار"}">${page > 1 ? `<a href="${escapeHTML(pageURL(page - 1, lang, lane))}">${l.en ? "Previous page" : "الصفحة السابقة"}</a>` : "<span></span>"}${articles.length > 50 ? `<a href="${escapeHTML(pageURL(page + 1, lang, lane))}">${l.en ? "Next page" : "الصفحة التالية"}</a>` : ""}</nav>`;
  return htmlResponse({ title: `${l.news}${page > 1 ? ` · ${page}` : ""} | WRLDLINE NEWS`, description, canonical, alternatesFor: `${PUBLIC_ORIGIN}${pageURL(page, "ar", lane)}`, body, lang, currentPath: "/news/" });
}

/** @param {Record<string, unknown>} section @param {PublicArticle[]} articles @param {string} lang @param {Date} now */
function renderSection(section, articles, lang, now) {
  const l = labels(lang), title = l.en ? section.en : section.ar, intro = l.en ? section.introEn : section.intro;
  const canonical = `${PUBLIC_ORIGIN}/section/${section.slug}`;
  const description = `${intro}`.slice(0, 158);
  const parent = section.parent ? SECTION_BY_KEY.get(section.parent) : null;
  const parentLine = parent
    ? `<p class="pn-section-parent">${l.en ? "Part of" : "ضمن"} <a href="/section/${parent.slug}${l.en ? "?lang=en" : ""}">${escapeHTML(l.en ? parent.en : parent.ar)}</a></p>`
    : "";
  const body = `<p class="public-news-kicker">WRLDLINE · ${l.sections.toUpperCase()}</p>
${parentLine}<h1>${escapeHTML(title)}</h1><p class="pn-section-intro">${escapeHTML(intro)}</p>
<p class="public-news-disclosure">${l.gate}</p>
<ul class="public-news-list pn-card-list">${articles.map(a => feedItem(a, lang, now)).join("")}</ul>
${!articles.length ? `<p class="public-news-summary">${l.emptySection}</p>` : ""}
${section.slug === "rights" ? `<section class="pn-rights-files" aria-labelledby="rightsFilesHeading"><h2 id="rightsFilesHeading">${l.en ? "Rights files and library" : "ملفات ومكتبة الحقوق والحريات"}</h2><p>${l.en ? "Reference case files and the rights guide sit with the news in one place." : "الملفات المرجعية ودليل الحقوق مع أخبار الحقوق في مكان واحد."}</p><nav class="pn-tabs"><a href="/rights-cases/index.html">${l.en ? "Case files" : "ملفات القضايا"}</a><a href="/rights.html#rightsGuides">${l.en ? "Rights guide" : "دليل الحقوق"}</a><a href="/rights.html">${l.en ? "Rights desk" : "مكتب الحقوق والحريات"}</a></nav></section>` : ""}
<nav class="public-news-paging" aria-label="${l.more}"><a href="/news/">${l.news}</a><a href="/">${l.home}</a></nav>`;
  return htmlResponse({ title: `${title} | WRLDLINE NEWS`, description, canonical, alternatesFor: canonical, body, lang, currentPath: `/section/${section.slug}` });
}

/** @param {PublicArticle[]} articles @param {Date} now */
function newsSitemap(articles, now) {
  const since = now.getTime() - 48 * 60 * 60 * 1000;
  const recent = articles.filter(a => Date.parse(a.published_at) >= since && Date.parse(a.published_at) <= now.getTime()).slice(0, 1000);
  return xmlResponse(`<urlset ${SITEMAP_NS} xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${recent.map(a => `<url><loc>${articleURL(a.id)}</loc><news:news><news:publication><news:name>WRLDLINE NEWS</news:name><news:language>${escapeHTML(language(a.lang || a.source_language).split("-")[0])}</news:language></news:publication><news:publication_date>${a.published_at}</news:publication_date><news:title>${escapeHTML(text(a.title, 1000))}</news:title></news:news></url>`).join("")}</urlset>`);
}
/** @param {PublicArticle[]} articles @param {Date} now */
function rss(articles, now) {
  return xmlResponse(`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>WRLDLINE NEWS</title><link>${PUBLIC_ORIGIN}/news/</link><language>ar</language><description>ملخصات الأخبار المنشورة وروابط مصادرها الأصلية — WRLDLINE NEWS</description><atom:link href="${PUBLIC_ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>${articles.length ? `<lastBuildDate>${new Date(articles[0].published_at).toUTCString()}</lastBuildDate>` : ""}${articles.map(a => { const s = source(a), section = sectionOf(a); return `<item><title>${escapeHTML(text(a.title, 1000))}</title><link>${articleURL(a.id)}</link><guid isPermaLink="true">${articleURL(a.id)}</guid><description>${escapeHTML(text(a.summary))}</description><pubDate>${new Date(a.published_at).toUTCString()}</pubDate>${section ? `<category>${escapeHTML(section.ar)}</category>` : ""}${s.url ? `<source url="${escapeHTML(s.url)}">${escapeHTML(s.name || new URL(s.url).hostname)}</source>` : ""}</item>`; }).join("")}</channel></rss>`, "application/rss+xml");
}
/** @param {PublicArticle[]} articles @param {Date} now */
function atom(articles, now) {
  const latest = articles.map(a => modified(a, now)).sort().at(-1) || now.toISOString();
  return xmlResponse(`<feed xmlns="http://www.w3.org/2005/Atom"><id>${PUBLIC_ORIGIN}/atom.xml</id><title>WRLDLINE NEWS</title><subtitle>ملخصات الأخبار المنشورة</subtitle><updated>${latest}</updated><author><name>WRLDLINE NEWS</name><uri>${PUBLIC_ORIGIN}</uri></author><link href="${PUBLIC_ORIGIN}/atom.xml" rel="self" type="application/atom+xml"/><link href="${PUBLIC_ORIGIN}/news/" rel="alternate"/>${articles.map(a => { const s = source(a), by = authors(a.author); return `<entry><id>${articleURL(a.id)}</id><title type="text">${escapeHTML(text(a.title, 1000))}</title><link href="${articleURL(a.id)}" rel="alternate"/><published>${a.published_at}</published><updated>${modified(a, now)}</updated><summary type="text">${escapeHTML(text(a.summary))}</summary>${by.map(name => `<author><name>${escapeHTML(name)}</name></author>`).join("")}${s.name ? `<contributor><name>${escapeHTML(s.name)}</name></contributor>` : ""}${s.url ? `<link href="${escapeHTML(s.url)}" rel="related" title="Original source"/>` : ""}</entry>`; }).join("")}</feed>`, "application/atom+xml");
}

/* Routes this Worker owns on the production host. Every other path is proxied
   to the origin (GitHub Pages) untouched, so the Worker can never shadow a
   static page — see tests/deploy-config.test.js. */
export const OWNED_ROUTES = [
  "/news",
  "/news/*",
  "/section/*",
  "/news-sitemap.xml*",
  "/article-sitemap*",
  "/rss.xml*",
  "/atom.xml*",
  "/__version"
];

/* The deployment identity is injected by the deploy workflow as plain vars
   (`--var GIT_COMMIT:<sha> --var DEPLOYED_AT:<iso>`). Nothing is guessed: an
   unconfigured deploy reports "unknown" instead of borrowing a commit it was
   not built from. */
/** @param {WorkerEnv} env @param {Date} [now] */
export function deploymentInfo(env = {}, now = new Date()) {
  const rawCommit = text(env.GIT_COMMIT, 64).toLowerCase();
  const commit = /^[0-9a-f]{7,40}$/.test(rawCommit) ? rawCommit : "unknown";
  const deployedAt = iso(env.DEPLOYED_AT) || "unknown";
  const environment = text(env.ENVIRONMENT, 40).toLowerCase() || "unknown";
  return {
    service: text(env.WORKER_SERVICE, 80) || "wrldline-public",
    environment,
    commit,
    deployed_at: deployedAt,
    reported_at: now.toISOString(),
    routes: OWNED_ROUTES.slice()
  };
}

/** @param {Request} request @param {WorkerEnv} env */
function versionResponse(request, env) {
  const info = deploymentInfo(env);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
    "X-Wrldline-Commit": info.commit,
    "X-Wrldline-Environment": info.environment,
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*"
  };
  return new Response(request.method === "HEAD" ? null : JSON.stringify(info, null, 2), { status: 200, headers });
}

/** @param {{fetchImpl?: typeof fetch, now?: () => Date}} [options] */
export function createWorker({ fetchImpl = globalThis.fetch.bind(globalThis), now = () => new Date() } = {}) {
  return {
  /** @param {Request} request @param {WorkerEnv} env */
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    // Version reporting is answered from configuration only: no database call,
    // no cache, no session, so it stays truthful even during a backend outage.
    if (path === "/__version" || path === "/__version.json") {
      if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
      return versionResponse(request, env);
    }
    const owned = path === "/news" || path.startsWith("/news/") || path.startsWith("/section/") || path.startsWith("/news-sitemap.xml") || path.startsWith("/article-sitemap") || path.startsWith("/rss.xml") || path.startsWith("/atom.xml");
    // Defensive origin preservation if an overbroad Cloudflare route is accidentally installed.
    if (!owned) return fetchImpl(request);
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
    const startedAt = Date.now();
    /** @type {string[]} */
    const rpcTimings = [];
    // One exit point for owned routes: HEAD gets headers only, and every
    // response carries the server-side duration so slow pages can be diagnosed
    // without exposing backend details.
    const finish = /** @param {Response} response */ response => {
      const headers = new Headers(response.headers);
      headers.set("Server-Timing", [`wrldline;dur=${Date.now() - startedAt}`, ...rpcTimings].join(", "));
      // Every generated page names the bundle that produced it, so a reader (or
      // a support ticket) can prove which deploy is live.
      headers.set("X-Wrldline-Commit", deploymentInfo(env).commit);
      return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers });
    };
    const clock = now(), deadline = Date.now() + 20000;
    /** @param {string} name @param {Record<string, unknown>} args @param {number} maxRows @param {boolean} [scalar] @returns {Promise<any>} */
    async function rpc(name, args, maxRows, scalar = false) {
      const rpcStarted = Date.now();
      try {
        return await rpcCall(name, args, maxRows, scalar);
      } finally {
        rpcTimings.push(`${name.replace(/^public_/, "")};dur=${Date.now() - rpcStarted}`);
      }
    }
    /** @param {string} name @param {Record<string, unknown>} args @param {number} maxRows @param {boolean} scalar @returns {Promise<any>} */
    async function rpcCall(name, args, maxRows, scalar) {
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
    // Narrow projection (no full article bodies) so a 50-item page stays small
    // on mobile and the query can use the lane index.
    /** @param {number} limit @param {number} offset @param {string} lane @returns {Promise<PublicArticle[]>} */
    async function listFeed(limit, offset, lane) {
      /** @type {Record<string, unknown>[]} */
      const rows = await rpc("public_news_list", { p_limit: limit, p_before: clock.toISOString(), p_since: null, p_offset: offset, p_lane: lane }, limit);
      return rows.map(row => projectArticle(row, clock)).filter(/** @returns {a is PublicArticle} */ a => Boolean(a)).sort((a, b) => b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id));
    }
    try {
      if (path === "/news") return finish(new Response(null, { status: 308, headers: { Location: `${PUBLIC_ORIGIN}/news/${url.search}`, "Cache-Control": "no-store" } }));

      const sectionMatch = path.match(/^\/section\/([a-z-]{2,30})\/?$/);
      if (sectionMatch) {
        // Slugs readers and other sites already guess or link to. They resolve to
        // the section that actually covers the subject instead of a 404.
        const section = SECTION_BY_SLUG.get(sectionMatch[1]) || SECTION_BY_SLUG.get(SECTION_ALIASES.get(sectionMatch[1]) || "");
        if (!section) return finish(errorPage(404));
        if (path !== `/section/${section.slug}`) return finish(new Response(null, { status: 308, headers: { Location: `${PUBLIC_ORIGIN}/section/${section.slug}`, "Cache-Control": "no-store" } }));
        /** @type {Record<string, unknown>[]} */
        const rows = await rpc("public_section_feed", { p_category: section.key, p_limit: 30, p_before: clock.toISOString(), p_offset: 0 }, 30);
        const articles = rows.map(row => projectArticle(row, clock)).filter(/** @returns {a is PublicArticle} */ a => Boolean(a)).sort((a, b) => b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id));
        return finish(renderSection(section, articles, url.searchParams.get("lang") === "en" ? "en" : "ar", clock));
      }

      if (path === "/news/") {
        const value = url.searchParams.get("page") || "1";
        if (!/^[1-9]\d{0,5}$/.test(value) || Number(value) > 50000) return finish(errorPage(404));
        const laneParam = url.searchParams.get("lane") || "all";
        if (!Object.hasOwn(ARCHIVE_LANES, laneParam)) return finish(errorPage(404));
        const page = Number(value), lang = url.searchParams.get("lang") === "en" ? "en" : "ar";
        const articles = await listFeed(51, (page - 1) * 50, laneParam);
        if (page > 1 && !articles.length) return finish(errorPage(404));
        return finish(renderIndex(articles, page, lang, laneParam, clock));
      }

      if (path.startsWith("/news/")) {
        const match = path.match(/^\/news\/([^/]+)(\/?)$/);
        if (!match || !UUID.test(match[1])) return finish(errorPage(404));
        const id = match[1].toLowerCase();
        const rows = await rpc("public_news_article", { p_id: id }, 1);
        const article = rows.length ? projectArticle(rows[0], clock) : null;
        if (!article || article.id !== id) return finish(errorPage(404));
        // A withdrawn story must stop being indexable and stop being served.
        if (article.audience_lane === "excluded" || article.audience_lane === "leisure") return finish(errorPage(410));
        if (match[2] || match[1] !== id || url.search) return finish(new Response(null, { status: 308, headers: { Location: articleURL(id), "Cache-Control": "no-store" } }));
        // The three optional panels are independent: fetch them together so the
        // reader waits once, not three times. Each may fail without taking the
        // published summary down with it.
        const trustPromise = env.PUBLIC_TRUST_ENABLED === "true"
          ? rpc("get_public_article_trust", { p_article_id: id, p_lang: language(article.lang) }, 1, true).catch(() => null)
          : Promise.resolve(null);
        const intelligencePromise = rpc("public_news_article_intelligence", { p_id: id }, 1)
          .then(/** @param {Record<string, unknown>[]} rows */ rows => (rows[0] && rows[0].id === id ? rows[0] : null))
          .catch(() => null);
        const relatedPromise = rpc("public_related_articles", { p_id: id, p_limit: 4 }, 4)
          .then(/** @param {Record<string, unknown>[]} rows */ rows => rows.map(row => projectArticle(row, clock)).filter(/** @returns {a is PublicArticle} */ a => Boolean(a && a.id !== id)))
          .catch(() => []);
        const [trust, intelligence, related] = await Promise.all([trustPromise, intelligencePromise, relatedPromise]);
        return finish(renderArticle(intelligence ? { ...article, ...intelligence } : article, clock, trust, related));
      }
      if (path === "/news-sitemap.xml") {
        // Dedicated projection: 1000 identifiers without article bodies. Asking
        // public_news_recent for 1000 full rows used to exceed the statement
        // timeout and returned 503 to crawlers.
        /** @type {Record<string, unknown>[]} */
        const rows = await rpc("public_news_sitemap_recent", { p_hours: 48, p_limit: 1000 }, 1000);
        const recentArticles = rows.map(row => projectArticle(row, clock)).filter(/** @returns {a is PublicArticle} */ a => Boolean(a));
        return finish(newsSitemap(recentArticles, clock));
      }
      if (path === "/rss.xml" || path === "/atom.xml") {
        const articles = await recent(100, new Date(clock.getTime() - 7 * 86400000).toISOString());
        return finish(path === "/rss.xml" ? rss(articles, clock) : atom(articles, clock));
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
