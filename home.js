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
    if (moreMenu && !moreMenu.contains(e.target) && !moreButton.contains(e.target)) closeMore();
  });
  menuButton?.addEventListener("click", () => {
    const open = navWrap.classList.toggle("is-open");
    navWrap.classList.toggle("mobile-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
  });
  navWrap?.addEventListener("click", e => {
    if (e.target.closest("a")) {
      navWrap.classList.remove("is-open", "mobile-open");
      menuButton?.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeMore();
  });

  /* ---------- Reading progress & header state ---------- */
  const progress = $("#readProgress");
  const header = $("#siteHeader");
  function onScroll() {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? Math.min(100, (h.scrollTop / max) * 100) : 0;
    if (progress) progress.style.width = pct + "%";
    header?.classList.toggle("is-stuck", h.scrollTop > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Reveal on scroll ---------- */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px" });
    $$(".wl-context-grid, .wl-desk-grid, .wl-promises, .wl-rooms, .news-grid").forEach(el => {
      el.classList.add("wl-stagger");
      io.observe(el);
    });
    $$(".wl-section, .wl-band .wl-container").forEach(el => {
      el.classList.add("wl-reveal");
      io.observe(el);
    });
  }

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
      el.textContent = n ? n + " خبر" : "—";
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

  function renderBalance(articles) {
    const host = $("#balancePreview");
    if (!host) return;
    const clusters = NR.clusterArticles(articles, { minSources: 2, maxAgeH: 72 });
    const sourceCount = new Set(articles.map(a => NR.sourceName(a))).size;
    const s1 = $("#balanceSources"), s2 = $("#balanceClusters");
    if (s1) s1.textContent = sourceCount || "—";
    if (s2) s2.textContent = clusters.length || "—";
    if (!clusters.length) {
      host.innerHTML = '<div class="wl-frame-card"><div class="wl-frame-head"><strong>لا توجد روايات متعددة كافية الآن</strong><span>تحديث مباشر</span></div><p style="font-size:11.5px;color:var(--muted);line-height:1.8">عندما تتوفر عناوين متعددة للحدث نفسه من مصادر مختلفة، سنعرض هنا المقارنة. لا نلفّق التوازن؛ نعرض ما هو موجود.</p></div>' +
        '<div class="wl-balance-side"><div class="wl-balance-stat"><b>' + (sourceCount || "—") + '</b><span>مصادر في العينة</span><small>آخر 48 ساعة</small></div><div class="wl-balance-stat"><b>0</b><span>حدث متعدد الروايات</span><small>بانتظار مزيد من التغطية</small></div></div>';
      return;
    }
    const c = clusters[0];
    const rows = c.framing.slice(0, 4).map(f =>
      '<div class="wl-frame-row"><div><h4>' + NR.escapeHTML(f.article.title) + '</h4><small>' + NR.escapeHTML(NR.sourceName(f.article)) + " · " + NR.timeAgo(f.article.published_at) + "</small></div>" +
      '<div class="wl-frame-meter" title="تمثيل نسبي داخل العينة"><i style="width:' + Math.max(18, Math.round(100 / Math.max(1, c.sourceCount))) + '%"></i></div></div>'
    ).join("");
    host.innerHTML = '<div class="wl-frame-card"><div class="wl-frame-head"><strong>' + NR.escapeHTML(c.articles[0].title.slice(0, 86)) + (c.articles[0].title.length > 86 ? '…' : '') + '</strong><span>' + c.sourceCount + " مصادر · " + c.articles.length + " عنوان</span></div>" + rows +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--line);font-size:10px;color:var(--muted)"><span>فارق التوقيت: ' + c.timeGapH + ' ساعة</span><a href="balance.html" style="color:var(--gold-strong);font-weight:700">قارن كامل ←</a></div></div>' +
      '<div class="wl-balance-side"><div class="wl-balance-stat"><b>' + sourceCount + '</b><span>مصادر مستقلة في العينة</span><small>آخر 72 ساعة</small></div><div class="wl-balance-stat"><b>' + clusters.length + '</b><span>حدث متعدد الروايات</span><small>قابل للمقارنة الآن</small></div><div class="wl-balance-note"><strong>كيف نقيس؟</strong><p>نطابق العناوين المتشابهة، ثم نقيس عدد المصادر المستقلة وفارق التوقيت. لا نعرض حدثاً بمصدر واحد لأنه لا يحتمل المقارنة.</p></div></div>';
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
        (live ? '<a href="' + NR.escapeHTML(NR.safeURL(NR.articleURL(live)) || "#") + '" target="_blank" rel="noopener noreferrer">اقرأ التغطية <svg width="12" height="12" aria-hidden="true"><use href="#i-arrow"/></svg></a>' : '<a href="context.html">افتح غرفة السياق <svg width="12" height="12" aria-hidden="true"><use href="#i-arrow"/></svg></a>') + "</div>" +
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
      return '<a class="wl-promise wl-promise--' + p.status + '" href="promises.html#' + p.id + '">' +
        '<div class="wl-promise-top"><span class="wl-status ' + cls + '">' + label + '</span><span class="wl-promise-meta" style="border:0;padding:0;margin:0">' + NR.escapeHTML(p.area) + "</span></div>" +
        "<h3>" + NR.escapeHTML(p.promise) + "</h3>" +
        '<div class="wl-progress-bar"><i style="width:' + p.progress + '%"></i></div>' +
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
  function renderRisk(articles) {
    const score = NR.riskScore(articles);
    const value = $("#riskValue"), label = $("#riskLabel"), needle = $("#riskNeedle");
    if (!value) return;
    if (score === null) {
      value.textContent = "—";
      label.textContent = "لا توجد إشارات مصنفة كافية";
      return;
    }
    value.textContent = score;
    label.textContent = score >= 75 ? "مرتفع" : score >= 50 ? "متصاعد" : score >= 30 ? "مراقبة" : "هادئ";
    if (needle) needle.style.insetInlineStart = Math.min(97, score) + "%";
  }

  async function boot() {
    const articles = await NR.fetchArticles(400);
    if (articles.length) {
      renderRooms(articles);
      renderShortsPreview(articles);
      renderContext(articles);
      renderBalance(articles);
      renderMirror(articles);
      renderRisk(articles);
    } else {
      renderContext([]);
      renderBalance([]);
      renderMirror([]);
      renderRisk([]);
    }
    renderPromises();
    renderExplainers();
  }

  boot();

  document.addEventListener("wrldline:news", e => {
    const articles = e.detail?.articles || [];
    if (articles.length) {
      renderRooms(articles);
      renderShortsPreview(articles);
      renderRisk(articles);
    }
  });
})();
