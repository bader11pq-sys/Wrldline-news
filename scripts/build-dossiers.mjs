#!/usr/bin/env node
/**
 * WRLDLINE Live Event Dossier builder.
 *
 * Reads curated dossiers from content/dossiers/*.json, validates them against a
 * strict editorial contract, and emits static, crawler-readable Arabic pages.
 *
 * Design rules:
 * - No network access and no build-time clock: output is deterministic.
 * - Every factual statement must reference an existing source id.
 * - Event time and report time are separate fields and are never merged.
 * - Nothing is invented: missing data is omitted, not filled with placeholders.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = path.join(ROOT, "content", "dossiers");
const OUT_DIR = path.join(ROOT, "dossier");
const ORIGIN = "https://al-ghaib.us.ci";
const SITE = "WRLDLINE";

const STATUS = {
  active: { label: "نشط", en: "Active", hint: "يتطور الآن وتُضاف إليه تحديثات" },
  monitoring: { label: "قيد المراقبة", en: "Monitoring", hint: "استقر ميدانياً لكن مؤشراته تُراقب" },
  closed: { label: "مغلق", en: "Closed", hint: "انتهى الحدث ويبقى ملفه مرجعاً" },
};
const VERIFICATION = {
  verified: { label: "متحقق", cls: "v-verified" },
  reported: { label: "مروي", cls: "v-reported" },
  claimed: { label: "تصريح", cls: "v-claimed" },
  estimated: { label: "تقدير", cls: "v-estimated" },
  unverified: { label: "غير متحقق", cls: "v-unverified" },
};
const KINDS = {
  event: "حدث",
  statement: "تصريح",
  report: "تقرير",
  analysis: "تحليل",
  market: "سوق",
  security: "أمن",
  official: "رسمي",
  data: "بيانات",
};
const SOURCE_KINDS = {
  official: "رسمي",
  wire: "وكالة",
  outlet: "صحيفة",
  analysis: "تحليل",
  market: "سوق",
  data: "بيانات",
};

const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const attr = (value = "") => esc(value).replace(/\n/g, " ");
const text = (value = "") => String(value).replace(/\s+/g, " ").trim();
const iso = (value) => {
  const t = Date.parse(value || "");
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
};
const day = (value) => iso(value).slice(0, 10);

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
function arabicDate(value, withTime = false) {
  const t = Date.parse(value || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const base = `${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (!withTime) return base;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${base} · ${hh}:${mm} UTC`;
}
function relative(value, now) {
  const t = Date.parse(value || "");
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.round(hours / 24);
  return `قبل ${days} يوماً`;
}

class DossierError extends Error {}

function requireString(obj, key, where, { min = 1, max = 5000 } = {}) {
  const value = text(obj?.[key] ?? "");
  if (value.length < min) throw new DossierError(`${where}: الحقل "${key}" مطلوب (الحد الأدنى ${min}).`);
  if (value.length > max) throw new DossierError(`${where}: الحقل "${key}" أطول من ${max} حرف.`);
  return value;
}
function requireArray(obj, key, where, min = 1) {
  const value = obj?.[key];
  if (!Array.isArray(value) || value.length < min) throw new DossierError(`${where}: الحقل "${key}" يجب أن يحتوي ${min} عنصراً على الأقل.`);
  return value;
}
function requireISO(obj, key, where) {
  const value = iso(obj?.[key]);
  if (!value) throw new DossierError(`${where}: الحقل "${key}" يجب أن يكون تاريخاً صالحاً.`);
  return value;
}

function validate(raw, file) {
  const where = path.basename(file);
  if (!raw || typeof raw !== "object") throw new DossierError(`${where}: ملف غير صالح.`);
  const slug = requireString(raw, "slug", where, { max: 80 });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new DossierError(`${where}: slug يجب أن يكون أحرفاً لاتينية صغيرة وأرقاماً وشرطات.`);
  if (!STATUS[raw.status]) throw new DossierError(`${where}: status غير معروف.`);

  const dossier = {
    slug,
    title: requireString(raw, "title", where, { min: 8, max: 140 }),
    shortTitle: text(raw.shortTitle || raw.title).slice(0, 60),
    kicker: requireString(raw, "kicker", where, { max: 80 }),
    status: raw.status,
    priority: Number.isFinite(Number(raw.priority)) ? Math.max(0, Math.min(1000, Number(raw.priority))) : 0,
    statusNote: requireString(raw, "statusNote", where, { max: 240 }),
    summary: requireString(raw, "summary", where, { min: 80, max: 900 }),
    location: requireString(raw, "location", where, { max: 120 }),
    startedAt: requireISO(raw, "startedAt", where),
    updatedAt: requireISO(raw, "updatedAt", where),
    createdAt: requireISO(raw, "createdAt", where),
    tags: requireArray(raw, "tags", where, 1).map((t) => text(t)).filter(Boolean),
    sectors: requireArray(raw, "sectors", where, 1).map((t) => text(t)).filter(Boolean),
    keywords: requireArray(raw, "keywords", where, 1).map((t) => text(t)).filter(Boolean),
    facts: requireArray(raw, "facts", where, 2).map((f, i) => ({
      label: requireString(f, "label", `${where} facts[${i}]`, { max: 80 }),
      value: requireString(f, "value", `${where} facts[${i}]`, { max: 240 }),
      sourceRefs: requireArray(f, "sourceRefs", `${where} facts[${i}]`).map(String),
    })),
    parties: requireArray(raw, "parties", where, 1).map((p, i) => ({
      name: requireString(p, "name", `${where} parties[${i}]`, { max: 90 }),
      role: requireString(p, "role", `${where} parties[${i}]`, { max: 240 }),
    })),
    whatChanged: requireArray(raw, "whatChanged", where, 1).map((c, i) => ({
      at: requireISO(c, "at", `${where} whatChanged[${i}]`),
      text: requireString(c, "text", `${where} whatChanged[${i}]`, { max: 400 }),
      sourceRefs: requireArray(c, "sourceRefs", `${where} whatChanged[${i}]`).map(String),
    })),
    timeline: requireArray(raw, "timeline", where, 3).map((t, i) => ({
      at: requireISO(t, "at", `${where} timeline[${i}]`),
      dateLabel: text(t.dateLabel || "").slice(0, 40),
      reportedAt: t.reportedAt ? requireISO(t, "reportedAt", `${where} timeline[${i}]`) : "",
      kind: KINDS[t.kind] ? t.kind : "event",
      verification: VERIFICATION[t.verification] ? t.verification : "reported",
      text: requireString(t, "text", `${where} timeline[${i}]`, { max: 500 }),
      sourceRefs: requireArray(t, "sourceRefs", `${where} timeline[${i}]`).map(String),
    })),
    narratives: {
      agreements: requireArray(raw.narratives || {}, "agreements", `${where} narratives`, 0).map((n, i) => ({
        text: requireString(n, "text", `${where} agreements[${i}]`, { max: 400 }),
        sourceRefs: requireArray(n, "sourceRefs", `${where} agreements[${i}]`).map(String),
      })),
      differences: requireArray(raw.narratives || {}, "differences", `${where} narratives`, 0).map((n, i) => ({
        text: requireString(n, "text", `${where} differences[${i}]`, { max: 400 }),
        sourceRefs: requireArray(n, "sourceRefs", `${where} differences[${i}]`).map(String),
      })),
      unverified: requireArray(raw.narratives || {}, "unverified", `${where} narratives`, 0).map((n, i) => ({
        text: requireString(n, "text", `${where} unverified[${i}]`, { max: 400 }),
        sourceRefs: Array.isArray(n.sourceRefs) ? n.sourceRefs.map(String) : [],
      })),
    },
    context: requireArray(raw, "context", where, 1).map((c, i) => ({
      heading: requireString(c, "heading", `${where} context[${i}]`, { max: 120 }),
      paragraphs: requireArray(c, "paragraphs", `${where} context[${i}]`, 1).map((p) => text(p)).filter(Boolean),
      sourceRefs: requireArray(c, "sourceRefs", `${where} context[${i}]`).map(String),
    })),
    impact: {
      actual: requireArray(raw.impact || {}, "actual", `${where} impact`, 0).map((n, i) => ({
        text: requireString(n, "text", `${where} impact.actual[${i}]`, { max: 400 }),
        sourceRefs: requireArray(n, "sourceRefs", `${where} impact.actual[${i}]`).map(String),
      })),
      potential: requireArray(raw.impact || {}, "potential", `${where} impact`, 0).map((n, i) => ({
        text: requireString(n, "text", `${where} impact.potential[${i}]`, { max: 400 }),
        sourceRefs: Array.isArray(n.sourceRefs) ? n.sourceRefs.map(String) : [],
      })),
    },
    watchNext: requireArray(raw, "watchNext", where, 2).map((w, i) => ({
      what: requireString(w, "what", `${where} watchNext[${i}]`, { max: 240 }),
      when: text(w.when || "").slice(0, 80),
      why: requireString(w, "why", `${where} watchNext[${i}]`, { max: 300 }),
    })),
    sources: requireArray(raw, "sources", where, 3).map((s, i) => {
      const url = requireString(s, "url", `${where} sources[${i}]`, { max: 500 });
      if (!/^https:\/\//i.test(url)) throw new DossierError(`${where} sources[${i}]: الرابط يجب أن يبدأ بـ https.`);
      return {
        id: requireString(s, "id", `${where} sources[${i}]`, { max: 40 }),
        publisher: requireString(s, "publisher", `${where} sources[${i}]`, { max: 120 }),
        title: requireString(s, "title", `${where} sources[${i}]`, { max: 240 }),
        url,
        publishedAt: s.publishedAt ? requireISO(s, "publishedAt", `${where} sources[${i}]`) : "",
        accessedAt: requireISO(s, "accessedAt", `${where} sources[${i}]`),
        kind: SOURCE_KINDS[s.kind] ? s.kind : "outlet",
      };
    }),
    updates: requireArray(raw, "updates", where, 1).map((u, i) => ({
      at: requireISO(u, "at", `${where} updates[${i}]`),
      version: requireString(u, "version", `${where} updates[${i}]`, { max: 20 }),
      note: requireString(u, "note", `${where} updates[${i}]`, { max: 400 }),
    })),
    corrections: Array.isArray(raw.corrections)
      ? raw.corrections.map((c, i) => ({
          at: requireISO(c, "at", `${where} corrections[${i}]`),
          note: requireString(c, "note", `${where} corrections[${i}]`, { max: 400 }),
        }))
      : [],
  };

  const ids = new Set();
  for (const s of dossier.sources) {
    if (ids.has(s.id)) throw new DossierError(`${where}: معرّف مصدر مكرر "${s.id}".`);
    ids.add(s.id);
  }
  const checkRefs = (refs, label) => {
    for (const ref of refs) if (!ids.has(ref)) throw new DossierError(`${where}: ${label} يشير إلى مصدر غير موجود "${ref}".`);
  };
  dossier.facts.forEach((f) => checkRefs(f.sourceRefs, "facts"));
  dossier.whatChanged.forEach((c) => checkRefs(c.sourceRefs, "whatChanged"));
  dossier.timeline.forEach((t) => checkRefs(t.sourceRefs, "timeline"));
  dossier.narratives.agreements.forEach((n) => checkRefs(n.sourceRefs, "agreements"));
  dossier.narratives.differences.forEach((n) => checkRefs(n.sourceRefs, "differences"));
  dossier.narratives.unverified.forEach((n) => checkRefs(n.sourceRefs, "unverified"));
  dossier.context.forEach((c) => checkRefs(c.sourceRefs, "context"));
  dossier.impact.actual.forEach((n) => checkRefs(n.sourceRefs, "impact.actual"));

  dossier.timeline.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  dossier.updates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (Date.parse(dossier.updatedAt) < Date.parse(dossier.startedAt)) {
    throw new DossierError(`${where}: updatedAt أقدم من startedAt.`);
  }
  const sourceMap = new Map(dossier.sources.map((s) => [s.id, s]));
  return { ...dossier, sourceMap };
}

function sourceLinks(refs, sourceMap) {
  if (!refs?.length) return "";
  const items = refs.map((ref) => {
    const s = sourceMap.get(ref);
    if (!s) return "";
    return `<a class="src-ref" href="${attr(s.url)}" target="_blank" rel="noopener noreferrer" title="${attr(s.publisher)} — ${attr(s.title)}">${esc(s.publisher)}<span class="sr-only"> (يفتح في نافذة جديدة)</span></a>`;
  }).filter(Boolean);
  return items.length ? `<span class="src-refs" aria-label="المصادر">${items.join("")}</span>` : "";
}

function badge(verification) {
  const v = VERIFICATION[verification] || VERIFICATION.reported;
  return `<span class="badge ${v.cls}">${esc(v.label)}</span>`;
}

function renderHeader(active = "") {
  const links = [
    ["/index.html", "الرئيسية"],
    ["/dossier/", "ملفات الأحداث"],
    ["/dossier/watchlist.html", "ما نراقبه"],
    ["/context.html", "غرفة السياق"],
    ["/balance.html", "ميزان الروايات"],
    ["/impact.html", "أطلس التأثير"],
    ["/markets.html", "الأسواق"],
    ["/about.html", "المنهجية"],
  ];
  return `<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/index.html"><span class="brand-mark">W</span><span class="brand-copy"><strong>WRLDLINE</strong><small>LIVE EVENT DOSSIER</small></span></a>
    <nav class="site-nav" aria-label="التنقل الرئيسي">
      ${links.map(([href, label]) => `<a href="${href}"${href === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
    </nav>
    <button class="theme-toggle" type="button" data-dossier-theme aria-label="تبديل المظهر">☾</button>
  </div>
</header>`;
}

function renderFooter() {
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div><strong>WRLDLINE</strong><p>من الخبر إلى الفهم، ومن الفهم إلى القرار.</p></div>
    <div><h2>الملفات</h2><a href="/dossier/">كل ملفات الأحداث</a><a href="/dossier/feed.xml">خلاصة الملفات</a><a href="/about.html">المنهجية والتحرير</a></div>
    <div><h2>السياسات</h2><a href="/corrections.html">التصحيح</a><a href="/privacy.html">الخصوصية</a><a href="/terms.html">الشروط</a><a href="/contact.html">التواصل</a></div>
  </div>
  <div class="wrap footer-bottom"><span>© ${new Date().getUTCFullYear()} WRLDLINE NEWS</span><span>الملفات تحليل معلومات عامة موثقة، وليست معلومات سرية أو نصيحة استثمارية.</span></div>
</footer>`;
}

function pageShell({ title, description, canonical, body, jsonLd, extraHead = "", bodyClass = "", activeNav = "/dossier/" }) {
  return `<!doctype html>
<html lang="ar" dir="rtl" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<link rel="canonical" href="${attr(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE}">
<meta property="og:locale" content="ar_SA">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${attr(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${attr(title)}">
<meta name="twitter:description" content="${attr(description)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Kufi+Arabic:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/dossier.css?v=20261119-1">
<link rel="alternate" type="application/rss+xml" title="ملفات WRLDLINE" href="/dossier/feed.xml">
${extraHead}
<script type="application/ld+json">${jsonLd}</script>
</head>
<body class="dossier-page ${bodyClass}">
<a class="skip-link" href="#main">تجاوز إلى المحتوى</a>
${renderHeader(activeNav)}
<main id="main">${body}</main>
${renderFooter()}
<script src="/dossier.js?v=20261119-1" defer></script>
</body>
</html>`;
}

function renderDossier(d, now) {
  const status = STATUS[d.status];
  const canonical = `${ORIGIN}/dossier/${d.slug}.html`;
  const latest = d.timeline[d.timeline.length - 1];

  const facts = `<dl class="facts">${d.facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}${sourceLinks(f.sourceRefs, d.sourceMap)}</dd></div>`).join("")}</dl>`;

  const whatChanged = `<ol class="changed">${d.whatChanged.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).map((c) => `<li><time datetime="${attr(c.at)}">${esc(arabicDate(c.at))}</time><p>${esc(c.text)}${sourceLinks(c.sourceRefs, d.sourceMap)}</p></li>`).join("")}</ol>`;

  const timeline = `<ol class="timeline">${d.timeline.map((t) => {
    const when = t.dateLabel || arabicDate(t.at);
    const reported = t.reportedAt && day(t.reportedAt) !== day(t.at)
      ? `<span class="reported">نُشرت المعلومة في ${esc(arabicDate(t.reportedAt))}</span>` : "";
    return `<li class="tl-item">
      <div class="tl-date"><time datetime="${attr(t.at)}">${esc(when)}</time>${reported}</div>
      <div class="tl-body"><div class="tl-head"><span class="kind">${esc(KINDS[t.kind])}</span>${badge(t.verification)}</div><p>${esc(t.text)}</p>${sourceLinks(t.sourceRefs, d.sourceMap)}</div>
    </li>`;
  }).join("")}</ol>`;

  const narratives = `<div class="balance">
    <section class="balance-col"><h3>ما تتفق عليه المصادر</h3><ul>${d.narratives.agreements.length ? d.narratives.agreements.map((n) => `<li>${esc(n.text)}${sourceLinks(n.sourceRefs, d.sourceMap)}</li>`).join("") : "<li class=\"empty\">لا يوجد اتفاق موثق كافٍ بعد.</li>"}</ul></section>
    <section class="balance-col"><h3>ما تختلف عليه</h3><ul>${d.narratives.differences.length ? d.narratives.differences.map((n) => `<li>${esc(n.text)}${sourceLinks(n.sourceRefs, d.sourceMap)}</li>`).join("") : "<li class=\"empty\">لم يظهر اختلاف جوهري في المصادر المراجعة.</li>"}</ul></section>
    <section class="balance-col"><h3>ما لم يتحقق بعد</h3><ul>${d.narratives.unverified.length ? d.narratives.unverified.map((n) => `<li>${esc(n.text)}${sourceLinks(n.sourceRefs, d.sourceMap)}</li>`).join("") : "<li class=\"empty\">لا توجد ادعاءات معلقة موثقة في هذا الإصدار.</li>"}</ul></section>
  </div>`;

  const context = d.context.map((c) => `<section class="context-block"><h3>${esc(c.heading)}</h3>${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}${sourceLinks(c.sourceRefs, d.sourceMap)}</section>`).join("");

  const impact = `<div class="impact-grid">
    <section class="impact-col impact-now"><h3>أثر فعلي</h3><ul>${d.impact.actual.length ? d.impact.actual.map((n) => `<li>${esc(n.text)}${sourceLinks(n.sourceRefs, d.sourceMap)}</li>`).join("") : "<li class=\"empty\">لا يوجد أثر فعلي موثق بعد.</li>"}</ul></section>
    <section class="impact-col impact-next"><h3>أثر محتمل</h3><ul>${d.impact.potential.length ? d.impact.potential.map((n) => `<li>${esc(n.text)}${sourceLinks(n.sourceRefs, d.sourceMap)}</li>`).join("") : "<li class=\"empty\">لا نضيف احتمالاً بلا دليل.</li>"}</ul></section>
  </div>`;

  const watch = `<ol class="watch">${d.watchNext.map((w) => `<li><div class="watch-what">${esc(w.what)}</div>${w.when ? `<div class="watch-when">${esc(w.when)}</div>` : ""}<p>${esc(w.why)}</p></li>`).join("")}</ol>`;

  const sources = `<ol class="sources">${d.sources.map((s) => `<li id="src-${attr(s.id)}"><span class="src-kind">${esc(SOURCE_KINDS[s.kind])}</span><a href="${attr(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><span class="src-meta">${esc(s.publisher)}${s.publishedAt ? ` · ${esc(arabicDate(s.publishedAt))}` : ""} · وُصل إليه ${esc(arabicDate(s.accessedAt))}</span></li>`).join("")}</ol>`;

  const updates = `<ol class="updates">${d.updates.map((u) => `<li><span class="version">v${esc(u.version)}</span><time datetime="${attr(u.at)}">${esc(arabicDate(u.at, true))}</time><p>${esc(u.note)}</p></li>`).join("")}</ol>`;

  const corrections = d.corrections.length
    ? `<section class="block" id="corrections"><h2>سجل التصحيحات</h2><ol class="updates corrections">${d.corrections.map((c) => `<li><time datetime="${attr(c.at)}">${esc(arabicDate(c.at, true))}</time><p>${esc(c.note)}</p></li>`).join("")}</ol></section>`
    : `<section class="block" id="corrections"><h2>سجل التصحيحات</h2><p class="muted">لا تصحيحات منشورة على هذا الملف حتى الآن. عند ثبوت خطأ نضيف تصحيحاً هنا ونحدّث وقت الملف.</p></section>`;

  const related = `<section class="block related" id="related" data-keywords="${attr(d.keywords.join("|"))}" aria-labelledby="relatedTitle"><div class="related-head"><h2 id="relatedTitle">أخبار مرتبطة بالملف</h2><span class="muted" id="relatedStatus">جارٍ البحث في الأخبار المنشورة…</span></div><div class="related-grid" id="relatedGrid"></div></section>`;

  const body = `
<article class="dossier">
  <header class="dossier-hero">
    <div class="wrap">
      <nav class="crumbs" aria-label="مسار التنقل"><a href="/index.html">الرئيسية</a><span aria-hidden="true">/</span><a href="/dossier/">ملفات الأحداث</a><span aria-hidden="true">/</span><span aria-current="page">${esc(d.shortTitle)}</span></nav>
      <div class="hero-top"><span class="kicker">${esc(d.kicker)}</span><span class="status status-${attr(d.status)}"><span class="dot" aria-hidden="true"></span>${esc(status.label)}</span></div>
      <h1>${esc(d.title)}</h1>
      <p class="lead">${esc(d.summary)}</p>
      <div class="hero-meta">
        <span><b>الموقع</b> ${esc(d.location)}</span>
        <span><b>بدأ</b> <time datetime="${attr(d.startedAt)}">${esc(arabicDate(d.startedAt))}</time></span>
        <span><b>آخر تحديث</b> <time datetime="${attr(d.updatedAt)}">${esc(arabicDate(d.updatedAt, true))}</time></span>
        <span class="muted">${esc(relative(d.updatedAt, now))}</span>
      </div>
      <div class="hero-actions">
        <button type="button" class="btn btn-primary" data-follow="${attr(d.slug)}" aria-pressed="false">متابعة الملف</button>
        <a class="btn" href="#timeline">الخط الزمني</a>
        <button type="button" class="btn" data-print>طباعة / PDF</button>
        <button type="button" class="btn" data-share-dossier>مشاركة</button>
      </div>
      <p class="status-note">${esc(d.statusNote)}</p>
    </div>
  </header>

  <div class="wrap dossier-layout">
    <div class="dossier-main">
      <section class="block" id="facts"><h2>لمحة سريعة</h2>${facts}</section>

      <section class="block" id="changed"><div class="block-head"><h2>ماذا تغيّر؟</h2><span class="muted">منذ الإصدار السابق</span></div>${whatChanged}</section>

      <section class="block" id="timeline"><div class="block-head"><h2>الخط الزمني</h2><span class="muted">وقت الحدث منفصل عن وقت نشر المعلومة</span></div>${timeline}</section>

      <section class="block" id="balance"><div class="block-head"><h2>ميزان الروايات</h2><span class="muted">اتفاق، اختلاف، وما لم يتحقق</span></div>${narratives}</section>

      <section class="block" id="context"><h2>السياق</h2>${context}</section>

      <section class="block" id="impact"><div class="block-head"><h2>الأثر على السعودية والخليج</h2><span class="muted">نفصل الفعلي عن المحتمل</span></div><div class="sector-tags">${d.sectors.map((s) => `<span>${esc(s)}</span>`).join("")}</div>${impact}</section>

      <section class="block" id="watch"><div class="block-head"><h2>ماذا نراقب تالياً؟</h2><span class="muted">مواعيد ومؤشرات قابلة للتحقق</span></div>${watch}</section>

      ${related}

      <section class="block" id="sources"><h2>المصادر</h2><p class="muted">كل رابط أدناه عام، ووُصل إليه في تاريخ مذكور. لا نستخدم مصادر مجهولة لتأكيد وقائع.</p>${sources}</section>

      <section class="block" id="updates"><h2>سجل التحديثات</h2>${updates}</section>

      ${corrections}
    </div>

    <aside class="dossier-aside" aria-label="ملخص الملف">
      <div class="aside-card">
        <h2>حالة الملف</h2>
        <p><span class="status status-${attr(d.status)}"><span class="dot" aria-hidden="true"></span>${esc(status.label)}</span></p>
        <p class="muted">${esc(status.hint)}</p>
        <p class="muted">آخر تطور: ${latest ? esc(arabicDate(latest.at)) : "—"}</p>
      </div>
      <div class="aside-card">
        <h2>الأطراف</h2>
        <ul class="parties">${d.parties.map((p) => `<li><b>${esc(p.name)}</b><span>${esc(p.role)}</span></li>`).join("")}</ul>
      </div>
      <div class="aside-card">
        <h2>كيف تقرأ الملف</h2>
        <ul class="legend">
          <li>${badge("verified")} واقعة مؤكدة من مصدر رسمي أو وكالة موثوقة.</li>
          <li>${badge("reported")} معلومة منشورة نسبت إلى جهة، دون تحقق مستقل كامل.</li>
          <li>${badge("claimed")} تصريح طرف، لا يعني صحته.</li>
          <li>${badge("estimated")} تقدير محلل أو مؤسسة، وليس رقماً رسمياً.</li>
          <li>${badge("unverified")} متداول بلا دليل كافٍ.</li>
        </ul>
      </div>
      <div class="aside-card">
        <h2>أدوات الملف</h2>
        <ul class="tools">
          <li><a href="/dossier/watchlist.html?dossier=${attr(d.slug)}">ما نراقبه في هذا الملف</a></li>
          <li><a href="/dossier/claims.html?dossier=${attr(d.slug)}">ادعاءات هذا الملف</a></li>
          <li><a href="/dossier/impact.html?dossier=${attr(d.slug)}">أثر هذا الملف</a></li>
        </ul>
      </div>
      <div class="aside-card aside-note">
        <h2>حدود الاستخدام</h2>
        <p>هذا الملف تحليل لمعلومات عامة. لا يدّعي معلومات سرية، ولا يقدم نصيحة استثمارية أو تأمينية. الأرقام منسوبة إلى مصادرها وتاريخها.</p>
      </div>
    </aside>
  </div>
</article>`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "AnalysisNewsArticle",
    headline: d.title,
    description: d.summary,
    datePublished: d.createdAt,
    dateModified: d.updatedAt,
    inLanguage: "ar",
    url: canonical,
    mainEntityOfPage: canonical,
    isAccessibleForFree: true,
    articleSection: "ملفات الأحداث",
    keywords: d.keywords.join(", "),
    about: d.parties.map((p) => ({ "@type": "Thing", name: p.name })),
    author: { "@type": "Organization", name: "WRLDLINE", url: ORIGIN },
    publisher: { "@type": "Organization", name: "WRLDLINE", url: ORIGIN, logo: { "@type": "ImageObject", url: `${ORIGIN}/favicon.svg` } },
    citation: d.sources.map((s) => ({ "@type": "CreativeWork", name: s.title, url: s.url, publisher: { "@type": "Organization", name: s.publisher }, datePublished: s.publishedAt || undefined })),
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "الرئيسية", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "ملفات الأحداث", item: `${ORIGIN}/dossier/` },
        { "@type": "ListItem", position: 3, name: d.title, item: canonical },
      ],
    },
  }).replace(/</g, "\\u003c");

  return pageShell({
    title: `${d.title} | WRLDLINE`,
    description: d.summary.slice(0, 300),
    canonical,
    body,
    jsonLd,
    bodyClass: "dossier-detail",
    extraHead: `<meta property="article:published_time" content="${attr(d.createdAt)}"><meta property="article:modified_time" content="${attr(d.updatedAt)}"><meta property="article:section" content="ملفات الأحداث">`,
  });
}

function renderIndex(list, now) {
  const canonical = `${ORIGIN}/dossier/`;
  const active = list.filter((d) => d.status === "active").length;
  const sectors = [...new Set(list.flatMap((d) => d.sectors))];
  const cards = list.map((d) => {
    const status = STATUS[d.status];
    return `<article class="card" data-dossier-card="${attr(d.slug)}" data-status="${attr(d.status)}" data-sectors="${attr(d.sectors.join("|"))}" data-search="${attr([d.title, d.summary, d.keywords.join(" "), d.sectors.join(" "), d.location].join(" "))}">
      <div class="card-top"><span class="status status-${attr(d.status)}"><span class="dot" aria-hidden="true"></span>${esc(status.label)}</span><span class="muted">${esc(arabicDate(d.updatedAt))}</span></div>
      <h2><a href="/dossier/${attr(d.slug)}.html">${esc(d.title)}</a></h2>
      <p>${esc(d.summary)}</p>
      <div class="card-tags">${d.sectors.map((s) => `<span>${esc(s)}</span>`).join("")}</div>
      <div class="card-foot"><span>${esc(d.location)}</span><a href="/dossier/${attr(d.slug)}.html">افتح الملف ←</a></div>
    </article>`;
  }).join("");

  const body = `
<section class="index-hero"><div class="wrap">
  <span class="kicker">LIVE EVENT DOSSIERS</span>
  <h1>ملفات الأحداث الحية</h1>
  <p class="lead">كل ملف يجمع ما حدث، وما تغيّر، وميزان الروايات، والسياق، والأثر على الخليج، وما نراقبه تالياً — بمصادر مؤرخة وحالة تحقق واضحة.</p>
  <div class="index-stats"><div><b>${list.length}</b><span>ملفات منشورة</span></div><div><b>${active}</b><span>ملف نشط</span></div><div><b>${list.reduce((n, d) => n + d.sources.length, 0)}</b><span>مصدراً موثقاً</span></div></div>
  ${renderSuiteNav("/dossier/")}
</div></section>
<section class="wrap index-body">
  <div class="dossier-search">
    <label for="dossierSearch">ابحث في الملفات</label>
    <input id="dossierSearch" type="search" inputmode="search" placeholder="هرمز، أوبك، الغاز، الشحن…" autocomplete="off">
    <span id="searchStatus" class="muted" aria-live="polite"></span>
  </div>
  <div class="filters" role="group" aria-label="تصفية الملفات">
    <button type="button" class="chip is-on" data-filter-status="all">الكل</button>
    <button type="button" class="chip" data-filter-status="active" aria-pressed="false">نشط</button>
    <button type="button" class="chip" data-filter-status="monitoring" aria-pressed="false">قيد المراقبة</button>
    <button type="button" class="chip" data-filter-status="closed" aria-pressed="false">مغلق</button>
    <button type="button" class="chip" data-filter-followed aria-pressed="false" hidden>ملفاتي</button>
    <span class="filter-sep" aria-hidden="true"></span>
    ${sectors.map((s) => `<button type="button" class="chip" data-filter-sector="${attr(s)}">${esc(s)}</button>`).join("")}
  </div>
  <p class="muted" id="filterStatus" role="status" aria-live="polite">${list.length} ملفاً</p>
  <div class="cards" id="dossierCards">${cards}</div>
  <p class="empty" id="dossierEmpty" hidden>لا توجد ملفات مطابقة لهذا الاختيار.</p>
  <section class="index-note">
    <h2>كيف نبني الملف؟</h2>
    <p>نبدأ من مصادر عامة مؤرخة، نفصل وقت الحدث عن وقت نشر المعلومة، ونصنّف كل عبارة: واقعة، تصريح، تقدير، أو ادعاء غير متحقق. لا نملأ الفراغات بالتخمين، ونحفظ سجل التحديثات والتصحيحات في أسفل كل ملف.</p>
    <a href="/about.html">اقرأ المنهجية الكاملة</a>
    <p class="muted">للمحررين: <a href="/dossier/review.html">طابور مراجعة التحديثات</a> — أداة داخلية غير مفهرسة.</p>
  </section>
</section>`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "ملفات الأحداث الحية — WRLDLINE",
    description: "ملفات أحداث عربية وخليجية تجمع التطورات والمصادر وميزان الروايات والأثر.",
    url: canonical,
    inLanguage: "ar",
    hasPart: list.map((d) => ({ "@type": "AnalysisNewsArticle", headline: d.title, url: `${ORIGIN}/dossier/${d.slug}.html`, dateModified: d.updatedAt })),
  }).replace(/</g, "\\u003c");

  return pageShell({
    title: "ملفات الأحداث الحية | WRLDLINE",
    description: "ملفات أحداث حية تجمع ما حدث وما تغيّر وميزان الروايات والسياق والأثر على السعودية والخليج، بمصادر مؤرخة.",
    canonical,
    body,
    jsonLd,
    bodyClass: "dossier-index",
  });
}

function renderFeed(list) {
  const items = list.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map((d) => `    <item>
      <title>${esc(d.title)}</title>
      <link>${ORIGIN}/dossier/${d.slug}.html</link>
      <guid isPermaLink="true">${ORIGIN}/dossier/${d.slug}.html</guid>
      <pubDate>${new Date(d.updatedAt).toUTCString()}</pubDate>
      <description>${esc(d.summary)}</description>
      <category>${esc(d.sectors.join(", "))}</category>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ملفات الأحداث الحية — WRLDLINE</title>
    <link>${ORIGIN}/dossier/</link>
    <description>ملفات أحداث بمصادر مؤرخة وميزان روايات وأثر خليجي.</description>
    <language>ar</language>
    <atom:link href="${ORIGIN}/dossier/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

function renderSitemap(list) {
  const urls = [`${ORIGIN}/dossier/`, ...SUITE_PAGES.map(([href]) => `${ORIGIN}${href}`), ...list.map((d) => `${ORIGIN}/dossier/${d.slug}.html`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
}

function renderIndexJson(list) {
  return JSON.stringify({
    updatedAt: list.reduce((max, d) => (Date.parse(d.updatedAt) > Date.parse(max) ? d.updatedAt : max), list[0]?.updatedAt || ""),
    dossiers: list.map((d) => ({
      slug: d.slug, title: d.title, shortTitle: d.shortTitle, status: d.status,
      priority: Number(d.priority || 0),
      summary: d.summary, updatedAt: d.updatedAt, sectors: d.sectors, location: d.location, keywords: d.keywords,
      url: `/dossier/${d.slug}.html`, sources: d.sources.length,
    })),
  }, null, 2) + "\n";
}


const SUITE_PAGES = [
  ["/dossier/watchlist.html", "ما نراقبه"],
  ["/dossier/claims.html", "ميزان الادعاءات"],
  ["/dossier/impact.html", "أثر الملفات"],
  ["/dossier/digest.html", "موجز الأسبوع"],
];

const CLAIM_TYPES = {
  agreement: { label: "اتفاق", cls: "claim-agree", hint: "ما تتفق عليه المصادر المراجعة." },
  difference: { label: "اختلاف", cls: "claim-diff", hint: "روايات متعارضة أو تفسيرات مختلفة." },
  unverified: { label: "غير متحقق", cls: "claim-unv", hint: "ادعاء متداول بلا دليل كافٍ." },
};

const AR_MONTH_NUM = { "يناير": 1, "فبراير": 2, "مارس": 3, "أبريل": 4, "مايو": 5, "يونيو": 6, "يوليو": 7, "أغسطس": 8, "سبتمبر": 9, "أكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12 };
const pad2 = (n) => String(n).padStart(2, "0");

function parseWhen(when, fallbackYear) {
  const value = text(when);
  if (!value) return { timing: "undated", date: null, approximate: false };
  const exact = value.match(/(\d{1,2})\s+(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)\s+(\d{4})/);
  if (exact) {
    const month = AR_MONTH_NUM[exact[2]];
    const date = `${exact[3]}-${pad2(month)}-${pad2(Number(exact[1]))}`;
    if (Number.isFinite(Date.parse(date))) return { timing: "dated", date, approximate: false };
  }
  const approx = value.match(/(مطلع|منتصف|أواخر)\s+(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)\s*(\d{4})?/);
  if (approx) {
    const year = approx[3] || String(fallbackYear);
    const day = approx[1] === "مطلع" ? 1 : approx[1] === "منتصف" ? 15 : 25;
    return { timing: "dated", date: `${year}-${pad2(AR_MONTH_NUM[approx[2]])}-${pad2(day)}`, approximate: true };
  }
  const yearOnly = value.match(/\b(20\d{2})\b/);
  if (yearOnly) return { timing: "dated", date: `${yearOnly[1]}-01-01`, approximate: true };
  if (/أسبوع|مستمر|يومي|ربع|شهري/.test(value)) return { timing: "ongoing", date: null, approximate: false };
  return { timing: "undated", date: null, approximate: false };
}

function collectWatch(list, now) {
  const fallbackYear = new Date(now).getUTCFullYear();
  const items = [];
  for (const d of list) {
    d.watchNext.forEach((w, i) => {
      const parsed = parseWhen(w.when, fallbackYear);
      items.push({
        id: `${d.slug}-watch-${i}`,
        dossier: d.slug,
        dossierTitle: d.shortTitle,
        status: d.status,
        sectors: d.sectors,
        what: w.what,
        when: w.when,
        why: w.why,
        ...parsed,
        url: `/dossier/${d.slug}.html#watch`,
      });
    });
  }
  const order = { dated: 0, ongoing: 1, undated: 2 };
  items.sort((a, b) => (order[a.timing] - order[b.timing]) || (a.date && b.date ? a.date.localeCompare(b.date) : 0) || a.dossierTitle.localeCompare(b.dossierTitle, "ar"));
  return items;
}

function collectClaims(list) {
  const items = [];
  for (const d of list) {
    for (const type of ["unverified", "difference", "agreement"]) {
      const key = type === "difference" ? "differences" : type === "agreement" ? "agreements" : "unverified";
      d.narratives[key].forEach((n, i) => {
        items.push({ id: `${d.slug}-${type}-${i}`, type, text: n.text, sourceRefs: n.sourceRefs, sourceMap: d.sourceMap, dossier: d.slug, dossierTitle: d.shortTitle, sectors: d.sectors, url: `/dossier/${d.slug}.html#balance` });
      });
    }
  }
  return items;
}

function collectImpact(list) {
  const items = [];
  for (const d of list) {
    for (const type of ["actual", "potential"]) {
      d.impact[type].forEach((n, i) => {
        items.push({ id: `${d.slug}-${type}-${i}`, type, text: n.text, sourceRefs: n.sourceRefs, sourceMap: d.sourceMap, dossier: d.slug, dossierTitle: d.shortTitle, sectors: d.sectors, url: `/dossier/${d.slug}.html#impact` });
      });
    }
  }
  return items;
}

function renderSuiteNav(active = "") {
  return `<nav class="suite-nav" aria-label="أدوات الملفات">${SUITE_PAGES.map(([href, label]) => `<a href="${href}"${href === active ? ' aria-current="page"' : ""}>${esc(label)}</a>`).join("")}</nav>`;
}

function suiteFilters(list, groups) {
  return groups.map((group) => `<div class="filters" role="group" aria-label="${attr(group.label)}">${group.buttons.map(([value, label, attrName, isOn]) => `<button type="button" class="chip${isOn ? " is-on" : ""}" ${attrName}="${attr(value)}" aria-pressed="${isOn ? "true" : "false"}">${esc(label)}</button>`).join("")}</div>`).join("");
}

function renderWatchlist(list, items, now) {
  const canonical = `${ORIGIN}/dossier/watchlist.html`;
  const dated = items.filter((i) => i.timing === "dated").length;
  const ongoing = items.filter((i) => i.timing === "ongoing").length;
  const undated = items.filter((i) => i.timing === "undated").length;
  const cards = items.map((i) => `<article class="card watch-item" data-suite-item data-type="${attr(i.timing)}" data-dossier="${attr(i.dossier)}" data-timing="${attr(i.timing)}">
      <div class="card-top"><span class="status status-${attr(i.status)}"><span class="dot" aria-hidden="true"></span>${esc(i.dossierTitle)}</span>${i.when ? `<span class="when">${esc(i.when)}${i.approximate ? " <em>تقديري</em>" : ""}</span>` : ""}</div>
      <h2>${esc(i.what)}</h2>
      <p>${esc(i.why)}</p>
      <div class="card-foot"><span>${esc(i.sectors.join(" · "))}</span><a href="${attr(i.url)}">افتح الملف ←</a></div>
    </article>`).join("");
  const body = `
<section class="index-hero"><div class="wrap">
  <span class="kicker">WATCHLIST · ما نراقبه</span>
  <h1>ما نراقبه تالياً</h1>
  <p class="lead">مؤشرات ومواعيد وقرارات من كل ملفات الأحداث في مكان واحد. نفصل الموعد المحدد عن المؤشر المستمر، ونوضح لماذا يستحق كل بند المتابعة. لا نضع تاريخاً لم نتحقق منه.</p>
  <div class="index-stats"><div><b>${items.length}</b><span>بنداً للمتابعة</span></div><div><b>${dated}</b><span>موعد أو نافذة زمنية</span></div><div><b>${ongoing}</b><span>مؤشر مستمر</span></div><div><b>${undated}</b><span>بلا موعد محدد</span></div></div>
  ${renderSuiteNav("/dossier/watchlist.html")}
</div></section>
<section class="wrap index-body" data-suite data-suite-unit="بند">
  <div class="suite-intro"><p>يمكنك الاشتراك في التقويم أدناه لمتابعة المواعيد المحددة. المواعيد التقديرية موسومة بوضوح، ولا تُعرض كمواعيد رسمية.</p><div class="suite-actions"><a class="btn btn-primary" href="/dossier/watchlist.ics">تنزيل تقويم المتابعة (.ics)</a><a class="btn" href="/dossier/feed.xml">RSS الملفات</a></div></div>
  ${suiteFilters(list, [
    { label: "تصفية حسب نوع المتابعة", buttons: [["all", "الكل", "data-suite-timing", true], ["dated", "مواعيد", "data-suite-timing", false], ["ongoing", "مستمر", "data-suite-timing", false], ["undated", "غير محدد", "data-suite-timing", false]] },
    { label: "تصفية حسب الملف", buttons: [["all", "كل الملفات", "data-suite-dossier", true], ...list.map((d) => [d.slug, d.shortTitle, "data-suite-dossier", false])] },
  ])}
  <p class="muted" data-suite-count role="status" aria-live="polite">${items.length} بنداً</p>
  <div class="cards suite-cards">${cards}</div>
  <p class="empty" data-suite-empty hidden>لا توجد بنود مطابقة لهذا الاختيار.</p>
  <section class="index-note"><h2>كيف نقرأ هذا التقويم؟</h2><p>«مواعيد» تعني تاريخاً أو نافذة زمنية وردت في مصدر موثق؛ «تقديري» يعني أن المصدر ذكر نافذة مثل «مطلع ديسمبر» دون يوم محدد. «مستمر» مؤشر يُراقب دورياً مثل تقارير الملاحة أو أسعار السوق. «غير محدد» بند مهم لكن لا تاريخ له بعد، ولا نخترع له موعداً.</p><a href="/about.html">المنهجية الكاملة</a></section>
</section>`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "ما نراقبه تالياً — WRLDLINE",
    description: "مؤشرات ومواعيد وقرارات قابلة للتحقق من ملفات الأحداث الحية.",
    url: canonical,
    numberOfItems: items.length,
    itemListElement: items.map((i, index) => ({ "@type": "ListItem", position: index + 1, name: i.what, url: `${ORIGIN}${i.url}` })),
  }).replace(/</g, "\\u003c");
  return pageShell({ title: "ما نراقبه تالياً | WRLDLINE", description: "مؤشرات ومواعيد وقرارات من ملفات الأحداث الحية، مع تمييز المواعيد المؤكدة عن التقديرية.", canonical, body, jsonLd, bodyClass: "dossier-index dossier-suite", activeNav: "/dossier/watchlist.html" });
}

function renderClaims(list, items, now) {
  const canonical = `${ORIGIN}/dossier/claims.html`;
  const counts = { agreement: 0, difference: 0, unverified: 0 };
  items.forEach((i) => { counts[i.type] += 1; });
  const cards = items.map((i) => {
    const type = CLAIM_TYPES[i.type];
    return `<article class="card claim-card" data-suite-item data-type="${attr(i.type)}" data-dossier="${attr(i.dossier)}">
      <div class="card-top"><span class="claim-badge ${type.cls}">${esc(type.label)}</span><span class="muted">${esc(i.dossierTitle)}</span></div>
      <p class="claim-text">${esc(i.text)}</p>
      <div class="claim-foot">${sourceLinks(i.sourceRefs, i.sourceMap)}<a href="${attr(i.url)}">سياق الادعاء ←</a></div>
    </article>`;
  }).join("");
  const body = `
<section class="index-hero"><div class="wrap">
  <span class="kicker">CLAIMS BALANCE · ميزان الادعاءات</span>
  <h1>ما تقوله المصادر… وما لم يثبت بعد</h1>
  <p class="lead">كل ادعاء في ملفاتنا مصنّف: ما تتفق عليه المصادر، وما تختلف عليه، وما لم يتحقق. لا نعرض الادعاء كحقيقة، ولا نحذف الاختلاف لأنه غير مريح.</p>
  <div class="index-stats"><div><b>${counts.agreement}</b><span>نقطة اتفاق</span></div><div><b>${counts.difference}</b><span>نقطة اختلاف</span></div><div><b>${counts.unverified}</b><span>ادعاء غير متحقق</span></div></div>
  ${renderSuiteNav("/dossier/claims.html")}
</div></section>
<section class="wrap index-body" data-suite data-suite-unit="ادعاء">
  ${suiteFilters(list, [
    { label: "تصفية حسب حالة الادعاء", buttons: [["all", "الكل", "data-suite-type", true], ["unverified", "غير متحقق", "data-suite-type", false], ["difference", "اختلاف", "data-suite-type", false], ["agreement", "اتفاق", "data-suite-type", false]] },
    { label: "تصفية حسب الملف", buttons: [["all", "كل الملفات", "data-suite-dossier", true], ...list.map((d) => [d.slug, d.shortTitle, "data-suite-dossier", false])] },
  ])}
  <p class="muted" data-suite-count role="status" aria-live="polite">${items.length} ادعاء</p>
  <div class="cards suite-cards claim-grid">${cards}</div>
  <p class="empty" data-suite-empty hidden>لا توجد ادعاءات مطابقة لهذا الاختيار.</p>
  <section class="index-note"><h2>معنى الحالات</h2><p><strong>اتفاق:</strong> نقاط تتفق عليها المصادر المراجعة. <strong>اختلاف:</strong> روايات متعارضة أو تفسيرات مختلفة، نعرضها بأصحابها. <strong>غير متحقق:</strong> ادعاء متداول لا يكفي دليله الحالي، ونبقيه ظاهراً لأن إخفاءه قد يخلق ثقة زائفة.</p><a href="/balance.html">ميزان الروايات حسب الخبر</a></section>
</section>`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "ميزان الادعاءات — WRLDLINE",
    description: "ادعاءات مصنفة إلى اتفاق واختلاف وغير متحقق من ملفات الأحداث الحية.",
    url: canonical,
    inLanguage: "ar",
    hasPart: items.slice(0, 50).map((i) => ({ "@type": "Claim", name: i.text.slice(0, 140), url: `${ORIGIN}${i.url}` })),
  }).replace(/</g, "\\u003c");
  return pageShell({ title: "ميزان الادعاءات | WRLDLINE", description: "ما تتفق عليه المصادر وما تختلف عليه وما لم يتحقق، من ملفات الأحداث الحية.", canonical, body, jsonLd, bodyClass: "dossier-index dossier-suite", activeNav: "/dossier/claims.html" });
}

function renderImpact(list, items, now) {
  const canonical = `${ORIGIN}/dossier/impact.html`;
  const actual = items.filter((i) => i.type === "actual").length;
  const potential = items.filter((i) => i.type === "potential").length;
  const cards = items.map((i) => `<article class="card impact-card" data-suite-item data-type="${attr(i.type)}" data-dossier="${attr(i.dossier)}">
      <div class="card-top"><span class="impact-badge ${i.type === "actual" ? "impact-actual" : "impact-potential"}">${i.type === "actual" ? "أثر فعلي" : "أثر محتمل"}</span><span class="muted">${esc(i.dossierTitle)}</span></div>
      <p>${esc(i.text)}</p>
      <div class="card-foot">${sourceLinks(i.sourceRefs, i.sourceMap)}<a href="${attr(i.url)}">الملف ←</a></div>
    </article>`).join("");
  const body = `
<section class="index-hero"><div class="wrap">
  <span class="kicker">DOSSIER IMPACT · أثر الملفات</span>
  <h1>الأثر الفعلي… والاحتمال الذي لا نقدّمه كواقع</h1>
  <p class="lead">نجمع ما وثّقته المصادر من أثر فعلي على السعودية والخليج، ونفصله عن الأثر المحتمل. الاحتمال سيناريو مبني على دليل، وليس تنبؤاً ولا توصية.</p>
  <div class="index-stats"><div><b>${actual}</b><span>أثر فعلي موثق</span></div><div><b>${potential}</b><span>أثر محتمل</span></div><div><b>${list.length}</b><span>ملفاً</span></div></div>
  ${renderSuiteNav("/dossier/impact.html")}
</div></section>
<section class="wrap index-body" data-suite data-suite-unit="أثر">
  ${suiteFilters(list, [
    { label: "تصفية حسب نوع الأثر", buttons: [["all", "الكل", "data-suite-type", true], ["actual", "أثر فعلي", "data-suite-type", false], ["potential", "أثر محتمل", "data-suite-type", false]] },
    { label: "تصفية حسب الملف", buttons: [["all", "كل الملفات", "data-suite-dossier", true], ...list.map((d) => [d.slug, d.shortTitle, "data-suite-dossier", false])] },
  ])}
  <p class="muted" data-suite-count role="status" aria-live="polite">${items.length} أثراً</p>
  <div class="cards suite-cards impact-card-grid">${cards}</div>
  <p class="empty" data-suite-empty hidden>لا توجد آثار مطابقة لهذا الاختيار.</p>
  <section class="index-note"><h2>حدود القراءة</h2><p>«أثر فعلي» يعني أن المصدر وثّق تغيراً حدث بالفعل: رسوم شحن، توقف عبور، رقم سعر، أو قرار. «أثر محتمل» يعني ما قد يترتب على استمرار الوضع، وهو سيناريو لا ضمان. لا نستخدم هذه الصفحة لتوصية استثمارية أو تأمينية.</p><a href="/impact.html">أطلس التأثير التفاعلي</a></section>
</section>`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "أثر الملفات — WRLDLINE",
    description: "أثر فعلي ومحتمل للأحداث على السعودية والخليج، بمصادر موثقة.",
    url: canonical,
    inLanguage: "ar",
    hasPart: items.slice(0, 50).map((i) => ({ "@type": "CreativeWork", name: i.text.slice(0, 140), url: `${ORIGIN}${i.url}` })),
  }).replace(/</g, "\\u003c");
  return pageShell({ title: "أثر الملفات | WRLDLINE", description: "أثر فعلي موثق وأثر محتمل للأحداث على السعودية والخليج، مع المصادر.", canonical, body, jsonLd, bodyClass: "dossier-index dossier-suite", activeNav: "/dossier/impact.html" });
}

function renderDigest(list, now) {
  const canonical = `${ORIGIN}/dossier/digest.html`;
  const nowISO = new Date(now).toISOString();
  const weekStart = now - 7 * 86400000;
  const recent = [];
  for (const d of list) {
    for (const c of d.whatChanged) {
      if (Date.parse(c.at) >= weekStart) recent.push({ ...c, dossier: d });
    }
  }
  recent.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const fallback = list.flatMap((d) => d.whatChanged.slice(0, 1).map((c) => ({ ...c, dossier: d }))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const changes = (recent.length ? recent : fallback).slice(0, 8);
  const top = list.find((d) => d.status === "active") || list[0];
  const watch = collectWatch(list, now).filter((i) => i.timing !== "undated").slice(0, 5);
  const unverified = collectClaims(list).filter((i) => i.type === "unverified").slice(0, 4);
  const active = list.filter((d) => d.status === "active");
  const changeItems = changes.map((c) => `<li><time datetime="${attr(c.at)}">${esc(arabicDate(c.at))}</time><div><a href="/dossier/${attr(c.dossier.slug)}.html">${esc(c.dossier.shortTitle)}</a><p>${esc(c.text)}</p></div></li>`).join("");
  const watchItems = watch.map((w) => `<li><span class="when">${esc(w.when)}${w.approximate ? " <em>تقديري</em>" : ""}</span><div><a href="${attr(w.url)}">${esc(w.what)}</a><p>${esc(w.why)}</p></div></li>`).join("");
  const unverifiedItems = unverified.map((u) => `<li><p>${esc(u.text)}</p><a href="${attr(u.url)}">${esc(u.dossierTitle)} ←</a></li>`).join("");
  const activeCards = active.map((d) => `<a class="digest-card" href="/dossier/${attr(d.slug)}.html"><span class="status status-${attr(d.status)}"><span class="dot" aria-hidden="true"></span>${esc(STATUS[d.status].label)}</span><strong>${esc(d.title)}</strong><span class="muted">آخر تحديث ${esc(arabicDate(d.updatedAt))}</span></a>`).join("");
  const body = `
<section class="index-hero"><div class="wrap">
  <span class="kicker">WEEKLY DOSSIER DIGEST</span>
  <h1>موجز الملفات</h1>
  <p class="lead">ما تغيّر في ملفات الأحداث هذا الأسبوع، وما نراقبه بعد ذلك، وما بقي غير متحقق. موجز واحد لمن لا يريد متابعة التحديثات لحظة بلحظة.</p>
  <div class="index-stats"><div><b>${esc(arabicDate(nowISO))}</b><span>تاريخ الإصدار</span></div><div><b>${active.length}</b><span>ملف نشط</span></div><div><b>${changes.length}</b><span>تطوراً في الموجز</span></div></div>
  ${renderSuiteNav("/dossier/digest.html")}
</div></section>
<section class="wrap index-body digest-body">
  <article class="digest-feature">
    <span class="kicker">ملف الأسبوع</span>
    <h2><a href="/dossier/${attr(top.slug)}.html">${esc(top.title)}</a></h2>
    <p>${esc(top.summary)}</p>
    <div class="hero-meta"><span><b>الحالة</b> ${esc(STATUS[top.status].label)}</span><span><b>آخر تحديث</b> ${esc(arabicDate(top.updatedAt))}</span><span><b>المصادر</b> ${top.sources.length}</span></div>
    <a class="btn btn-primary" href="/dossier/${attr(top.slug)}.html">افتح الملف</a>
  </article>
  <section class="digest-section"><h2>ما تغيّر هذا الأسبوع</h2><ol class="digest-list">${changeItems || '<li class="empty">لا توجد تحديثات مؤرخة في هذه النافذة.</li>'}</ol></section>
  <section class="digest-section"><h2>ما نراقبه بعد ذلك</h2><ol class="digest-list">${watchItems || '<li class="empty">لا توجد بنود متابعة موسومة بموعد أو مؤشر مستمر.</li>'}</ol><p><a href="/dossier/watchlist.html">كل ما نراقبه ←</a></p></section>
  <section class="digest-section"><h2>ما بقي غير متحقق</h2><ul class="digest-unverified">${unverifiedItems || '<li class="empty">لا توجد ادعاءات معلقة في هذا الإصدار.</li>'}</ul><p><a href="/dossier/claims.html">ميزان الادعاءات ←</a></p></section>
  <section class="digest-section"><h2>الملفات النشطة</h2><div class="digest-grid">${activeCards}</div></section>
  <section class="digest-cta"><h2>تصلك هذه الملفات أولاً</h2><p>اشترك في نشرة WRLDLINE لتصلك ملفات الأحداث والتطورات المهمة، مع تأكيد بريدك قبل أي إرسال.</p><a class="btn btn-primary" href="/newsletter.html">اشترك في النشرة</a></section>
</section>`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "موجز ملفات الأحداث — WRLDLINE",
    description: "ملخص أسبوعي لما تغيّر في ملفات الأحداث وما نراقبه وما لم يتحقق.",
    datePublished: nowISO,
    dateModified: nowISO,
    inLanguage: "ar",
    url: canonical,
    author: { "@type": "Organization", name: "WRLDLINE", url: ORIGIN },
    publisher: { "@type": "Organization", name: "WRLDLINE", url: ORIGIN, logo: { "@type": "ImageObject", url: `${ORIGIN}/favicon.svg` } },
  }).replace(/</g, "\\u003c");
  return pageShell({ title: "موجز الملفات الأسبوعي | WRLDLINE", description: "ما تغيّر في ملفات الأحداث هذا الأسبوع، وما نراقبه، وما بقي غير متحقق.", canonical, body, jsonLd, bodyClass: "dossier-index dossier-suite", activeNav: "/dossier/digest.html" });
}


function renderReview(list, now) {
  const canonical = `${ORIGIN}/dossier/review.html`;
  const meta = list.map((d) => ({ slug: d.slug, title: d.title, shortTitle: d.shortTitle, keywords: d.keywords, status: d.status }));
  const rows = list.map((d) => `<li><a href="/dossier/${attr(d.slug)}.html">${esc(d.title)}</a><span>${d.keywords.length} كلمة ربط · ${esc(STATUS[d.status].label)}</span></li>`).join("");
  const body = `
<section class="index-hero"><div class="wrap">
  <span class="kicker">EDITORIAL REVIEW QUEUE · داخلي</span>
  <h1>طابور مراجعة تحديثات الملفات</h1>
  <p class="lead">أداة للمحرر، لا للقارئ: تقارن آخر الأخبار المنشورة بكلمات كل ملف حدث، وتعرض المرشحات التي قد تستحق تحديثاً. لا يضيف النظام شيئاً إلى الملف تلقائياً؛ القرار تحريري، وكل إضافة تحتاج مصدراً وتاريخاً.</p>
  <div class="index-stats"><div><b>${list.length}</b><span>ملفاً للمطابقة</span></div><div><b>${list.reduce((n, d) => n + d.keywords.length, 0)}</b><span>كلمة ربط</span></div><div><b>80</b><span>آخر خبر يُفحص</span></div></div>
</div></section>
<section class="wrap index-body review-body">
  <div class="suite-intro"><p>المرشح ليس تحديثاً. راجع الخبر، تحقق من المصدر وتاريخه، ثم أضفه إلى الملف يدوياً إن كان يستحق. الأخبار غير المطابقة لا تظهر.</p><div class="suite-actions"><a class="btn" href="/dossier/">كل الملفات</a><a class="btn" href="/about.html#dossiers">منهجية الملفات</a></div></div>
  <div class="review-controls">
    <label>الملف <select id="reviewDossier"><option value="all">كل الملفات</option>${list.map((d) => `<option value="${attr(d.slug)}">${esc(d.shortTitle)}</option>`).join("")}</select></label>
    <label>أقل عدد كلمات مطابقة <select id="reviewMin"><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option></select></label>
    <button type="button" class="btn" id="reviewRefresh">تحديث القائمة</button>
    <span class="muted" id="reviewStatus" role="status" aria-live="polite">جارٍ تحميل الأخبار…</span>
  </div>
  <div class="cards suite-cards" id="reviewList"></div>
  <p class="empty" id="reviewEmpty" hidden>لا توجد مرشحات مطابقة بهذه الشروط الآن.</p>
  <section class="index-note"><h2>الملفات وكلماتها</h2><ul class="review-keywords">${rows}</ul><p class="muted">تُحدَّث الكلمات يدوياً في ملفات JSON. لا تُستخدم المطابقة كدليل على وجود صلة؛ هي مجرد إشارة للمراجعة.</p></section>
</section>
<script type="application/json" id="reviewDossiers">${JSON.stringify(meta).replace(/</g, "\\u003c")}</script>`;
  return pageShell({ title: "طابور مراجعة تحديثات الملفات | WRLDLINE", description: "أداة تحريرية لمطابقة الأخبار الجديدة بكلمات ملفات الأحداث.", canonical, body, jsonLd: JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: "طابور مراجعة تحديثات الملفات", url: canonical, inLanguage: "ar", isAccessibleForFree: true }), bodyClass: "dossier-index dossier-suite dossier-review", activeNav: "/dossier/", extraHead: '<meta name="robots" content="noindex,nofollow"><script src="/review.js?v=20261119-1" defer></script>' });
}

function renderWatchlistJson(items, now) {
  return JSON.stringify({ updatedAt: new Date(now).toISOString(), count: items.length, items }, null, 2) + "\n";
}
function renderClaimsJson(items, now) {
  return JSON.stringify({ updatedAt: new Date(now).toISOString(), count: items.length, claims: items.map(({ sourceMap, ...rest }) => ({ ...rest, sources: rest.sourceRefs.map((ref) => { const s = sourceMap.get(ref); return s ? { publisher: s.publisher, url: s.url } : null; }).filter(Boolean) })) }, null, 2) + "\n";
}
function renderImpactJson(items, now) {
  return JSON.stringify({ updatedAt: new Date(now).toISOString(), count: items.length, impacts: items.map(({ sourceMap, ...rest }) => ({ ...rest, sources: rest.sourceRefs.map((ref) => { const s = sourceMap.get(ref); return s ? { publisher: s.publisher, url: s.url } : null; }).filter(Boolean) })) }, null, 2) + "\n";
}

function icsEscape(value = "") {
  return String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function renderIcs(items, now) {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events = items.filter((i) => i.timing === "dated" && i.date).map((i) => {
    const start = i.date.replace(/-/g, "");
    const endDate = new Date(Date.parse(i.date) + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    const summary = `${i.approximate ? "[تقديري] " : ""}${i.what}`;
    return `BEGIN:VEVENT
UID:${i.id}@wrldline
DTSTAMP:${stamp}
DTSTART;VALUE=DATE:${start}
DTEND;VALUE=DATE:${endDate}
SUMMARY:${icsEscape(summary)}
DESCRIPTION:${icsEscape(`${i.why}\nالموعد كما ورد في الملف: ${i.when}\nالملف: ${ORIGIN}/dossier/${i.dossier}.html`)}
URL:${ORIGIN}${i.url}
CATEGORIES:${icsEscape(i.sectors.join(","))}
${i.approximate ? "X-WRLDLINE-APPROXIMATE:TRUE\n" : ""}END:VEVENT`;
  }).join("\n");
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//WRLDLINE//Watchlist//AR
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:WRLDLINE — ما نراقبه
X-WR-CALDESC:مواعيد ومؤشرات من ملفات الأحداث الحية. المواعيد التقديرية موسومة.
X-WR-TIMEZONE:Asia/Riyadh
${events}
END:VCALENDAR
`;
}

function updateRootSitemap(list) {
  const file = path.join(ROOT, "sitemap.xml");
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, "utf8");
  const start = "  <!-- DOSSIERS:START -->";
  const end = "  <!-- DOSSIERS:END -->";
  const block = [start, `  <url><loc>${ORIGIN}/dossier/</loc></url>`, ...SUITE_PAGES.map(([href]) => `  <url><loc>${ORIGIN}${href}</loc></url>`), ...list.map((d) => `  <url><loc>${ORIGIN}/dossier/${d.slug}.html</loc></url>`), end].join("\n");
  let next;
  if (source.includes(start) && source.includes(end)) {
    next = source.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block);
  } else {
    next = source.replace("</urlset>", `${block}\n</urlset>`);
  }
  fs.writeFileSync(file, next, "utf8");
}

function build({ quiet = false } = {}) {
  if (!fs.existsSync(CONTENT_DIR)) throw new DossierError("مجلد content/dossiers غير موجود.");
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".json")).sort();
  if (!files.length) throw new DossierError("لا توجد ملفات JSON لبنائها.");
  const list = files.map((f) => validate(JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), "utf8")), f));
  const slugs = new Set();
  for (const d of list) {
    if (slugs.has(d.slug)) throw new DossierError(`slug مكرر: ${d.slug}`);
    slugs.add(d.slug);
  }
  const rank = { active: 0, monitoring: 1, closed: 2 };
  list.sort((a, b) =>
    (b.priority - a.priority) ||
    ((rank[a.status] ?? 3) - (rank[b.status] ?? 3)) ||
    (Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  );
  const now = Math.max(...list.map((d) => Date.parse(d.updatedAt)));
  const watch = collectWatch(list, now);
  const claims = collectClaims(list);
  const impacts = collectImpact(list);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const d of list) fs.writeFileSync(path.join(OUT_DIR, `${d.slug}.html`), renderDossier(d, now), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), renderIndex(list, now), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "index.json"), renderIndexJson(list), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "feed.xml"), renderFeed(list), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "sitemap.xml"), renderSitemap(list), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "watchlist.html"), renderWatchlist(list, watch, now), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "claims.html"), renderClaims(list, claims, now), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "impact.html"), renderImpact(list, impacts, now), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "digest.html"), renderDigest(list, now), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "review.html"), renderReview(list, now), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "watchlist.json"), renderWatchlistJson(watch, now), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "claims.json"), renderClaimsJson(claims, now), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "impact.json"), renderImpactJson(impacts, now), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "watchlist.ics"), renderIcs(watch, now), "utf8");
  updateRootSitemap(list);
  if (!quiet) {
    console.log(`Built ${list.length} dossiers:`);
    for (const d of list) console.log(`  /dossier/${d.slug}.html  (${d.sources.length} sources, ${d.timeline.length} timeline items)`);
  }
  return list;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    build();
  } catch (error) {
    console.error("DOSSIER_BUILD_FAILED:", error.message);
    process.exitCode = 1;
  }
}

export { build, validate, renderDossier, renderIndex, renderFeed, renderSitemap, renderWatchlist, renderClaims, renderImpact, renderDigest, renderWatchlistJson, renderClaimsJson, renderImpactJson, renderIcs, renderReview, parseWhen, collectWatch, collectClaims, collectImpact, DossierError };
