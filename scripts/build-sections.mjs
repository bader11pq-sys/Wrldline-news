/* Generates sections.html from site-sections.js.
 * Run: node scripts/build-sections.mjs
 * The page is static HTML so it is indexable and works without JavaScript;
 * the language switch is progressive enhancement.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const registry = require("../site-sections.js");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const esc = value => String(value).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/* The editorial standards and corrections pages have English editions that the
 * language switch resolves through data-editorial-page. */
const EDITORIAL_PAGES = { "about.html": "about", "corrections.html": "corrections" };
const editorialAttr = item => {
  const page = EDITORIAL_PAGES[item.href.split("#")[0]];
  return page ? ` data-editorial-page="${page}"` : "";
};
const bi = (ar, en, tag = "span") => `<${tag} lang="ar">${ar}</${tag}><${tag} lang="en">${en}</${tag}>`;

function link(item, className = "") {
  return `<a class="${className}" href="${esc(item.href)}"${editorialAttr(item)} data-section-link>${bi(esc(item.ar), esc(item.en))}</a>`;
}

function newsCard(section, index) {
  const subs = section.children.length
    ? `<ul class="sec-sub">${section.children.map(child => `<li>${link(child)}<span class="sec-note">${bi(esc(child.arNote), esc(child.enNote))}</span></li>`).join("")}</ul>`
    : `<p class="sec-note sec-single">${bi("تغطية مستقلة داخل القسم، مع ملفات المناخ والطاقة في الاقتصاد.", "Standalone coverage, with climate and energy files alongside the economy desk.")}</p>`;
  return `<article class="sec-card" id="desk-${esc(section.key)}">
  <div class="sec-card-head"><span class="sec-num" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
    <h2>${link(section, "sec-title")}</h2></div>
  <p class="sec-intro">${bi(esc(section.arIntro), esc(section.enIntro))}</p>
  ${subs}
</article>`;
}

function knowledgeGroup(group) {
  return `<section class="sec-group" id="group-${esc(group.key)}">
  <div class="sec-group-head"><h3>${bi(esc(group.ar), esc(group.en))}</h3><p>${bi(esc(group.arIntro), esc(group.enIntro))}</p></div>
  <ul class="sec-links">${group.items.map(item => `<li>${link(item, "sec-link")}<span>${bi(esc(item.arNote), esc(item.enNote))}</span></li>`).join("")}</ul>
</section>`;
}


const nav = registry.pick(registry.PRIMARY_NAV)
  .map(item => `<a href="${esc(item.href)}"${item.key === "sections" ? ' aria-current="page"' : ""}>${bi(esc(item.ar), esc(item.en))}</a>`).join("");

const groupSection = (group, headingId) => `<section class="sec-group-block" aria-labelledby="${headingId}" id="${esc(group.key)}">
  <div class="sec-section-head"><h2 id="${headingId}">${bi(esc(group.ar), esc(group.en))}</h2><p>${bi(esc(group.arIntro), esc(group.enIntro))}</p></div>
  <ul class="sec-links sec-links--wide">${group.items.map(item => `<li><a class="sec-link" href="${esc(item.href)}"${editorialAttr(item)} data-section-link>${bi(esc(item.ar), esc(item.en))}</a><span>${bi(esc(item.arNote), esc(item.enNote))}</span></li>`).join("")}</ul>
</section>`;

const footerNav = registry.SITE_GROUP.items
  .map(item => `<a href="${esc(item.href)}"${editorialAttr(item)}>${bi(esc(item.ar), esc(item.en))}</a>`).join("");

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="description" content="أقسام WRLDLINE News كاملة: السياسة والعالم، الاقتصاد والطاقة، الحقوق والحريات، التقنية والعلوم، المجتمع والثقافة والرياضة، البيئة والمناخ، إضافة إلى الملخص اليومي والموسوعة التاريخية وأدوات الفهم والبيانات.">
  <link rel="canonical" href="https://al-ghaib.us.ci/sections.html">
  <link rel="alternate" hreflang="ar" href="https://al-ghaib.us.ci/sections.html">
  <link rel="alternate" hreflang="x-default" href="https://al-ghaib.us.ci/sections.html">
  <meta property="og:locale" content="ar_AR">
  <meta property="og:title" content="أقسام WRLDLINE News">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <title>أقسام الصحيفة | WRLDLINE News</title>
  <link rel="stylesheet" href="sections.css?v=20261126-3">
  <link rel="stylesheet" href="/quality.css?v=quality-1">
</head>
<body class="sections-page">
  <a class="sec-skip" href="#sectionsMain">${bi("تجاوز إلى المحتوى", "Skip to content")}</a>
  <header class="sec-bar"><div class="sec-wrap sec-bar-inner">
    <a class="sec-wordmark" href="index.html" aria-label="WRLDLINE News"><span lang="en" dir="ltr">WRLDLINE <span class="sec-period">News</span></span></a>
    <nav class="sec-nav" aria-label="Site">${nav}</nav>
  </div></header>
  <main class="sec-wrap" id="sectionsMain" tabindex="-1">
    <header class="sec-hero">
      <p class="sec-kicker">${bi("خريطة الصحيفة", "The newspaper map")}</p>
      <h1>${bi("كل الأقسام في مكان واحد.", "Every section in one place.")}</h1>
      <p class="sec-deck">${bi("ستة أقسام إخبارية رئيسية، يتبع كل قسم أقسامه الفرعية، إضافة إلى مسارات المعرفة والتحليل. لا قسم مكرّر ولا محتوى بديل.", "Six main news desks, each with its real subsections, plus the knowledge and analysis desks. No duplicate sections and no placeholder content.")}</p>
      <nav class="sec-jump" aria-label="Jump">
        <a href="#news-sections">${bi("الأقسام الإخبارية", "News sections")}</a>
        <a href="#knowledge-sections">${bi("المعرفة والتحليل", "Knowledge & analysis")}</a>
        <a href="#tools">${bi("البيانات والخرائط", "Data & maps")}</a>
        <a href="#services">${bi("خدمات القارئ", "Reader services")}</a>
        <a href="news/">${bi("أرشيف الأخبار", "News archive")}</a>
      </nav>
    </header>

    <section aria-labelledby="news-sections-heading" id="news-sections">
      <div class="sec-section-head"><h2 id="news-sections-heading">${bi("الأقسام الإخبارية الرئيسية", "Main news sections")}</h2>
        <p>${bi("كل قسم رئيسي له صفحة أخبار مستقلة، وأقسامه الفرعية صفحات حقيقية أيضاً. الأقسام الفرعية لا تتكرّر كأقسام رئيسية.", "Every main desk has its own news page, and its subsections are real pages too. Subsections are never repeated as main desks.")}</p></div>
      <div class="sec-grid">${registry.NEWS_SECTIONS.map(newsCard).join("\n")}</div>
    </section>


    <section aria-labelledby="knowledge-sections-heading" id="knowledge-sections">
      <div class="sec-section-head"><h2 id="knowledge-sections-heading">${bi("المعرفة والتحليل", "Knowledge & analysis")}</h2>
        <p>${bi("مسارات تحريرية تخدم أكثر من قسم: الملخص اليومي، الموسوعة التاريخية، وأدوات السياق والبيانات.", "Editorial products that serve more than one desk: the Daily Briefing, the Historical Encyclopedia, and the context and data tools.")}</p></div>
      <div class="sec-groups">${registry.KNOWLEDGE_GROUPS.map(knowledgeGroup).join("\n")}</div>
    </section>

    ${groupSection(registry.TOOL_GROUP, "tools-heading")}
    ${groupSection(registry.SERVICE_GROUP, "services-heading")}
    ${groupSection(registry.SITE_GROUP, "site-heading")}

    <section class="sec-note" aria-labelledby="sec-note-heading">
      <h2 id="sec-note-heading">${bi("كيف تُبنى هذه الخريطة؟", "How this map is built")}</h2>
      <p>${bi("مصدر واحد لخريطة الأقسام يغذّي هذه الصفحة وشريط التنقّل وصفحات الأقسام، لذا تظهر الشجرة نفسها بالعربية والإنجليزية. تُحوَّل الروابط القديمة مثل /section/energy و/section/ai إلى القسم الذي يغطيها بدل أن تصبح أقساماً مكرّرة.", "A single section registry feeds this page, the navigation and the section pages, so the same tree appears in Arabic and English. Legacy links such as /section/energy and /section/ai redirect to the desk that covers them instead of becoming duplicate sections.")}</p>
    </section>
  </main>
  <footer class="sec-footer"><div class="sec-wrap"><span lang="en" dir="ltr">WRLDLINE News</span><nav aria-label="Policies">${footerNav}</nav></div></footer>
  <script src="language.js?v=20261126-sections" defer></script>
  <script src="sections.js?v=20261126-1" defer></script>
</body>
</html>
`;

writeFileSync(join(root, "sections.html"), html);
console.log("sections.html written:", html.length, "bytes");

/* The homepage ships the same navigation server-side so it works before (and
 * without) JavaScript. site-nav.js repaints the identical hrefs at runtime. */
const hrefFor = item => esc(item.href);
const staticNav = registry.pick(registry.PRIMARY_NAV)
  .map(item => `<a href="${hrefFor(item)}" class="wl-nav-link" data-section-link>${bi(esc(item.ar), esc(item.en))}</a>`).join("");
const staticMore = registry.pick(registry.MORE_MENU)
  .map(item => `<a href="${hrefFor(item)}"><span class="wl-more-icon"><svg aria-hidden="true"><use href="#i-${item.key === "daily-briefing" ? "sun" : item.key === "history" ? "book" : item.key === "map" ? "map" : item.key === "markets" ? "chart" : item.key === "shorts" ? "layers" : item.key === "for-you" ? "user" : item.key === "context-room" ? "compass" : "spark"}"/></svg></span><span>${bi(esc(item.ar), esc(item.en))}<small>${bi(esc(item.arNote), esc(item.enNote))}</small></span></a>`).join("");
const staticFooter = registry.FOOTER_COLUMNS.map(column => `<div class="footer-col"><h3>${bi(esc(column.ar), esc(column.en))}</h3>${registry.pick(column.items).map(item => `<a href="${esc(item.href)}"${editorialAttr(item)}>${bi(esc(item.ar), esc(item.en))}</a>`).join("")}</div>`).join("");

const indexPath = join(root, "index.html");
let indexHtml = readFileSync(indexPath, "utf8");
const inject = (html, marker, inner) => {
  const pattern = new RegExp(`(<!--registry:${marker}-->)[\\s\\S]*?(<!--/registry:${marker}-->)`);
  if (!pattern.test(html)) throw new Error(`index.html is missing the registry:${marker} marker`);
  return html.replace(pattern, `$1${inner}$2`);
};
indexHtml = inject(inject(inject(indexHtml, "primary", staticNav), "more", staticMore), "footer", staticFooter);
writeFileSync(indexPath, indexHtml);
console.log("index.html navigation prerendered");

/* The public worker renders its own HTML, so it cannot read the browser
 * registry at runtime. Export the same registry data as a generated module:
 * one source of truth, checked for freshness by tests/site-navigation.test.cjs. */
const workerData = {
  version: registry.VERSION,
  routes: registry.SECTION_ROUTES,
  primary: registry.pick(registry.PRIMARY_NAV),
  more: registry.pick(registry.MORE_MENU),
  footer: registry.FOOTER_COLUMNS
};
writeFileSync(
  join(root, "cloudflare/workers/wrldline-public/sections.generated.js"),
  `/* GENERATED FILE - do not edit. Source: site-sections.js (${registry.VERSION}).\n * Regenerate with: node scripts/build-sections.mjs */\nexport const SECTION_ROUTES = ${JSON.stringify(workerData.routes, null, 2)};\nexport const PRIMARY_NAV = ${JSON.stringify(workerData.primary, null, 2)};\nexport const MORE_MENU = ${JSON.stringify(workerData.more, null, 2)};\nexport const FOOTER_COLUMNS = ${JSON.stringify(workerData.footer, null, 2)};\nexport const REGISTRY_VERSION = ${JSON.stringify(workerData.version)};\n`
);
console.log("worker registry module written");
