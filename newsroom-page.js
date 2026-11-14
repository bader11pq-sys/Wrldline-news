/* WRLDLINE — newsroom desk pages */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = window.WLNR?.escapeHTML || (v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const D = window.WLNR?.data || { context: [], mirror: [], promises: [], explainers: [], impact: [] };
  const page = document.body.dataset.newsroomPage || "context";
  let articles = [];
  let state = {};

  const detail = () => $("#nrDetail");
  function openDetail(html) {
    const el = detail();
    if (!el) return;
    el.innerHTML = html;
    el.hidden = false;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function closeDetail() {
    const el = detail();
    if (!el) return;
    el.hidden = true;
    el.innerHTML = "";
  }
  function srcLinks(list) {
    if (!list || !list.length) return "";
    return '<div class="nr-source-line">' + list.map(s => {
      const title = Array.isArray(s) ? s[0] : s.title;
      const url = Array.isArray(s) ? s[1] : s.url;
      return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(title) + " ↗</a>" : '<span>' + esc(title) + "</span>";
    }).join("") + "</div>";
  }
  function matchArticles(item, n = 4) {
    const kws = (item.keywords || item.nowKeywords || []).filter(Boolean);
    if (!kws.length || !articles.length) return [];
    return articles.filter(a => kws.some(k => (a.title || "").includes(k))).slice(0, n);
  }
  function liveBlock(item) {
    const rows = matchArticles(item);
    if (!rows.length) return "";
    return '<div class="nr-live"><h4>عناوين مرتبطة الآن</h4>' + rows.map(a =>
      '<div class="nr-live-item"><a href="' + esc(window.WLNR.safeURL(window.WLNR.articleURL(a)) || "#") + '" target="_blank" rel="noopener noreferrer">' + esc(a.title) + "</a><span>" + esc(window.WLNR.sourceName(a)) + " · " + esc(window.WLNR.timeAgo(a.published_at)) + "</span></div>"
    ).join("") + "</div>";
  }
  function stats(items) {
    const host = $("#nrStats");
    if (host) host.innerHTML = items.map(([n, label]) => '<div class="nr-stat"><b>' + esc(n) + "</b>" + esc(label) + "</div>").join("");
  }
  function empty(title, text) {
    return '<div class="nr-empty"><b>' + esc(title) + "</b>" + esc(text) + "</div>";
  }

  /* ---------- Context ---------- */
  function renderContext() {
    stats([[D.context.length, "ملف سياق"], [articles.length, "عنواناً مباشراً"], [new Set(D.context.map(c => c.tag)).size, "تصنيفات"]]);
    const tags = ["all", ...new Set(D.context.map(c => c.tag).filter(Boolean))];
    const toolbar = $("#nrToolbar");
    if (toolbar) toolbar.innerHTML = '<div class="nr-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="ctxSearch" type="search" placeholder="ابحث في الملفات…" aria-label="بحث في ملفات السياق"></div>' +
      tags.map(t => '<button class="nr-chip' + (t === "all" ? " is-active" : "") + '" data-tag="' + esc(t) + '">' + (t === "all" ? "كل الملفات" : esc(t)) + "</button>").join("") +
      '<span class="nr-count" id="ctxCount"></span>';
    const root = $("#nrRoot");
    const draw = () => {
      const q = state.q || "";
      const rows = D.context.filter(c => (state.tag === "all" || !state.tag || c.tag === state.tag) && (!q || (c.title + " " + c.dek + " " + (c.keywords || []).join(" ")).includes(q)));
      if ($("#ctxCount")) $("#ctxCount").textContent = rows.length + " ملفاً";
      root.innerHTML = rows.length ? '<div class="nr-grid">' + rows.map(c => {
        const live = matchArticles(c, 99).length;
        return '<article class="nr-card" data-ctx="' + esc(c.id) + '" tabindex="0"><div class="nr-card-top"><span class="nr-tag">' + esc(c.tag || "سياق") + '</span><span class="nr-meta">' + (live > 0 ? live + " عنواناً مباشراً" : "ملف تحليلي") + '</span></div><h3>' + esc(c.title) + "</h3><p>" + esc(c.dek) + '</p><div class="nr-card-foot"><span>افتح الملف</span><span>←</span></div></article>';
      }).join("") + "</div>" : empty("لا ملفات مطابقة", "جرّب كلمة أخرى أو أزل التصفية.");
      root.querySelectorAll("[data-ctx]").forEach(card => card.addEventListener("click", () => openContext(card.dataset.ctx)));
    };
    toolbar?.addEventListener("input", e => { if (e.target.id === "ctxSearch") { state.q = e.target.value.trim(); draw(); } });
    toolbar?.addEventListener("click", e => {
      const btn = e.target.closest("[data-tag]");
      if (!btn) return;
      state.tag = btn.dataset.tag;
      $$("[data-tag]", toolbar).forEach(b => b.classList.toggle("is-active", b === btn));
      draw();
    });
    draw();
    const hash = location.hash.slice(1);
    if (hash && D.context.some(c => c.id === hash)) openContext(hash);
  }
  function openContext(id) {
    const c = D.context.find(x => x.id === id);
    if (!c) return;
    openDetail('<div class="nr-detail-head"><div><span class="nr-tag">' + esc(c.tag || "سياق") + "</span><h2>" + esc(c.title) + "</h2><p>" + esc(c.dek) + '</p></div><button class="nr-close" type="button" aria-label="إغلاق"><svg aria-hidden="true"><use href="#i-close"/></svg></button></div>' +
      '<div class="nr-block"><h3>الخلفية</h3><ul>' + (c.background || []).map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>" +
      '<div class="nr-two"><div class="nr-known"><h4>ما نعرفه</h4><ul>' + (c.known || []).map(x => "<li>" + esc(x) + "</li>").join("") + '</ul></div><div class="nr-unknown"><h4>ما لا نعرفه بعد</h4><ul>' + (c.unknown || []).map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div></div>" +
      '<div class="nr-block"><h3>اللاعبون والمصالح</h3><div class="nr-players">' + (c.players || []).map(p => '<div class="nr-player"><b>' + esc(p[0]) + "</b><span>" + esc(p[1]) + "</span></div>").join("") + "</div></div>" +
      '<div class="nr-block"><h3>ما يجب مراقبته</h3><ul>' + (c.watch || []).map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>" +
      '<div class="nr-block"><h3>السيناريوهات</h3><div class="nr-scenarios">' + (c.scenarios || []).map(s => '<div class="nr-scenario"><div class="nr-scenario-top"><span>' + esc(s[0]) + "</span><b>" + esc(s[1]) + '%</b></div><div class="nr-bar"><i style="width:' + Math.max(0, Math.min(100, Number(s[1]) || 0)) + '%"></i></div><p>' + esc(s[2]) + "</p></div>").join("") + "</div></div>" +
      '<div class="nr-block"><h3>مصادر الملف</h3>' + srcLinks(c.sources) + "</div>" + liveBlock(c));
    detail().querySelector(".nr-close")?.addEventListener("click", closeDetail);
    history.replaceState(null, "", "#" + id);
  }

  /* ---------- Balance ---------- */
  function renderBalance() {
    state = { min: 2, age: 168, q: "" };
    const toolbar = $("#nrToolbar");
    if (toolbar) toolbar.innerHTML = '<div class="nr-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="balSearch" type="search" placeholder="ابحث في العناوين المتقاطعة…" aria-label="بحث في ميزان الروايات"></div>' +
      [2, 3, 4].map(n => '<button class="nr-chip' + (n === 2 ? " is-active" : "") + '" data-min="' + n + '">' + n + "+ مصادر</button>").join("") +
      '<select class="nr-select" id="balAge" aria-label="النافذة الزمنية"><option value="72">72 ساعة</option><option value="168" selected>7 أيام</option><option value="720">30 يوماً</option></select>' +
      '<span class="nr-count" id="balCount"></span>';
    const root = $("#nrRoot");
    const draw = () => {
      const clusters = window.WLNR.clusterArticles(articles, { minSources: state.min, maxAgeH: state.age });
      const rows = state.q ? clusters.filter(c => c.articles.some(a => (a.title || "").includes(state.q)) || c.tokens.some(t => t.includes(state.q))) : clusters;
      const sources = new Set(rows.flatMap(c => c.sources));
      if ($("#balCount")) $("#balCount").textContent = rows.length + " تقاطعاً · " + sources.size + " مصدراً";
      stats([[rows.length, "تقاطعاً"], [sources.size, "مصدراً"], [rows.length ? Math.round(rows.reduce((n, c) => n + c.sourceCount, 0) / rows.length) : 0, "متوسط المصادر"]]);
      if (!rows.length) {
        root.innerHTML = empty("لا تقاطعات كافية الآن", "قد تكون التغطية الحالية من مصدر واحد، أو خارج النافذة الزمنية. وسّع النافذة أو قلّل الحد الأدنى للمصادر.");
        return;
      }
      root.innerHTML = rows.map(c => {
        const label = (c.articles.find(a => /[\u0600-\u06FF]/.test(a.title)) || c.articles[0])?.title || c.tokens.join(" · ");
        return '<article class="nr-cluster"><div class="nr-cluster-head"><div><span class="nr-tag">تقاطع تغطية</span><h3>' + esc(label) + '</h3></div><div class="nr-balance"><b>' + c.sourceCount + "</b><small>مصادر</small></div></div>" +
          '<div class="nr-headlines">' + c.articles.slice(0, 6).map(a => {
            const f = c.framing.find(x => x.article === a)?.terms || [];
            const u = window.WLNR.safeURL(window.WLNR.articleURL(a));
            return '<div class="nr-headline"><div class="nr-headline-src"><b>' + esc(window.WLNR.sourceName(a)) + "</b>" + esc(window.WLNR.timeAgo(a.published_at)) + '</div><div><a href="' + esc(u || "#") + '" target="_blank" rel="noopener noreferrer">' + esc(a.title) + "</a>" + (f.length ? '<div class="nr-frames">' + f.map(t => '<span class="nr-frame">' + esc(t) + "</span>").join("") + "</div>" : "") + "</div></div>";
          }).join("") + '</div><div class="nr-cluster-foot"><span>فارق التوقيت: ' + c.timeGapH + ' ساعة · ' + c.articles.length + ' عنواناً</span><span>مؤشر التوازن <span class="nr-balance-meter"><i style="width:' + c.balance + '%"></i></span> ' + c.balance + "/100</span></div></article>";
      }).join("");
    };
    toolbar?.addEventListener("input", e => { if (e.target.id === "balSearch") { state.q = e.target.value.trim(); draw(); } });
    toolbar?.addEventListener("change", e => { if (e.target.id === "balAge") { state.age = Number(e.target.value); draw(); } });
    toolbar?.addEventListener("click", e => {
      const btn = e.target.closest("[data-min]");
      if (!btn) return;
      state.min = Number(btn.dataset.min);
      $$("[data-min]", toolbar).forEach(b => b.classList.toggle("is-active", b === btn));
      draw();
    });
    draw();
  }

  /* ---------- Impact ---------- */
  function renderImpact() {
    stats([[D.impact.length, "سلاسل تأثير"], [new Set(D.impact.flatMap(i => (i.sectors || []).map(s => s[0]))).size, "قطاعاً"], [new Set(D.impact.flatMap(i => (i.countries || []).map(c => c[0]))).size, "دولة"]]);
    const root = $("#nrRoot");
    root.innerHTML = '<div class="nr-grid">' + D.impact.map(i => '<article class="nr-card" data-impact="' + esc(i.id) + '" tabindex="0"><div class="nr-card-top"><span class="nr-tag">' + esc(i.kicker) + '</span><span class="nr-meta">' + (i.chain || []).length + ' خطوات</span></div><h3>' + esc(i.title) + "</h3><p>" + esc(i.event) + '</p><div class="nr-card-foot"><span>افتح السلسلة</span><span>←</span></div></article>').join("") + "</div>";
    root.querySelectorAll("[data-impact]").forEach(card => card.addEventListener("click", () => openImpact(card.dataset.impact)));
  }
  function openImpact(id) {
    const i = D.impact.find(x => x.id === id);
    if (!i) return;
    const dirClass = t => /إيجابي/.test(t) ? "nr-dir--pos" : /سلبي/.test(t) ? "nr-dir--neg" : "nr-dir--mix";
    openDetail('<div class="nr-detail-head"><div><span class="nr-tag">' + esc(i.kicker) + "</span><h2>" + esc(i.title) + "</h2><p>" + esc(i.event) + '</p></div><button class="nr-close" type="button" aria-label="إغلاق"><svg aria-hidden="true"><use href="#i-close"/></svg></button></div>' +
      '<div class="nr-block"><h3>سلسلة الانتقال</h3><div class="nr-chain">' + (i.chain || []).map((s, n) => '<div class="nr-step"><div class="nr-step-num">' + (n + 1) + '</div><div><h4>' + esc(s[0]) + "</h4><b>" + esc(s[1]) + "</b><p>" + esc(s[2]) + "</p></div></div>").join("") + "</div></div>" +
      '<div class="nr-block"><h3>القطاعات المتأثرة</h3><div class="nr-sectors">' + (i.sectors || []).map(s => '<div class="nr-sector"><div><b>' + esc(s[0]) + "</b><br><span style=\"font-size:9px;color:var(--muted)\">" + esc(s[2]) + '</span></div><span class="nr-dir ' + dirClass(s[1]) + '">' + esc(s[1]) + "</span></div>").join("") + "</div></div>" +
      '<div class="nr-block"><h3>الدول الأكثر تأثراً</h3><div class="nr-players">' + (i.countries || []).map(c => '<div class="nr-player"><b>' + esc(c[0]) + "</b><span>" + esc(c[1]) + "</span></div>").join("") + "</div></div>" +
      '<div class="nr-block"><h3>في الحياة اليومية</h3><div class="nr-chips">' + (i.everyday || []).map(x => "<span>" + esc(x) + "</span>").join("") + "</div></div>" +
      '<div class="nr-block"><h3>ما يجب مراقبته</h3><ul>' + (i.watch || []).map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>" +
      '<div class="nr-block"><h3>المصادر</h3>' + srcLinks(i.sources) + "</div>");
    detail().querySelector(".nr-close")?.addEventListener("click", closeDetail);
  }

  /* ---------- Promises ---------- */
  function renderPromises() {
    state = { status: "all", area: "all" };
    const areas = [...new Set(D.promises.map(p => p.area))];
    const toolbar = $("#nrToolbar");
    const counts = { done: 0, partial: 0, stalled: 0, pending: 0 };
    D.promises.forEach(p => counts[p.status] = (counts[p.status] || 0) + 1);
    stats([[D.promises.length, "وعداً"], [counts.done, "منجز"], [counts.partial, "جزئي"], [counts.stalled + counts.pending, "متعثر/قيد التنفيذ"]]);
    if (toolbar) toolbar.innerHTML = '<button class="nr-chip is-active" data-status="all">الكل</button>' +
      [["done", "منجز"], ["partial", "جزئي"], ["stalled", "متعثر"], ["pending", "قيد التنفيذ"]].map(([s, l]) => '<button class="nr-chip" data-status="' + s + '">' + l + "</button>").join("") +
      '<select class="nr-select" id="promArea" aria-label="المجال"><option value="all">كل المجالات</option>' + areas.map(a => '<option value="' + esc(a) + '">' + esc(a) + "</option>").join("") + "</select>" +
      '<span class="nr-count" id="promCount"></span>';
    const root = $("#nrRoot");
    const draw = () => {
      const rows = D.promises.filter(p => (state.status === "all" || p.status === state.status) && (state.area === "all" || p.area === state.area));
      if ($("#promCount")) $("#promCount").textContent = rows.length + " وعداً";
      if (!rows.length) { root.innerHTML = empty("لا وعود مطابقة", "جرّب حالة أخرى أو مجالاً آخر."); return; }
      root.innerHTML = rows.map(p => {
        const [label, cls] = window.WLNR.statusMeta(p.status);
        return '<article class="nr-promise"><div class="nr-promise-head"><span class="nr-status ' + cls + '">' + esc(label) + "</span><h3>" + esc(p.promise) + "</h3></div>" +
          '<div class="nr-progress"><i style="width:' + Math.max(0, Math.min(100, p.progress || 0)) + '%"></i></div>' +
          '<div class="nr-promise-meta"><span>' + esc(p.who) + "</span><span>" + esc(p.area) + "</span><span>أُعلن: " + esc(p.made) + "</span><span>الموعد: " + esc(p.due) + "</span><span>" + (p.progress || 0) + "%</span></div>" +
          '<div class="nr-promise-grid"><div><b>معيار التحقق</b><p>' + esc(p.criterion) + "</p></div><div><b>ما حدث فعلاً</b><p>" + esc(p.evidence) + "</p></div></div>" +
          (p.note ? '<p class="nr-note">' + esc(p.note) + "</p>" : "") + srcLinks([p.source]) + "</article>";
      }).join("");
    };
    toolbar?.addEventListener("click", e => {
      const btn = e.target.closest("[data-status]");
      if (!btn) return;
      state.status = btn.dataset.status;
      $$("[data-status]", toolbar).forEach(b => b.classList.toggle("is-active", b === btn));
      draw();
    });
    toolbar?.addEventListener("change", e => { if (e.target.id === "promArea") { state.area = e.target.value; draw(); } });
    draw();
  }

  /* ---------- Mirror ---------- */
  function renderMirror() {
    stats([[D.mirror.length, "مقارنة"], [new Set(D.mirror.map(m => m.pastEra)).size, "عصور"], [new Set(D.mirror.map(m => m.pastDossier)).size, "ملفات تاريخية"]]);
    const toolbar = $("#nrToolbar");
    if (toolbar) toolbar.innerHTML = '<div class="nr-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="mirSearch" type="search" placeholder="ابحث في المقارنات…" aria-label="بحث في مرآة التاريخ"></div><span class="nr-count" id="mirCount"></span>';
    const root = $("#nrRoot");
    const draw = () => {
      const q = state.q || "";
      const rows = D.mirror.filter(m => !q || (m.nowTitle + " " + m.pastTitle + " " + m.lesson).includes(q));
      if ($("#mirCount")) $("#mirCount").textContent = rows.length + " مقارنة";
      root.innerHTML = rows.length ? `<div class="nr-grid">${rows.map(m => `
        <article class="nr-pair" data-pair="${esc(m.id)}" tabindex="0">
          <div class="nr-pair-top"><span class="nr-tag">الآن / ${esc(m.pastEra)}</span><h3>${esc(m.nowTitle)}</h3></div>
          <div class="nr-pair-body">
            <div class="nr-pair-side"><b>اليوم</b>${esc(m.nowSummary)}</div>
            <div class="nr-pair-side"><b>الماضي</b>${esc(m.pastTitle)}</div>
          </div>
          <div class="nr-pair-foot"><span>${(m.similarities || []).length} تشابهاً · ${(m.differences || []).length} فرقاً</span><span>افتح ←</span></div>
        </article>`).join("")}</div>` : empty("لا مقارنات مطابقة", "جرّب كلمة أخرى.");
      root.querySelectorAll("[data-pair]").forEach(card => card.addEventListener("click", () => openMirror(card.dataset.pair)));
    };
    toolbar?.addEventListener("input", e => { if (e.target.id === "mirSearch") { state.q = e.target.value.trim(); draw(); } });
    draw();
  }
  function openMirror(id) {
    const m = D.mirror.find(x => x.id === id);
    if (!m) return;
    openDetail('<div class="nr-detail-head"><div><span class="nr-tag">مرآة التاريخ · ' + esc(m.pastEra) + "</span><h2>" + esc(m.nowTitle) + "</h2></div><button class=\"nr-close\" type=\"button\" aria-label=\"إغلاق\"><svg aria-hidden=\"true\"><use href=\"#i-close\"/></svg></button></div>" +
      '<div class="nr-two"><div class="nr-block"><h3>اليوم</h3><p>' + esc(m.nowSummary) + '</p></div><div class="nr-block"><h3>الماضي</h3><p><b>' + esc(m.pastTitle) + "</b></p></div></div>" +
      '<div class="nr-two"><div class="nr-block"><h3>أوجه الشبه</h3><ul>' + (m.similarities || []).map(x => "<li>" + esc(x) + "</li>").join("") + '</ul></div><div class="nr-block"><h3>الفروق</h3><ul>' + (m.differences || []).map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div></div>" +
      '<div class="nr-block"><h3>الدرس</h3><p>' + esc(m.lesson) + '</p></div>' +
      (m.pastDossier ? '<div class="nr-block"><a class="wl-btn wl-btn--ghost" href="history-dossier.html?id=' + encodeURIComponent(m.pastDossier) + '">افتح الملف التاريخي المرتبط ←</a></div>' : "") +
      '<div class="nr-block"><h3>المصادر</h3>' + srcLinks(m.sources) + "</div>");
    detail().querySelector(".nr-close")?.addEventListener("click", closeDetail);
  }

  /* ---------- Explainers ---------- */
  function renderExplainers() {
    stats([[D.explainers.length, "شرحاً"], [new Set(D.explainers.map(e => e.kicker)).size, "مجالات"], [Math.round(D.explainers.reduce((n, e) => n + (e.minutes || 0), 0)), "دقيقة قراءة"]]);
    const kicks = ["all", ...new Set(D.explainers.map(e => e.kicker))];
    const toolbar = $("#nrToolbar");
    if (toolbar) toolbar.innerHTML = '<div class="nr-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="expSearch" type="search" placeholder="ابحث في الشروحات…" aria-label="بحث في الشروحات"></div>' +
      kicks.map(k => '<button class="nr-chip' + (k === "all" ? " is-active" : "") + '" data-kick="' + esc(k) + '">' + (k === "all" ? "الكل" : esc(k)) + "</button>").join("") +
      '<span class="nr-count" id="expCount"></span>';
    const root = $("#nrRoot");
    const draw = () => {
      const q = state.q || "";
      const rows = D.explainers.filter(e => (state.kick === "all" || !state.kick || e.kicker === state.kick) && (!q || (e.title + " " + e.summary).includes(q)));
      if ($("#expCount")) $("#expCount").textContent = rows.length + " شرحاً";
      root.innerHTML = rows.length ? '<div class="nr-grid">' + rows.map(e => '<article class="nr-card nr-explainer" data-exp="' + esc(e.id) + '" tabindex="0"><div class="nr-card-top"><span class="nr-tag">' + esc(e.kicker) + '</span><span class="nr-meta">' + esc(e.minutes) + ' دقائق</span></div><h3>' + esc(e.title) + "</h3><p>" + esc(e.summary) + '</p><div class="nr-card-foot"><span>اقرأ الشرح</span><span>←</span></div></article>').join("") + "</div>" : empty("لا شروحات مطابقة", "جرّب كلمة أخرى.");
      root.querySelectorAll("[data-exp]").forEach(card => card.addEventListener("click", () => openExplainer(card.dataset.exp)));
    };
    toolbar?.addEventListener("input", e => { if (e.target.id === "expSearch") { state.q = e.target.value.trim(); draw(); } });
    toolbar?.addEventListener("click", e => {
      const btn = e.target.closest("[data-kick]");
      if (!btn) return;
      state.kick = btn.dataset.kick;
      $$("[data-kick]", toolbar).forEach(b => b.classList.toggle("is-active", b === btn));
      draw();
    });
    draw();
  }
  function openExplainer(id) {
    const e = D.explainers.find(x => x.id === id);
    if (!e) return;
    openDetail('<div class="nr-detail-head"><div><span class="nr-tag">' + esc(e.kicker) + " · " + esc(e.minutes) + " دقائق</span><h2>" + esc(e.title) + "</h2><p>" + esc(e.summary) + '</p></div><button class="nr-close" type="button" aria-label="إغلاق"><svg aria-hidden="true"><use href="#i-close"/></svg></button></div>' +
      '<article class="nr-article">' + (e.sections || []).map(s => "<h3>" + esc(s[0]) + "</h3><p>" + esc(s[1]) + "</p>").join("") + "</article>" +
      '<div class="nr-article-grid"><div class="nr-block"><h3>مصطلحات</h3>' + (e.terms || []).map(t => '<div class="nr-player" style="margin-bottom:6px"><b>' + esc(t[0]) + "</b><span>" + esc(t[1]) + "</span></div>").join("") + '</div><div class="nr-block"><h3>أرقام</h3>' + (e.numbers || []).map(n => '<div class="nr-player" style="margin-bottom:6px"><b style="color:var(--gold-strong);font:800 16px var(--font-en)">' + esc(n[0]) + "</b><span>" + esc(n[1]) + "</span></div>").join("") + "</div></div>" +
      '<div class="nr-block"><h3>أسئلة متكررة</h3><div class="nr-faq">' + (e.faq || []).map(f => "<details><summary>" + esc(f[0]) + "</summary><p>" + esc(f[1]) + "</p></details>").join("") + "</div></div>" +
      '<div class="nr-block"><h3>اقرأ أيضاً</h3><div class="nr-chips">' + (e.related || []).map(r => '<a class="nr-chip" href="' + esc(r[1]) + '">' + esc(r[0]) + "</a>").join("") + "</div></div>");
    detail().querySelector(".nr-close")?.addEventListener("click", closeDetail);
  }

  /* ---------- Chrome ---------- */
  function initChrome() {
    const btn = $("#themeButton");
    const apply = theme => {
      document.documentElement.dataset.theme = theme;
      const use = btn?.querySelector("use");
      if (use) use.setAttribute("href", theme === "dark" ? "#i-sun" : "#i-moon");
    };
    apply(localStorage.getItem("wrldline:theme") || "light");
    btn?.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem("wrldline:theme", next);
      apply(next);
    });
    const menu = $("#menuButton"), nav = $("#mainNav");
    menu?.addEventListener("click", () => {
      const open = nav.classList.toggle("mobile-open");
      menu.setAttribute("aria-expanded", String(open));
    });
    $$("[data-year]").forEach(el => el.textContent = new Date().getFullYear());
    $("#nrDetail")?.addEventListener("click", ev => { if (ev.target.id === "nrDetail") closeDetail(); });
    document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeDetail(); });
  }

  async function boot() {
    initChrome();
    try { articles = await window.WLNR.fetchArticles(300); } catch { articles = []; }
    ({ context: renderContext, balance: renderBalance, impact: renderImpact, promises: renderPromises, mirror: renderMirror, explainers: renderExplainers }[page] || renderContext)();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
