/* WRLDLINE HISTORY — shared header, footer, icon sprite */
(() => {
  const stored = localStorage.getItem("wrldline:language");
  const urlLang = new URLSearchParams(location.search).get("lang");
  const lang = (urlLang === "ar" || urlLang === "en") ? urlLang : ((stored === "ar" || stored === "en") ? stored : "ar");
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.dataset.lang = lang;
  const copy = {
    ar: {
      brandHome: "WRLDLINE — الرئيسية", menu: "فتح القائمة", home: "الرئيسية", encyclopedia: "الموسوعة", theme: "تبديل المظهر", account: "حسابي",
      navHome: "الرئيسية", shorts: "▶ Shorts", context: "غرفة السياق", balance: "ميزان الروايات", impact: "أطلس التأثير", history: "الموسوعة التاريخية", mirror: "مرآة التاريخ", explainers: "افهمها في دقيقة", promises: "ذاكرة الوعود", library: "المكتبة",
      about: "منصة إخبارية رقمية تضع العالم في سياقه: تغطية متعددة المصادر، أدوات للمقارنة والفهم، وموسوعة تاريخية مرجعية مفتوحة.",
      newsrooms: "غرف الأخبار", knowledge: "المعرفة", encyclopediaCol: "الموسوعة", atlas: "الأطلس", compare: "المقارنة", aboutLink: "عن الموقع",
      copyright: "© <span data-year>2026</span> WRLDLINE NEWS — المحتوى الإخباري يُنسب إلى مصادره الأصلية.", editorial: "التحليلات والسياق من تحرير WRLDLINE."
    },
    en: {
      brandHome: "WRLDLINE — Home", menu: "Open menu", home: "Home", encyclopedia: "Encyclopedia", theme: "Toggle appearance", account: "My account",
      navHome: "Home", shorts: "▶ Shorts", context: "Context Room", balance: "Narrative Balance", impact: "Impact Atlas", history: "History Encyclopedia", mirror: "History Mirror", explainers: "Explained in a minute", promises: "Promise Ledger", library: "Library",
      about: "A digital newsroom that puts the world in context: multi-source coverage, comparison and understanding tools, and an open reference history encyclopedia.",
      newsrooms: "Newsrooms", knowledge: "Knowledge", encyclopediaCol: "Encyclopedia", atlas: "Atlas", compare: "Compare", aboutLink: "About",
      copyright: "© <span data-year>2026</span> WRLDLINE NEWS — News content is attributed to its original sources.", editorial: "Analysis and context by WRLDLINE editorial."
    }
  };
  const t = (key) => copy[lang][key] || copy.ar[key];
  const sprite = `<svg class="wl-sr" aria-hidden="true"><defs>
<symbol id="i-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></symbol>
<symbol id="i-home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/></symbol>
<symbol id="i-book" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/></symbol>
<symbol id="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></symbol>
<symbol id="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></symbol>
<symbol id="i-user" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></symbol>
<symbol id="i-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></symbol>
<symbol id="i-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></symbol>
<symbol id="i-map" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3z"/><path d="M9 3v15M15 6v15"/></symbol>
<symbol id="i-bookmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></symbol>
<symbol id="i-quote" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M9 7H5v6h4c0 3-2 5-4 5M19 7h-4v6h4c0 3-2 5-4 5"/></symbol>
<symbol id="i-print" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/></symbol>
<symbol id="i-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.3 10.8 7.4-3.6M8.3 13.2l7.4 3.6"/></symbol>
<symbol id="i-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></symbol>
<symbol id="i-scale" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 6h14M5 6 3 12h4zM19 6l-2 6h4z"/></symbol>
<symbol id="i-compare" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h7v12H4zM13 6h7v12h-7z"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
<symbol id="i-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18-3-3.5-3-14.5 0-18z"/></symbol>
<symbol id="i-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></symbol>
</defs></svg>`;

  const header = `<header class="wl-header" id="siteHeader">
  <div class="wl-container">
    <div class="wl-masthead">
      <a class="wl-brand" href="index.html" aria-label="${t("brandHome")}"><span class="wl-brand-mark">W</span><span class="wl-brand-copy"><strong>WRLDLINE</strong><small>GLOBAL NEWS NETWORK</small></span></a>
      <div class="wl-head-actions">
        <button class="wl-icon-btn wl-mobile-menu" id="menuButton" type="button" aria-label="${t("menu")}" aria-expanded="false" aria-controls="mainNav"><svg aria-hidden="true"><use href="#i-menu"/></svg></button>
        <a class="wl-icon-btn" href="index.html" aria-label="${t("home")}"><svg aria-hidden="true"><use href="#i-home"/></svg></a>
        <a class="wl-icon-btn" href="history.html" aria-label="${t("encyclopedia")}"><svg aria-hidden="true"><use href="#i-book"/></svg></a>
        <button class="wl-icon-btn" id="themeButton" type="button" aria-label="${t("theme")}"><svg aria-hidden="true"><use href="#i-moon"/></svg></button>
        <a class="wl-account" href="index.html#account"><svg aria-hidden="true"><use href="#i-user"/></svg> ${t("account")}</a>
      </div>
    </div>
    <div class="wl-nav-wrap" id="mainNav"><nav class="wl-nav" aria-label="${t("navHome")}"><div class="wl-nav-scroll">
      <a class="wl-nav-link" href="index.html">${t("navHome")}</a>
      <a class="wl-nav-link wl-nav-link--shorts" href="shorts.html">${t("shorts")}</a>
      <a class="wl-nav-link" href="context.html">${t("context")}</a>
      <a class="wl-nav-link" href="balance.html">${t("balance")}</a>
      <a class="wl-nav-link" href="impact.html">${t("impact")}</a>
      <a class="wl-nav-link" href="history.html">${t("history")}</a>
      <a class="wl-nav-link" href="mirror.html">${t("mirror")}</a>
      <a class="wl-nav-link" href="explainers.html">${t("explainers")}</a>
      <a class="wl-nav-link" href="promises.html">${t("promises")}</a>
      <a class="wl-nav-link" href="history-library.html">${t("library")}</a>
    </div></nav></div>
  </div>
  <div class="hx-read-progress"><i id="readProgress"></i></div>
</header>`;

  const footer = `<footer class="site-footer">
  <div class="wl-container">
    <div class="footer-main">
      <div><a class="wl-brand footer-brand" href="index.html"><span class="wl-brand-mark">W</span><span class="wl-brand-copy"><strong>WRLDLINE</strong><small>GLOBAL NEWS NETWORK</small></span></a><p class="footer-about">${t("about")}</p></div>
      <div class="footer-col"><h3>${t("newsrooms")}</h3><a href="index.html">${t("navHome")}</a><a href="context.html">${t("context")}</a><a href="balance.html">${t("balance")}</a><a href="impact.html">${t("impact")}</a></div>
      <div class="footer-col"><h3>${t("knowledge")}</h3><a href="history.html">${t("history")}</a><a href="mirror.html">${t("mirror")}</a><a href="explainers.html">${t("explainers")}</a><a href="promises.html">${t("promises")}</a></div>
      <div class="footer-col"><h3>${t("encyclopediaCol")}</h3><a href="history-explore.html">${t("atlas")}</a><a href="history-compare.html">${t("compare")}</a><a href="history-library.html">${t("library")}</a><a href="about.html">${t("aboutLink")}</a></div>
    </div>
    <div class="footer-bottom"><span>${t("copyright")}</span><span>${t("editorial")}</span></div>
  </div>
</footer>`;

  document.body.insertAdjacentHTML("afterbegin", sprite);
  const h = document.getElementById("siteHeader"); if (h) h.outerHTML = header;
  const f = document.getElementById("siteFooter"); if (f) f.outerHTML = footer;

  const page = location.pathname.split("/").pop() || "index.html";
  const map = { "history.html": "history.html", "history-explore.html": "history.html", "history-dossier.html": "history.html", "history-compare.html": "history.html", "history-library.html": "history-library.html", "context.html": "context.html", "balance.html": "balance.html", "impact.html": "impact.html", "promises.html": "promises.html", "mirror.html": "mirror.html", "explainers.html": "explainers.html" };
  const active = map[page];
  document.querySelectorAll(".wl-nav-link").forEach(a => {
    if (a.getAttribute("href") === active) { a.classList.add("is-active"); a.setAttribute("aria-current", "page"); }
  });
  document.addEventListener("wrldline:language", (event) => {
    const next = event && event.detail && event.detail.lang;
    if ((next === "ar" || next === "en") && next !== lang) location.reload();
  });
})();
