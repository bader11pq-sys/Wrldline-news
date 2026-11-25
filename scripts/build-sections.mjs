/* Generates sections.html from site-sections.js.
 * Run: node scripts/build-sections.mjs
 * The page is static HTML so it is indexable and works without JavaScript;
 * the language switch is progressive enhancement.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const registry = require("../site-sections.js");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const esc = value => String(value).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const bi = (ar, en, tag = "span") => `<${tag} lang="ar">${ar}</${tag}><${tag} lang="en">${en}</${tag}>`;

function link(item, className = "") {
  return `<a class="${className}" href="${esc(item.href)}" data-section-link>${bi(esc(item.ar), esc(item.en))}</a>`;
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


// The six coverage priorities that predate the registry stay on this page as a
// supplementary reading path; they are not separate desks and keep their anchors.
function priorities() {
  const desk = (id, num, ar, en, note, links) => `<section class="hn-desk" id="${id}"><span aria-hidden="true">${num}</span><div>
    <h2>${ar}</h2><p class="sec-priority-en" lang="en">${en}</p><p>${note}</p>
    <nav aria-label="${ar}">${links}</nav>
  </div></section>`;
  const a = (href, ar, en) => `<a href="${href}">${bi(ar, en)}</a>`;
  return `<section class="sec-priorities" id="coverage-priorities" aria-labelledby="coverage-priorities-heading">
  <div class="sec-section-head"><h2 id="coverage-priorities-heading">${bi("أولويات التغطية", "Coverage priorities")}</h2>
    <p>${bi("ستة مسارات تحريرية تخدم الصحيفة منذ إطلاقها، مرتبطة بأقسامها الرئيسية. وجودها هنا لا يعني أنها أقسام مستقلة.", "Six editorial priorities the paper has followed since launch, each tied to its main desk. Their presence here does not make them separate desks.")}</p></div>
  <div class="hn-desks">
    ${desk("politics-economy", "01", "السياسة والعلاقات الدولية", "Politics and international relations", "قرارات الحكومات والانتخابات والدبلوماسية، وما تعنيه التطورات الدولية للمنطقة.", a("/section/politics", "أخبار السياسة", "Politics news") + a("/section/world", "أخبار العالم", "World news") + a("/section/security", "الأمن والدفاع", "Security and defence"))}
    ${desk("rights", "02", "الحقوق والحريات", "Rights and freedoms", "الحريات المدنية والسياسية والعدالة والقانون. نفرّق بين النص القانوني وتطبيقه، وبين الاتهام والحكم.", '<span id="justice-law" aria-hidden="true"></span>' + a("/section/rights", "أخبار الحقوق والحريات", "Rights news") + a("rights.html", "مكتب الحقوق والحريات", "Rights desk") + a("rights-cases/index.html", "ملفات القضايا", "Case files"))}
    ${desk("economy", "03", "الاقتصاد والطاقة والتجارة", "Economy, energy and trade", "النفط والغاز والشحن والأسعار والعمل. نتابع أثر القرارات الاقتصادية على كلفة المعيشة والتجارة.", a("/section/economy", "أخبار الاقتصاد", "Economy news") + a("/dossier/opec-plus-december-2026.html#reader-brief", "ملف أوبك+", "OPEC+ dossier") + a("/originals/saudi-ports-2025.html", "تحليل الموانئ السعودية", "Saudi ports analysis"))}
    ${desk("people-society", "04", "المجتمع والثقافة والشؤون الشبابية", "Society, culture and youth", "التعليم والعمل والصحة والثقافة، وكيف تؤثر هذه القضايا في فرص الشباب وحياتهم اليومية.", a("/section/society", "أخبار المجتمع", "Society news") + a("/section/culture", "الثقافة", "Culture") + a("/section/health", "الصحة", "Health") + a("/section/sports", "الرياضة", "Sport"))}
    ${desk("world", "05", "الخليج والعالم العربي", "The Gulf and the Arab world", "مختارات من تغطية المنطقة، من القرارات التي تمسّ سكانها إلى أثر الأحداث الإقليمية على بلدانها.", a("index.html?country=SAU#newsSection", "أخبار السعودية", "Saudi news") + a("dossier/bab-al-mandab-2026.html", "ملف باب المندب", "Bab al-Mandab dossier") + a("rights-cases/jordan-expression.html", "ملف حرية التعبير في الأردن", "Jordan expression case") + a("/dossier/watchlist.html", "متابعة التطورات الإقليمية", "Regional watchlist"))}
    ${desk("tech-science", "06", "التقنية والعلوم وتأثيرها على المنطقة", "Technology, science and the region", "البحث العلمي والذكاء الاصطناعي والبنية الرقمية، مع توضيح ما تثبته النتائج وما تعنيه للمنطقة.", a("/section/tech", "أخبار التقنية", "Tech news") + a("/section/science", "أخبار العلوم", "Science news") + a("context.html#ai-governance", "خلفية: حوكمة الذكاء الاصطناعي", "Background: AI governance"))}
  </div>
  <div class="hn-note sec-note"><span id="investigations" aria-hidden="true"></span><span id="rights-knowledge" aria-hidden="true"></span>
    <h3>${bi("التحقيقات والتوثيق والمعرفة الحقوقية", "Investigations, documentation and rights knowledge")}</h3>
    <p>${bi("تخدم هذه المسارات أكثر من قسم.", "These paths serve more than one desk.")} <a href="/originals/">${bi("إنتاج الصحيفة الأصلي", "Original journalism")}</a> · <a href="analysis.html">${bi("مكتب الفهم والتحليل", "Analysis desk")}</a> · <a href="rights.html#rightsGuides">${bi("الأدلة الحقوقية المبسّطة", "Plain-language rights guides")}</a></p>
  </div>
</section>`;
}

const nav = [
  ["index.html#newsSection", "الأخبار", "News"],
  ["sections.html", "الأقسام", "Sections"],
  ["daily-briefing.html", "الملخص اليومي", "Daily Briefing"],
  ["history.html", "الموسوعة التاريخية", "Historical Encyclopedia"],
  ["analysis.html", "الفهم والتحليل", "Analysis"]
].map(([href, ar, en]) => `<a href="${href}"${href === "sections.html" ? ' aria-current="page"' : ""}>${bi(ar, en)}</a>`).join("");

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
  <link rel="stylesheet" href="sections.css?v=20261126-2">
  <link rel="stylesheet" href="/quality.css?v=quality-1">
</head>
<body class="sections-page">
  <a class="sec-skip" href="#sectionsMain">${bi("تجاوز إلى المحتوى", "Skip to content")}</a>
  <header class="sec-bar"><div class="sec-wrap sec-bar-inner">
    <a class="sec-wordmark" href="index.html"><span lang="en" dir="ltr">WRLDLINE <span class="sec-period">News</span></span></a>
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
        <a href="news/">${bi("أرشيف الأخبار", "News archive")}</a>
      </nav>
    </header>

    <section aria-labelledby="news-sections-heading" id="news-sections">
      <div class="sec-section-head"><h2 id="news-sections-heading">${bi("الأقسام الإخبارية الرئيسية", "Main news sections")}</h2>
        <p>${bi("كل قسم رئيسي له صفحة أخبار مستقلة، وأقسامه الفرعية صفحات حقيقية أيضاً. الأقسام الفرعية لا تتكرّر كأقسام رئيسية.", "Every main desk has its own news page, and its subsections are real pages too. Subsections are never repeated as main desks.")}</p></div>
      <div class="sec-grid">${registry.NEWS_SECTIONS.map(newsCard).join("\n")}</div>
    </section>

    ${priorities()}

    <section aria-labelledby="knowledge-sections-heading" id="knowledge-sections">
      <div class="sec-section-head"><h2 id="knowledge-sections-heading">${bi("المعرفة والتحليل", "Knowledge & analysis")}</h2>
        <p>${bi("مسارات تحريرية تخدم أكثر من قسم: الملخص اليومي، الموسوعة التاريخية، وأدوات السياق والبيانات.", "Editorial products that serve more than one desk: the Daily Briefing, the Historical Encyclopedia, and the context and data tools.")}</p></div>
      <div class="sec-groups">${registry.KNOWLEDGE_GROUPS.map(knowledgeGroup).join("\n")}</div>
    </section>

    <section class="sec-note" aria-labelledby="sec-note-heading">
      <h2 id="sec-note-heading">${bi("كيف تُبنى هذه الخريطة؟", "How this map is built")}</h2>
      <p>${bi("مصدر واحد لخريطة الأقسام يغذّي هذه الصفحة وشريط التنقّل وصفحات الأقسام، لذا تظهر الشجرة نفسها بالعربية والإنجليزية. تُحوَّل الروابط القديمة مثل /section/energy و/section/ai إلى القسم الذي يغطيها بدل أن تصبح أقساماً مكرّرة.", "A single section registry feeds this page, the navigation and the section pages, so the same tree appears in Arabic and English. Legacy links such as /section/energy and /section/ai redirect to the desk that covers them instead of becoming duplicate sections.")}</p>
    </section>
  </main>
  <footer class="sec-footer"><div class="sec-wrap"><span lang="en" dir="ltr">WRLDLINE News</span><nav aria-label="Policies"><a href="about.html">${bi("عن الموقع", "About")}</a><a href="corrections.html">${bi("التصحيحات", "Corrections")}</a><a href="privacy.html">${bi("الخصوصية", "Privacy")}</a><a href="contact.html">${bi("التواصل", "Contact")}</a></nav></div></footer>
  <script src="language.js?v=20261126-sections" defer></script>
  <script src="sections.js?v=20261126-1" defer></script>
</body>
</html>
`;

writeFileSync(join(root, "sections.html"), html);
console.log("sections.html written:", html.length, "bytes");
