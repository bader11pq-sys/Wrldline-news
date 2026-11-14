/* WRLDLINE HISTORY — shared header, footer, icon sprite */
(() => {
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
      <a class="wl-brand" href="index.html" aria-label="WRLDLINE — الرئيسية"><span class="wl-brand-mark">W</span><span class="wl-brand-copy"><strong>WRLDLINE</strong><small>GLOBAL NEWS NETWORK</small></span></a>
      <div class="wl-head-actions">
        <button class="wl-icon-btn wl-mobile-menu" id="menuButton" type="button" aria-label="فتح القائمة" aria-expanded="false" aria-controls="mainNav"><svg aria-hidden="true"><use href="#i-menu"/></svg></button>
        <a class="wl-icon-btn" href="index.html" aria-label="الرئيسية"><svg aria-hidden="true"><use href="#i-home"/></svg></a>
        <a class="wl-icon-btn" href="history.html" aria-label="الموسوعة"><svg aria-hidden="true"><use href="#i-book"/></svg></a>
        <button class="wl-icon-btn" id="themeButton" type="button" aria-label="تبديل المظهر"><svg aria-hidden="true"><use href="#i-moon"/></svg></button>
        <a class="wl-account" href="index.html#account"><svg aria-hidden="true"><use href="#i-user"/></svg> حسابي</a>
      </div>
    </div>
    <div class="wl-nav-wrap" id="mainNav"><nav class="wl-nav" aria-label="التنقل الرئيسي"><div class="wl-nav-scroll">
      <a class="wl-nav-link" href="index.html">الرئيسية</a>
      <a class="wl-nav-link" href="context.html">غرفة السياق</a>
      <a class="wl-nav-link" href="balance.html">ميزان الروايات</a>
      <a class="wl-nav-link" href="impact.html">أطلس التأثير</a>
      <a class="wl-nav-link" href="history.html">الموسوعة التاريخية</a>
      <a class="wl-nav-link" href="mirror.html">مرآة التاريخ</a>
      <a class="wl-nav-link" href="explainers.html">افهمها في دقيقة</a>
      <a class="wl-nav-link" href="promises.html">ذاكرة الوعود</a>
      <a class="wl-nav-link" href="history-library.html">المكتبة</a>
    </div></nav></div>
  </div>
  <div class="hx-read-progress"><i id="readProgress"></i></div>
</header>`;

  const footer = `<footer class="site-footer">
  <div class="wl-container">
    <div class="footer-main">
      <div><a class="wl-brand footer-brand" href="index.html"><span class="wl-brand-mark">W</span><span class="wl-brand-copy"><strong>WRLDLINE</strong><small>GLOBAL NEWS NETWORK</small></span></a><p class="footer-about">منصة إخبارية رقمية تضع العالم في سياقه: تغطية متعددة المصادر، أدوات للمقارنة والفهم، وموسوعة تاريخية مرجعية مفتوحة.</p></div>
      <div class="footer-col"><h3>غرف الأخبار</h3><a href="index.html">الرئيسية</a><a href="context.html">غرفة السياق</a><a href="balance.html">ميزان الروايات</a><a href="impact.html">أطلس التأثير</a></div>
      <div class="footer-col"><h3>المعرفة</h3><a href="history.html">الموسوعة التاريخية</a><a href="mirror.html">مرآة التاريخ</a><a href="explainers.html">افهمها في دقيقة</a><a href="promises.html">ذاكرة الوعود</a></div>
      <div class="footer-col"><h3>الموسوعة</h3><a href="history-explore.html">الأطلس</a><a href="history-compare.html">المقارنة</a><a href="history-library.html">المكتبة</a><a href="about.html">عن الموقع</a></div>
    </div>
    <div class="footer-bottom"><span>© <span data-year>2026</span> WRLDLINE NEWS — المحتوى الإخباري يُنسب إلى مصادره الأصلية.</span><span>التحليلات والسياق من تحرير WRLDLINE.</span></div>
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
})();
