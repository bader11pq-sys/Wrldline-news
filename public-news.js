/* Public article editions enhance the original server-rendered page without replacing its canonical URL. */
(() => {
  "use strict";
  const article = document.querySelector("[data-public-article]");
  if (!article) return;
  const heading = article.querySelector("h1"), lead = article.querySelector("[data-reading-lead]");
  const summary = article.querySelector("[data-reading-body]") || article.querySelector(".public-news-summary");
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  if (!heading || !summary || !canonical || new URL(canonical).origin !== "https://al-ghaib.us.ci") return;
  const sourceLang = document.documentElement.lang, originalTitle = heading.textContent;
  let originalText;
  try {
    originalText = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent || "{}").articleBody;
  } catch { /* Fall back to the visible server markup. */ }
  if (typeof originalText !== "string") originalText = [lead, summary].filter(Boolean).flatMap(el =>
    [...el.querySelectorAll(":scope > :is(p,h3), :scope > ul > li")].map(row =>
      (row.tagName === "H3" ? "### " : row.tagName === "LI" ? "• " : "") + row.textContent)
  ).join("\n");
  const editorial = /^WRLDLINE(?: NEWS)?$/i.test((article.dataset.shareSource || "").trim());
  const disclosure = article.querySelector(".public-news-disclosure");
  const missingLead = article.querySelector("[data-reading-missing]");
  const trust = document.getElementById("articleTrust");
  if (trust) trust.dataset.editionView = "";
  const tools = document.createElement("div"), choices = document.createElement("div"), size = document.createElement("button");
  tools.className = "public-reading-tools";
  size.type = "button";
  function showSize(large) {
    article.classList.toggle("public-text-large", large);
    size.setAttribute("aria-pressed", String(large));
  }
  let large = false, lang = sourceLang.startsWith("en") ? "en" : "ar", shownURL = canonical, control, displayed;
  try { large = localStorage.getItem("wrldline:article-large-text") === "1"; } catch {}
  showSize(large);
  size.addEventListener("click", () => {
    large = !large;
    showSize(large);
    try { localStorage.setItem("wrldline:article-large-text", large ? "1" : "0"); } catch {}
  });
  tools.append(choices, size);
  summary.before(tools);
  const text = (ar, en) => lang === "en" ? en : ar;
  const shareButton = document.getElementById("publicNewsShare"), copyButton = document.getElementById("publicNewsCopy");
  const newsStatus = document.getElementById("publicNewsStatus");
  const permalink = article.querySelector(".public-news-actions a");
  const actions = permalink?.parentElement;
  const id = new URL(canonical).pathname.match(/^\/news\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i)?.[1];
  const report = id && actions ? document.createElement("a") : null;
  if (report) {
    report.dataset.articleCorrection = "";
    actions.append(report);
  }
  const trail = document.querySelector(".public-news-breadcrumb"), kicker = article.querySelector("[data-kicker-label]");
  const country = kicker?.dataset.kickerCountry || "";
  const chrome = [
    [".skip-link", "تجاوز إلى المحتوى", "Skip to content"],
    [".public-news-header .wl-account", "حسابي", "My account"],
    [".public-news-nav a[href='/'], .public-news-nav a[href='/?lang=en']", "غرفة الأخبار", "Newsroom"],
    [".public-news-nav a[href^='/news/'], .public-news-breadcrumb a[href^='/news/']", "الأخبار المنشورة", "Published news"],
    [".public-news-nav a[href='/sections.html']", "الأقسام", "Sections"],
    [".public-news-nav a[href='/analysis.html']", "الفهم والتحليل", "Analysis"],
    [".public-news-nav a[href='/sources.html']", "المصادر", "Sources"],
    [".public-news-correction :is(h2,h3)", "تصحيح منشور", "Published correction"],
    ["[data-reader-step=event] > h2", "ماذا حدث؟", "What happened?"],
    ["[data-reader-step=known] > h2", "ماذا نعرف؟", "What do we know?"],
    ["[data-reader-step=source] > h2", "ما المصدر؟", "What is the source?"],
    ["[data-reader-step=impact] > h2", "لماذا يهم؟", "Why does it matter?"],
    ["[data-reader-step=watch] > h2", "ما الذي نراقبه تالياً؟", "What to watch next?"],
    ["[data-reader-step=details] > h2", "تفاصيل إضافية ومراجع", "Further details and references"],
    ["[data-reading-missing]", "لا يتوفر ملخص منشور هنا. راجع المصدر أدناه.", "No published summary is available here. See the source below."],
    ["[data-source-missing]", "رابط المصدر الأصلي غير متوفر.", "The original source link is unavailable."],
    ["[data-primary-source=false] > a", "قراءة الخبر لدى المصدر الأصلي ↗", "Read at the original source ↗"],
    ["[data-primary-source=true] > a", "فتح المصدر الأولي ↗", "Open the primary source ↗"],
    ["[data-server-trust=confirmed] strong", "تأكيد تحريري بشري مسجل", "Human editorial confirmation recorded"],
    ["[data-server-trust=disputed] strong", "الخبر محل خلاف. راجع الأدلة والمصدر.", "Disputed. Consult the evidence and source."],
    ["[data-server-trust=unconfirmed] strong", "لم يُثبت تأكيد بشري في هذه الصفحة", "Human confirmation not established on this page"],
    ["[data-trust-note]", "وسم العاجل وتحليل الذكاء الاصطناعي وأعداد المصادر وحدها ليست تحققاً بشرياً.", "Breaking labels, AI analysis and source counts alone are not human verification."],
    ["[data-translation-review=reviewed]", "مراجعة بشرية للترجمة مسجلة.", "Human translation review recorded."],
    ["[data-translation-review=unconfirmed]", "لم تُثبت مراجعة بشرية للترجمة.", "Human translation review is not established."],
    ["[data-ai-reading]", "قراءة مساعدة بالذكاء الاصطناعي", "AI-assisted reading"],
    ["[data-ai-notice]", "سياق مساعد بالذكاء الاصطناعي مستند إلى نص الخبر المتاح؛ لا يُعد تحققاً بشرياً أو تنبؤاً أو نصيحة مالية شخصية.", "AI-assisted context based on the available article text. It is not human verification, a prediction, or personal financial advice."],
    [".pn-reading-evidence > summary", "سجل التحقق وروابط الأدلة", "Verification record and references"],
    ["#publicNewsShare", "مشاركة الخبر", "Share story"],
    ["#publicNewsCopy", "نسخ رابط الخبر", "Copy article link"],
  ];
  const prefixes = [
    ["تاريخ النشر: ", "Published: "], ["الكاتب: ", "By: "], ["المصدر الأصلي: ", "Original source: "]
  ];
  const meta = [...article.querySelectorAll(".public-news-meta span")].map(el => {
    const node = el.firstChild;
    const match = prefixes.find(pair => node?.nodeType === Node.TEXT_NODE && pair.some(prefix => node.textContent.startsWith(prefix)));
    return match ? { node, match, suffix: node.textContent.slice(match.find(prefix => node.textContent.startsWith(prefix)).length) } : null;
  }).filter(Boolean);
  function localize() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "en" ? "ltr" : "rtl";
    size.textContent = text("تكبير النص", "Larger text");
    for (const [selector, ar, en] of chrome) {
      document.querySelectorAll(selector).forEach(el => { el.textContent = text(ar, en); });
    }
    if (permalink) permalink.textContent = text("الرابط الدائم للخبر", "Permanent article link");
    if (report) {
      report.textContent = text("أبلغ عن خطأ", "Report an error");
      report.href = "/contact.html?" + new URLSearchParams({ topic: "correction", article: id.toLowerCase(), lang }) + "#form";
    }
    for (const [selector, stem, ar, en] of [
      [".public-news-nav", "about", "عن ورلدلاين", "About"],
      [".public-news-footer", "about", "السياسة التحريرية", "Editorial policy"],
      [".public-news-footer", "corrections", "التصحيحات", "Corrections"]
    ]) {
      const link = document.querySelector(selector + ' a[href^="/' + stem + '"]');
      if (link) { link.textContent = text(ar, en); link.href = "/" + stem + text("", "-en") + ".html"; }
    }
    for (const el of document.querySelectorAll(".public-news-nav a[href^='/news/'], .public-news-breadcrumb a[href^='/news/']")) el.href = "/news/?lang=" + lang;
    for (const el of document.querySelectorAll(".public-news-nav a[href^='/section/'], .public-news-breadcrumb a[href^='/section/']")) {
      const url = new URL(el.href);
      if (lang === "en") url.searchParams.set("lang", lang); else url.searchParams.delete("lang");
      el.href = url.pathname + url.search;
    }
    const category = window.WRLDLINE_TAXONOMY?.categoryName(article.dataset.category, lang);
    if (category) {
      const countryCode = window.WLEditorial?.eventCountryCode({event_country: country});
      const name = countryCode ? window.WLEditorial.countryName(countryCode, lang) : country;
      if (kicker) kicker.textContent = [category, name].filter(Boolean).join(" · ");
      if (trail?.lastChild?.nodeType === Node.TEXT_NODE) trail.lastChild.textContent = " / " + category;
    }
    for (const { node, match, suffix } of meta) node.textContent = text(...match) + suffix;
    for (const time of article.querySelectorAll("time[datetime]")) {
      const date = new Date(time.dateTime);
      if (Number.isFinite(+date)) time.textContent = new Intl.DateTimeFormat(lang, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
    }
    for (const [selector, ar, en] of [
      [".public-news-nav", "تصفح الأخبار", "News navigation"],
      [".public-news-breadcrumb", "مسار الصفحة", "Breadcrumb"],
      [".public-news-social", "مشاركة عبر الشبكات", "Share on social networks"]
    ]) document.querySelector(selector)?.setAttribute("aria-label", text(ar, en));
    if (newsStatus) newsStatus.textContent = "";
    control?.setUI(lang);
    if (displayed) view(displayed);
  }
  localize();
  function view(version) {
    displayed = version;
    if (missingLead) missingLead.hidden = !!version.body?.trim();
    if (disclosure) disclosure.textContent = version.editorialEdition
      ? text("هذه نسخة تحريرية راجعها محرر بشري.", "This editorial edition has been reviewed by a human editor.")
      : editorial && version.complete
        ? text("النص الكامل كما نشرته هيئة تحرير WRLDLINE.", "Full article as published by WRLDLINE.")
        : text("نعرض النص الأصلي المتاح، وقد توجد التفاصيل الكاملة والتحديثات لدى المصدر.", "This is the available original text. Full details and updates may be available at the source.");
    document.title = version.title + " | WRLDLINE NEWS";
    const editions = window.WLArticleEditions;
    shownURL = editions ? editions.link(canonical, editions.locale(version.lang)) : canonical;
    const snippet = version.body.slice(0, 500).trim().replace(/\s+/g, " ").slice(0, 160);
    article.dataset.shareTitle = version.title;
    article.dataset.shareText = snippet;
    article.dataset.shareUrl = shownURL;
    if (permalink) permalink.href = shownURL;
    const social = article.querySelectorAll(".public-news-social a");
    const url = encodeURIComponent(shownURL), title = encodeURIComponent(version.title);
    if (social.length === 3) {
      social[0].href = "https://wa.me/?text=" + encodeURIComponent(`${version.title} · ${snippet}`) + "%20" + url;
      social[1].href = "https://twitter.com/intent/tweet?text=" + title + "&url=" + url;
      social[2].href = "https://t.me/share/url?url=" + url + "&text=" + title;
    }
  }
  const prose = import("/reader-prose.js?v=20261123-reading-order");
  const body = import("/public-article-body.js?v=20261122-longread2");
  const editions = import("/article-editions.js?v=20261123-reading-order");
  void Promise.all([import("/taxonomy.js"), import("/editorial-display.js?v=20261122-metadata")]).then(localize).catch(() => {});
  Promise.all([prose, body, editions]).then(() => {
    const api = window.WLArticleEditions, explicit = api.requested(location.href);
    const preferred = explicit || api.stored() || api.locale(sourceLang);
    if (preferred) lang = preferred;
    localize();
    if (api.locale(sourceLang) !== lang) document.dispatchEvent(new CustomEvent("wrldline:language", { detail: { lang } }));
    control = api.mount({
      host: summary, lead, tools: choices, heading, id: article.dataset.articleId, title: originalTitle, body: originalText,
      lang: article.dataset.sourceLanguage || sourceLang, uiLang: lang, preferred,
      editorial, clip: window.WLPublicArticleBody.mayBeClipped(originalText, true), onView: view,
      onSelect(next) {
        lang = next;
        api.remember(next);
        const target = new URL(api.link(canonical, next));
        try { history.replaceState(history.state, "", target.pathname + target.hash); } catch {}
        localize();
        document.dispatchEvent(new CustomEvent("wrldline:language", { detail: { lang } }));
      }
    });
    window.addEventListener("hashchange", () => {
      const choice = api.requested(location.href);
      if (!choice || lang === choice) return;
      lang = choice;
      localize();
      void control.show(choice);
    });
  }).catch(() => { /* Original SSR content and links remain available. */ });
  shareButton?.addEventListener("click", () => {
    const data = { ...window.WRLDLINE_SHARE?.payloadFrom(article), url: shownURL, button: shareButton };
    if (window.WRLDLINE_SHARE) window.WRLDLINE_SHARE.share(data);
    else if (navigator.share) navigator.share({ title: heading.textContent, url: shownURL }).catch(() => {});
  });
  copyButton?.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(shownURL);
      if (newsStatus) newsStatus.textContent = text("نُسخ رابط الخبر.", "Article link copied.");
    } catch {
      window.prompt(text("انسخ رابط الخبر", "Copy article link"), shownURL);
    }
  });
})();
