/* WRLDLINE HOME — navigation, live desks, clocks, signal */
(() => {
  "use strict";
  const NR = window.WLNR;
  if (!NR) return;
  const data = NR.data;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- Navigation ---------- */
  const moreButton = $("#moreButton");
  const moreMenu = $("#moreMenu");
  const navWrap = $("#mainNav");
  const menuButton = $("#menuButton");
  const mobileNav = matchMedia("(max-width: 760px)");

  function closeNav() {
    navWrap?.classList.remove("is-open", "mobile-open");
    menuButton?.setAttribute("aria-expanded", "false");
  }

  function closeMore() {
    if (!moreMenu) return;
    moreMenu.classList.remove("is-open");
    moreButton?.setAttribute("aria-expanded", "false");
  }
  moreButton?.addEventListener("click", e => {
    e.stopPropagation();
    const open = moreMenu.classList.toggle("is-open");
    moreButton.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", e => {
    if (moreMenu && !moreMenu.contains(e.target) && !moreButton?.contains(e.target)) closeMore();
    if (navWrap?.classList.contains("mobile-open") && !navWrap.contains(e.target) && !menuButton?.contains(e.target)) closeNav();
  });
  menuButton?.addEventListener("click", () => {
    const open = navWrap.classList.toggle("is-open");
    navWrap.classList.toggle("mobile-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    if (open) navWrap.querySelector("a")?.focus();
  });
  navWrap?.addEventListener("click", e => {
    if (e.target.closest("a")) {
      closeMore();
      navWrap.classList.remove("is-open", "mobile-open");
      menuButton?.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
    if (moreMenu?.classList.contains("is-open")) { closeMore(); moreButton?.focus(); }
    else if (navWrap?.classList.contains("mobile-open")) { closeNav(); menuButton?.focus(); }
  });
  mobileNav.addEventListener("change", () => { closeMore(); closeNav(); });

  /* ---------- Reading progress & header state ---------- */
  const progress = $("#readProgress");
  const header = $("#siteHeader");
  let scrollFrame = 0;
  function onScroll() {
    scrollFrame = 0;
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? Math.min(100, (h.scrollTop / max) * 100) : 0;
    if (progress) progress.style.width = pct + "%";
    header?.classList.toggle("is-stuck", h.scrollTop > 8);
  }
  window.addEventListener("scroll", () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(onScroll); }, { passive: true });
  onScroll();

  /* ---------- World clock ---------- */
  const clocks = [
    ["الرياض", "Asia/Riyadh"],
    ["لندن", "Europe/London"],
    ["نيويورك", "America/New_York"],
    ["طوكيو", "Asia/Tokyo"],
    ["القاهرة", "Africa/Cairo"]
  ];
  function renderClocks() {
    const host = $("#worldClock");
    if (!host) return;
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    host.innerHTML = clocks.map(([city, tz]) => {
      let time = "—";
      try { time = fmt.format(new Date(new Date().toLocaleString("en-US", { timeZone: tz }))); } catch {}
      return '<div class="wl-clock-row"><span class="wl-clock-city"><i></i>' + city + '</span><span class="wl-clock-time">' + time + "</span></div>";
    }).join("");
  }
  renderClocks();
  setInterval(renderClocks, 30000);

  /* ---------- Helpers ---------- */
  function matches(article, keywords) {
    const text = (article.title || "") + " " + (article.summary || "");
    return keywords.some(k => text.includes(k));
  }
  function topArticles(articles, keywords, n = 1) {
    return articles.filter(a => matches(a, keywords)).slice(0, n);
  }
  function statusBadge(status) {
    const [label, cls] = NR.statusMeta(status);
    return '<span class="wl-status ' + cls + '">' + label + "</span>";
  }

  /* ---------- Desks rendering ---------- */
  function renderRooms(articles) {
    const counts = NR.categoryCounts(articles);
    $$("[data-room-count]").forEach(el => {
      const n = counts.get(el.dataset.roomCount) || 0;
      el.textContent = n ? n + " خبر" : "";
    });
  }

  function renderContext(articles) {
    const host = $("#contextGrid");
    if (!host) return;
    const items = data.context.slice(0, 3).map(d => {
      const live = topArticles(articles, d.keywords, 1)[0];
      const count = articles.filter(a => matches(a, d.keywords)).length;
      return { d, live, count };
    });
    host.innerHTML = items.map(({ d, live, count }) => {
      const step = d.known?.[0] || d.background?.[0] || "";
      return '<article class="wl-context-card">' +
        '<div class="wl-context-top"><span class="wl-context-tag">' + NR.escapeHTML(d.tag) + '</span><span class="wl-context-count">' + (count ? count + " خبر مرتبط" : "ملف مرجعي") + "</span></div>" +
        "<h3>" + NR.escapeHTML(d.title) + "</h3>" +
        "<p>" + NR.escapeHTML(d.dek) + "</p>" +
        '<div class="wl-context-steps">' +
          '<div class="wl-context-step"><b>الخلفية</b><span>' + NR.escapeHTML((d.background?.[0] || "").slice(0, 96)) + "…</span></div>" +
          '<div class="wl-context-step"><b>نراقب</b><span>' + NR.escapeHTML((d.watch?.[0] || "").slice(0, 96)) + "…</span></div>" +
        "</div>" +
        '<div class="wl-context-foot"><span>' + (live ? "آخر تطور: " + NR.timeAgo(live.published_at) : "سياق دائم") + '</span><a href="context.html#' + d.id + '">افتح الملف <svg width="12" height="12" aria-hidden="true"><use href="#i-arrow"/></svg></a></div>' +
      "</article>";
    }).join("");
  }

  function renderBalance(articles, feedStatus) {
    const host = $("#balancePreview");
    if (!host) return;
    if (!articles.length) {
      const english = window.wrldlineLang === "en";
      const title = feedStatus === "error" ? (english ? "The story sample is unavailable" : "تعذر تحميل عينة الأخبار")
        : (english ? "No story sample to compare yet" : "لا توجد عينة أخبار للمقارنة بعد");
      host.innerHTML = '<div class="wl-frame-card"><div class="wl-frame-head"><strong>' + title + '</strong></div><p>' +
        (english ? "The comparison needs headlines from more than one publisher." : "تحتاج المقارنة إلى عناوين من أكثر من ناشر.") + '</p></div>';
      return;
    }
    const clusters = NR.clusterArticles(articles, { minSources: 2, maxAgeH: 72 });
    const sourceCount = new Set(articles.map(a => a.raw?.source_name || a.source_name || a.raw?.source_domain || a.source_domain).filter(Boolean)).size;
    if (!clusters.length) {
      host.innerHTML = '<div class="wl-frame-card"><div class="wl-frame-head"><strong>لا توجد تغطيات كافية للحدث نفسه في العينة</strong></div><p>نقارن العناوين المتشابهة من ناشرين مختلفين، ولا تعني النتيجة عدم وجود تغطيات أخرى.</p></div>';
      return;
    }
    const c = clusters[0];
    const rows = c.framing.slice(0, 4).map(f =>
      '<div class="wl-frame-row"><div><h4>' + NR.escapeHTML(f.article.title) + '</h4><small>' + NR.escapeHTML(NR.sourceName(f.article)) + " · " + NR.timeAgo(f.article.published_at) + "</small></div>" +
      '<div class="wl-frame-meter" title="تمثيل نسبي داخل العينة"><i style="width:' + Math.max(18, Math.round(100 / Math.max(1, c.sourceCount))) + '%"></i></div></div>'
    ).join("");
    host.innerHTML = '<div class="wl-frame-card"><div class="wl-frame-head"><strong>' + NR.escapeHTML(c.articles[0].title.slice(0, 86)) + (c.articles[0].title.length > 86 ? '…' : '') + '</strong><span>' + c.sourceCount + " مصادر · " + c.articles.length + " عنوان</span></div>" + rows +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--line);font-size:10px;color:var(--muted)"><span>فارق التوقيت: ' + c.timeGapH + ' ساعة</span><a href="balance.html" style="color:var(--gold-strong);font-weight:700">قارن كامل ←</a></div></div>' +
      '<div class="wl-balance-side"><div class="wl-balance-stat"><b>' + sourceCount + '</b><span>أسماء مصادر مختلفة</span><small>ضمن العينة المعروضة</small></div><div class="wl-balance-stat"><b>' + clusters.length + '</b><span>تجمعات تغطية متشابهة</span><small>خلال 72 ساعة</small></div><div class="wl-balance-note"><strong>كيف نقيس؟</strong><p>نقارن تشابه العناوين وتوقيت التغطية وتعدد أسماء المصادر. تعدد الأسماء وحده لا يثبت استقلال المصادر أو صحة الرواية؛ لذلك نعرضه كمؤشر تغطية لا كدليل تأكيد.</p></div></div>';
  }

  function renderMirror(articles) {
    const host = $("#mirrorPreview");
    if (!host) return;
    let best = null, bestScore = 0, bestArticle = null;
    data.mirror.forEach(m => {
      articles.forEach(a => {
        const text = (a.title || "") + " " + (a.summary || "");
        let local = 0;
        m.nowKeywords.forEach(k => { if (k.length >= 4 && text.includes(k)) local++; });
        if (local >= 3 && local > bestScore) { bestScore = local; best = m; bestArticle = a; }
      });
    });
    const live = bestArticle;
    if (!best) best = data.mirror[0];
    host.innerHTML = '<div class="wl-mirror-shell">' +
      '<div class="wl-mirror-side"><span class="wl-mirror-label">الآن</span><h3>' + NR.escapeHTML(live ? live.title : best.nowTitle) + "</h3><p>" + NR.escapeHTML(best.nowSummary) + "</p>" +
        (live?.sourceURL ? '<a href="' + NR.escapeHTML(NR.safeURL(live.sourceURL)) + '" target="_blank" rel="noopener noreferrer">اقرأ التغطية <svg width="12" height="12" aria-hidden="true"><use href="#i-arrow"/></svg></a>' : '<a href="context.html">افتح غرفة السياق <svg width="12" height="12" aria-hidden="true"><use href="#i-arrow"/></svg></a>') + "</div>" +
      '<div class="wl-mirror-mid"><span><svg aria-hidden="true"><use href="#i-mirror"/></svg></span><small>MIRROR</small></div>' +
      '<div class="wl-mirror-side wl-mirror-side--past"><span class="wl-mirror-label">في التاريخ · ' + NR.escapeHTML(best.pastEra) + "</span><h3>" + NR.escapeHTML(best.pastTitle) + "</h3><p>" + NR.escapeHTML(best.lesson) + '</p><a href="history-dossier.html?id=' + encodeURIComponent(best.pastDossier) + '">اقرأ الملف التاريخي <svg width="12" height="12" aria-hidden="true"><use href="#i-arrow"/></svg></a></div>' +
    "</div>";
  }

  function renderPromises() {
    const host = $("#promisesPreview");
    if (!host) return;
    const pick = ["paris-15", "sdgs", "ai-act", "saudi-vision"].map(id => data.promises.find(p => p.id === id)).filter(Boolean);
    host.innerHTML = pick.map(p => {
      const [label, cls] = NR.statusMeta(p.status);
      return '<a class="wl-promise wl-promise--' + NR.escapeHTML(p.status) + '" href="promises.html#' + encodeURIComponent(p.id) + '">' +
        '<div class="wl-promise-top"><span class="wl-status ' + cls + '">' + label + '</span><span class="wl-promise-meta" style="border:0;padding:0;margin:0">' + NR.escapeHTML(p.area) + "</span></div>" +
        "<h3>" + NR.escapeHTML(p.promise) + "</h3>" +
        '<div class="wl-progress-bar"><i style="width:' + (Math.max(0, Math.min(100, Number(p.progress) || 0))) + '%"></i></div>' +
        '<div class="wl-promise-meta"><span>' + NR.escapeHTML(p.who) + "</span><span>الموعد: " + NR.escapeHTML(p.due) + "</span></div>" +
      "</a>";
    }).join("");
  }

  function renderExplainers() {
    const host = $("#explainersRail");
    if (!host) return;
    host.innerHTML = data.explainers.slice(0, 8).map((e, i) =>
      '<a class="wl-explainer" href="explainers.html#' + e.id + '">' +
        '<span class="wl-explainer-num">' + String(i + 1).padStart(2, "0") + " · " + NR.escapeHTML(e.kicker) + "</span>" +
        "<h3>" + NR.escapeHTML(e.title) + "</h3><p>" + NR.escapeHTML(e.summary) + "</p>" +
        '<div class="wl-explainer-foot"><span>' + e.minutes + " دقيقة قراءة</span><span>اقرأ ←</span></div>" +
      "</a>"
    ).join("");
  }

  function renderShortsPreview(articles) {
    const host = $("#shortsPreviewRail");
    if (!host) return;
    const esc = NR.escapeHTML;
    const labels = {politics:"سياسة",economy:"اقتصاد",security:"أمن ودفاع",tech:"تقنية",sports:"رياضة",culture:"ثقافة",health:"صحة",world:"حول العالم"};
    const items = articles.filter(a => !a.isNewsDataOnly && a.title).slice(0, 5);
    host.innerHTML = items.length ? items.map((a, i) => {
      const image = NR.safeURL(a.img || a.image_url || "");
      const href = "shorts.html#" + encodeURIComponent(a.id || "");
      return '<a class="shorts-preview-card" href="' + href + '">' +
        (image ? '<img src="' + esc(image) + '" alt="" loading="lazy">' : '<span class="shorts-preview-no-image">W</span>') +
        '<span class="shorts-preview-shade"></span><span class="shorts-preview-index">' + String(i + 1).padStart(2, "0") + '</span>' +
        '<span class="shorts-preview-copy"><small>' + esc(labels[a.cat] || a.categoryName || "حول العالم") + '</small><strong>' + esc(a.title) + '</strong><em>افتح الخبر العمودي ↗</em></span></a>';
    }).join("") : '<div class="shorts-preview-empty">سيظهر موجز Shorts هنا مع أول تحديث للأخبار.</div>';
  }
  async function renderDossiers() {
    const host = document.getElementById("dossierStripGrid");
    if (!host) return;
    const esc = NR.escapeHTML;
    const labels = {active:"نشط", monitoring:"قيد المراقبة", closed:"مغلق"};
    try {
      const res = await fetch("dossier/index.json", { signal: AbortSignal.timeout(9000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const list = (data.dossiers || []).slice().sort((a, b) => {
        const rank = {active:0, monitoring:1, closed:2};
        return (Number(b.priority || 0) - Number(a.priority || 0)) || (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      }).slice(0, 3);
      if (!list.length) throw new Error("empty");
      host.innerHTML = list.map(d => {
        const when = Date.parse(d.updatedAt) ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {day:"numeric", month:"long"}).format(new Date(d.updatedAt)) : "";
        return '<a class="dossier-strip-card" href="' + esc(d.url) + '">' +
          '<span class="dossier-strip-status dossier-strip-status--' + esc(d.status) + '"><i aria-hidden="true"></i>' + esc(labels[d.status] || d.status) + '</span>' +
          '<strong>' + esc(d.title) + '</strong>' +
          '<span class="dossier-strip-summary">' + esc(String(d.summary || "").slice(0, 150)) + (String(d.summary || "").length > 150 ? "…" : "") + '</span>' +
          '<span class="dossier-strip-foot"><span>' + (d.sectors || []).slice(0, 2).map(esc).join(" · ") + '</span><span>آخر تحديث ' + esc(when) + '</span></span>' +
          '</a>';
      }).join("");
    } catch {
      host.innerHTML = '<div class="dossier-strip-loading">تعذر تحميل الملفات الآن. <a href="dossier/">افتح صفحة الملفات</a>.</div>';
    }
  }
  const extras = $("#homeExtras");
  let latestArticles = [], latestFeedStatus = "loading";
  let extrasStarted = false;
  function renderExtraPreviews() {
    renderContext(latestArticles);
    renderBalance(latestArticles, latestFeedStatus);
    renderMirror(latestArticles);
    renderShortsPreview(latestArticles);
  }
  function loadExtraScript(src) {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    document.head.append(script);
  }
  function openExtras() {
    if (extras && !extras.open) return;
    renderExtraPreviews();
    if (extrasStarted) return;
    extrasStarted = true;
    renderPromises();
    renderExplainers();
    if (!extras) { void renderDossiers(); return; }
    loadExtraScript("watch-strip.js?v=20261119-2");
    // Merge the live publications after the static fallback is in the grid.
    void renderDossiers().then(() => loadExtraScript("editorial-publications.js?v=20261123-rights"));
  }
  extras?.addEventListener("toggle", openExtras);
  openExtras();

  document.addEventListener("wrldline:news", e => {
    latestArticles = e.detail?.articles || [];
    latestFeedStatus = e.detail?.feedStatus || "ready";
    renderRooms(latestArticles);
    if (!extras || extras.open) renderExtraPreviews();
  });
})();
