"use strict";
const { readFileSync, writeFileSync, mkdirSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const ORIGIN = "https://al-ghaib.us.ci";
const STATUS = {
  documented: ["موثّق", "وثيقة أو سجل قابل للمراجعة يثبت هذه المعلومة في حدود محددة."],
  corroborated: ["مدعوم بمصادر متعددة", "مصادر مستقلة تدعم المعلومة نفسها. تكرار تقرير واحد لا يضيف إسنادًا مستقلًا."],
  checking: ["قيد التحقق", "معلومة ناقصة أو سؤال مفتوح يحتاج إلى مراجعة إضافية."],
  unverified: ["ادعاء لم يتسنَّ التحقق منه", "قول منسوب إلى طرف لم تثبته الأدلة المتاحة. عدم التحقق ليس نفيًا."],
  official: ["نفي أو رد رسمي", "نثبت صدور الرد عن قائله وننسبه إليه. الرد لا يحسم صحة الادعاء."],
  closed: ["أُغلق الملف أو تغيّرت ظروف القضية", "هذه حالة متابعة لا درجة تحقق. نذكر سببها وتاريخها ونبقي سجل التغييرات مقروءًا."]
};
const STATE = {
  reference: "ملف مرجعي مؤرّخ",
  tracking: "المتابعة مفتوحة",
  closed: STATUS.closed[0],
  changed: STATUS.closed[0]
};
const token = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = x => typeof x === "string" && x.trim().length > 0;
const parseDate = x => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
const escaped = x => String(x).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const demand = (valid, message) => { if (!valid) throw new Error(message); };
const time = date => `<time class="hn-time" datetime="${escaped(date)}" dir="ltr">${escaped(date)}</time>`;
const badge = (key, label) => `<span class="hn-badge" data-kind="${escaped(key)}">${escaped(label)}</span>`;

function validate(entries) {
  demand(Array.isArray(entries) && entries.length, "Expected an array of dossiers");
  const slugs = new Set();
  for (const entry of entries) {
    const {slug, type, timeline, sources, claims, responses, state, updated, checkedThrough} = entry;
    const check = (valid, message) => demand(valid, `${slug}: ${message}`);
    check(text(slug) && token.test(slug) && !slugs.has(slug) && slug !== "index", "invalid or reused slug");
    slugs.add(slug);
    check(["reference", "case", "example"].includes(type), "unknown dossier type");
    check((slug.startsWith("example-")) === (type === "example"), "example slugs must be distinguishable");
    check(Object.hasOwn(STATE, state) && (type !== "case" || state !== "reference") && (type !== "reference" || state === "reference"), "invalid follow-up state");
    for (const key of ["title","deck","place","authority","legal","impact","next"]) check(text(entry[key]), `missing ${key}`);
    if (type !== "example") check(text(entry.topic), "missing index topic");
    check(parseDate(updated) && parseDate(checkedThrough) && checkedThrough <= updated, "invalid review or editorial date");
    if (["closed", "changed"].includes(state)) {
      check(text(entry.stateReason) && parseDate(entry.stateDate) && entry.stateDate <= checkedThrough, "missing closure or change reason/date");
    }
    check(Array.isArray(sources) && sources.length, "missing source register");
    const found = new Set();
    const urls = new Set();
    for (const src of sources) {
      check(typeof src.id === "string" && token.test(src.id) && !found.has(src.id), "invalid or reused source ID");
      found.add(src.id);
      for (const key of ["title","kind","note"]) check(text(src[key]), `source ${src.id} missing ${key}`);
      if (type === "example") check(!Object.hasOwn(src, "url"), "example sources may not link out");
      else {
        const url = URL.canParse(src.url) ? new URL(src.url) : null;
        check(url && url.protocol === "https:" && !url.username && !url.password && !urls.has(url.href), `unsafe or repeated URL (${src.id})`);
        urls.add(url.href);
      }
    }
    check(Array.isArray(timeline) && timeline.length, "missing chronology");
    check(Array.isArray(claims) && claims.length, "missing verification table");
    check(Array.isArray(responses), "record responses or explicitly use []");
    let previous = "";
    for (const step of timeline) {
      check(parseDate(step.date) && step.date >= previous && step.date <= checkedThrough, "invalid date or chronology");
      previous = step.date;
    }
    for (const row of [...timeline, ...claims, ...responses]) {
      check(text(row.text) && Array.isArray(row.refs) && new Set(row.refs).size === row.refs.length && row.refs.every(k => found.has(k)), "missing text or invalid source reference");
    }
    for (const claim of claims) {
      check(["documented","corroborated","checking","unverified"].includes(claim.status), "invalid claim status");
      const required = claim.status === "corroborated" ? 2 : claim.status === "checking" ? 0 : 1;
      check(claim.refs.length >= required, "not enough sources for the claim label");
    }
    for (const row of responses) check(row.refs.length > 0, "official replies must be attributed");
  }
  return entries;
}

function frame(title, description, filename, content, opts = {}) {
  const path = filename === "index.html" ? "/rights-cases/" : `/rights-cases/${filename}`;
  return `<!doctype html>
<!-- Generated by scripts/build-rights-cases.cjs. Edit editorial-data/rights-cases.json. -->
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="referrer" content="no-referrer">
  ${opts.example ? '<meta name="robots" content="noindex,follow">' : `<link rel="canonical" href="${ORIGIN}${path}">`}
  <meta name="description" content="${escaped(description)}">
  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../rights-desk.css?v=human-news-1">
  <link rel="stylesheet" href="../human-news.css?v=premium-1">
  <script src="../rights-cases.js?v=premium-1" defer></script>
  <title>${escaped(title)} | WRLDLINE News</title>
</head>
<body class="hn-cases">
  <a class="rd-skip" href="#caseMain">تجاوز إلى المحتوى</a>
  <header class="rd-bar"><div class="rd-wrap rd-bar-inner">
    <a class="rd-wordmark" href="../index.html" aria-label="ورلدلاين نيوز، الرئيسية"><span lang="en" dir="ltr">WRLDLINE <span class="rd-period">News</span></span></a>
    <nav class="rd-nav" aria-label="تنقّل الصحيفة"><a href="../index.html#newsSection">الأخبار</a><a href="../sections.html">الأقسام</a><a href="index.html"${opts.index ? ' aria-current="page"' : ""}>ملفات القضايا</a></nav>
  </div></header>
  <main class="rd-wrap hn-page" id="caseMain" tabindex="-1">
${content}
  </main>
  <footer class="rd-footer"><div class="rd-wrap"><span lang="en" dir="ltr">WRLDLINE News</span><nav aria-label="سياسات الصحيفة"><a href="../about.html#mission">الرؤية والرسالة</a><a href="../corrections.html">التصحيحات وحق الرد</a><a href="../privacy.html">الخصوصية</a></nav></div></footer>
</body>
</html>
`;
}

function dossier(entry) {
  const example = entry.type === "example";
  const refs = ids => ids.length
    ? `<div class="hn-refs"><span>الإسناد:</span>${ids.map(id => {
      const src = entry.sources.find(source => source.id === id);
      return `<a href="#source-${escaped(id)}">${escaped(src.title)}</a>`;
    }).join("")}</div>` : "";
  const last = entry.timeline.at(-1);
  const review = entry.type === "reference"
    ? "هذه قراءة تاريخية للمواد المشار إليها، وليست تحريًا عن الوضع القانوني الراهن."
    : entry.type === "case"
      ? "النطاق يبيّن ما أمكن مراجعته حتى التاريخ المذكور، ولا يعكس تطورات لاحقة تلقائيًا."
      : "كل ما في هذه الصفحة افتراضي؛ لا تُستخدم التواريخ أو الأوصاف لتعيين قضية فعلية.";
  const sources = entry.sources.map(src => `<li id="source-${escaped(src.id)}"><span class="hn-source-type">${escaped(src.kind)}</span>${src.url ? `<a class="hn-source-link" href="${escaped(src.url)}" rel="noreferrer">${escaped(src.title)}</a>` : `<strong>${escaped(src.title)}</strong>`}<p>${escaped(src.note)}</p></li>`).join("\n          ");
  const content = `    <header class="hn-head">
      <p class="rd-kicker">${example ? "مثال تعليمي، ليس خبرًا" : entry.type === "reference" ? "دفتر الدليل / ملف مرجعي مؤرّخ" : "دفتر الدليل / ملف قضية حقوقية"}</p>
      <h1>${escaped(entry.title)}</h1>
      <p class="rd-deck">${escaped(entry.deck)}</p>
    </header>${example ? '\n    <p class="hn-note"><strong>تنبيه:</strong> هذه قضية افتراضية؛ لا توجد هنا أسماء أو جهات أو وقائع حقيقية.</p>' : ""}
    <nav class="hn-jumps hn-case-nav" aria-label="داخل الملف"><a href="#impact">الأثر على الناس</a><a href="#timeline">التسلسل الزمني</a><a href="#evidence">الأدلة</a><a href="#sources">المصادر</a><a href="#followup">المتابعة</a></nav>
    <div class="hn-layout">
      <aside class="hn-sidebar" aria-labelledby="basics"><h2 id="basics">المعلومات الأساسية</h2>
        <dl><dt>الدولة أو النطاق</dt><dd>${escaped(entry.place)}</dd><dt>الجهة المعنية</dt><dd>${escaped(entry.authority)}</dd>
          <dt>بداية التسلسل في الملف</dt><dd>${time(entry.timeline[0].date)}</dd><dt>الوضع القانوني المعروف</dt><dd>${escaped(entry.legal)}</dd>
          <dt>نطاق الأدلة حتى</dt><dd>${time(entry.checkedThrough)}</dd><dt>آخر تحديث تحريري</dt><dd>${time(entry.updated)}</dd></dl>
      </aside>
      <div class="hn-body">
        <section class="hn-panel" id="impact" tabindex="-1"><h2>ماذا يعني للناس؟</h2><p>${escaped(entry.impact)}</p></section>
        <section class="hn-panel" id="timeline" tabindex="-1"><h2>التسلسل الزمني</h2><ol class="hn-list">
          ${entry.timeline.map(row => `<li>${time(row.date)}<p>${escaped(row.text)}</p>${refs(row.refs)}</li>`).join("\n          ")}
        </ol></section>
        <section class="hn-panel" id="evidence" tabindex="-1"><h2>الأدلة والمصادر</h2>
          <p>الوسم يصف المعلومة المحددة، لا الملف كله. <a href="index.html#labels">معاني الوسوم</a></p>
          <ul class="hn-list">${entry.claims.map(row => `<li>${badge(row.status, STATUS[row.status][0])}<p>${escaped(row.text)}</p>${refs(row.refs)}</li>`).join("\n          ")}</ul>
        </section>
        <section class="hn-panel" id="sources" tabindex="-1"><h2>سجل المصادر</h2><ul class="hn-list">
          ${sources}
        </ul></section>
        <section class="hn-panel" id="followup" tabindex="-1"><h2>المتابعة</h2>
          <dl class="hn-follow">
            <dt>وضع الملف</dt><dd>${badge(entry.state, STATE[entry.state])} ${escaped(review)}${entry.stateReason ? ` ${time(entry.stateDate)}: ${escaped(entry.stateReason)}` : ""}</dd>
            <dt>آخر تطور في نطاق الملف</dt><dd>${time(last.date)}<p>${escaped(last.text)}</p>${refs(last.refs)}</dd>
            <dt>النفي أو الردود الرسمية</dt><dd>${entry.responses.length ? `<ul class="hn-list">${entry.responses.map(row => `<li>${badge("official", STATUS.official[0])}<p>${escaped(row.text)}</p>${refs(row.refs)}</li>`).join("")}</ul>` : "لم ندرج ردًا منسوبًا هنا؛ غياب الرد لا يحسم الادعاء."}</dd>
            <dt>ما الذي يحتاج إلى تحقق؟</dt><dd>${escaped(entry.next)}</dd>
          </dl>
        </section>
      </div>
    </div>
    <nav class="hn-foot-nav" aria-label="متابعة القراءة"><a href="index.html">العودة إلى الملفات</a><a href="../rights.html#rightsGuides">دليل الحقوق</a><a href="../corrections.html">التصحيح وحق الرد</a></nav>`;
  return frame(entry.title, entry.deck, `${entry.slug}.html`, content, {example});
}

function index(entries) {
  const title = "ملفات القضايا الحقوقية";
  const description = "ملفات حقوقية مستقلة: ما حدث، الأثر على الناس، ما تثبته المصادر، وما يستحق المتابعة.";
  const examples = entries.filter(x => x.type === "example");
  const published = entries.filter(x => x.type !== "example");
  const topics = [...new Set(published.map(x => x.topic))];
  const content = `    <header class="hn-head">
      <p class="rd-kicker">دفتر الدليل / الأخبار من أجل الإنسان</p>
      <h1>${title}</h1>
      <p class="rd-deck">${description}</p>
      <nav class="hn-jumps" aria-label="داخل دفتر الدليل"><a href="#files">الملفات المنشورة</a><a href="#labels">وسوم التحقق</a><a href="../rights.html#rightsGuides">دليل الحقوق</a></nav>
    </header>
    <section id="files" tabindex="-1" aria-labelledby="filesTitle">
    <h2 class="hn-shelf-title" id="filesTitle">الملفات المنشورة</h2>
    <div class="hn-filter" hidden>
      <div><label for="caseSearch">ابحث في الملفات</label><input type="search" id="caseSearch" placeholder="اسم الملف أو البلد" autocomplete="off"></div>
      <div><label for="caseTopic">الموضوع</label><select id="caseTopic"><option value="">كل المواضيع</option>${topics.map(topic => `<option>${escaped(topic)}</option>`).join("")}</select></div>
      <button type="button" id="caseReset" disabled>مسح البحث</button>
    </div>
    <p class="hn-results" id="caseResults" role="status"></p>
    <p class="hn-note" id="caseEmpty" hidden>لا توجد ملفات تطابق بحثك. جرّب كلمة أخرى أو امسح البحث.</p>
    <div class="hn-cards">
      ${published.map(x => `<article class="hn-card" data-topic="${escaped(x.topic)}">
        <p class="rd-kicker">${escaped(x.topic)} · ${x.type === "case" ? "قضية حقوقية" : "ملف مرجعي"}</p><h3><a href="${escaped(x.slug)}.html">${escaped(x.title)}</a></h3>
        <p class="hn-card-place">${escaped(x.place)}</p>
        <p>${escaped(x.deck)}</p><small>نطاق الأدلة حتى ${time(x.checkedThrough)}</small>
      </article>`).join("\n      ")}
    </div>
    </section>
    ${examples.length ? `<aside class="hn-note"><strong>كيف يبدو ملف متابعة قضية؟</strong> ${examples.map(x => `<a href="${escaped(x.slug)}.html">${escaped(x.title)}</a>`).join(" · ")}. أمثلة للتعلّم، وليست بلاغات أو وقائع منشورة.</aside>` : ""}
    <section class="hn-labels" id="labels" aria-labelledby="labelTitle"><h2 id="labelTitle">كيف نسمّي درجة التحقق؟</h2>
      <dl>${Object.entries(STATUS).map(([key,[label,note]]) => `<div><dt>${badge(key,label)}</dt><dd>${escaped(note)}</dd></div>`).join("\n        ")}</dl>
    </section>`;
  return frame(title, description, "index.html", content, {index:true});
}

function build(checkOnly = false) {
  const entries = validate(JSON.parse(readFileSync(join(ROOT, "editorial-data", "rights-cases.json"), "utf8")));
  const out = join(ROOT, "rights-cases");
  const files = new Map([["index.html", index(entries)], ...entries.map(e => [`${e.slug}.html`, dossier(e)])]);
  const sitemapPath = join(ROOT, "sitemap.xml");
  const current = readFileSync(sitemapPath, "utf8");
  const start = "  <!-- RIGHTS CASES:START -->", end = "  <!-- RIGHTS CASES:END -->";
  const block = [start, `  <url><loc>${ORIGIN}/rights-cases/</loc></url>`,
    ...entries.filter(e => e.type !== "example").map(e => `  <url><loc>${ORIGIN}/rights-cases/${e.slug}.html</loc><lastmod>${e.updated}</lastmod></url>`), end].join("\n");
  const next = current.includes(start) && current.includes(end)
    ? current.replace(/  <!-- RIGHTS CASES:START -->[\s\S]*?  <!-- RIGHTS CASES:END -->/, block)
    : current.replace("</urlset>", `${block}\n</urlset>`);
  if (checkOnly) {
    demand(next === current, "Rights dossier sitemap is stale");
    for (const [file, body] of files) demand(readFileSync(join(out, file), "utf8") === body, `Stale ${file}`);
    demand(readdirSync(out).filter(x => x.endsWith(".html")).every(x => files.has(x)), "Unregistered dossier page");
  } else {
    mkdirSync(out, {recursive:true});
    for (const [file, body] of files) writeFileSync(join(out, file), body);
    if (next !== current) writeFileSync(sitemapPath, next);
  }
  return entries.length;
}

if (require.main === module) console.log(`${build(process.argv.includes("--check"))} rights dossiers validated`);
module.exports = { build, validate, dossier };
