/* WRLDLINE HISTORY — atlas, dossiers, compare, library */
(() => {
  "use strict";
  const H = window.WL_HISTORY || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const REGIONS = H.regions || [
    { id: "middle-east", name: "الشرق الأوسط", color: "#b98b45" },
    { id: "asia", name: "آسيا", color: "#3f7a6b" },
    { id: "africa", name: "أفريقيا", color: "#9b6a3f" },
    { id: "europe", name: "أوروبا", color: "#3d6f8f" },
    { id: "americas", name: "الأمريكتان", color: "#8a5a6a" },
    { id: "oceania", name: "أوقيانوسيا", color: "#5f7f5f" }
  ];
  const ERAS = H.eras || [];
  const TYPES = { state: "دولة", civilization: "حضارة", empire: "إمبراطورية" };
  const REGION_MAP = Object.fromEntries(REGIONS.map(r => [r.id, r]));

  function yearLabel(y) {
    if (y === null || y === undefined || y === "") return "";
    const n = Number(y);
    if (!Number.isFinite(n)) return String(y);
    if (n < 0) return Math.abs(n).toLocaleString("en-US") + " ق.م";
    return n.toLocaleString("en-US");
  }
  function periodOf(e) {
    const from = e.from ?? e.frm, to = e.to;
    if (from === undefined || from === null) return e.period || "";
    return yearLabel(from) + " – " + yearLabel(to);
  }
  function eraOf(e) {
    const y = Number(e.from ?? e.frm);
    if (!Number.isFinite(y)) return null;
    return ERAS.find(x => y >= x.from && y < x.to) || ERAS[ERAS.length - 1];
  }
  function regionOf(e) { return REGION_MAP[e.region] || { name: e.subregion || "عالمي", color: "#a97f35" }; }
  function typeOf(e) { return TYPES[e.type] || "كيان تاريخي"; }

  const REGION_OVERRIDE = { sa: "middle-east", eg: "middle-east", iq: "middle-east", ir: "middle-east", tr: "middle-east", et: "africa", mx: "americas", us: "americas", cn: "asia", in: "asia", jp: "asia", gr: "europe", it: "europe", ml: "africa" };
  function normalize(e) {
    const chapters = (e.chapters && e.chapters.length ? e.chapters : (e.eras || []).map(r => ({
      period: r[0], title: r[1], subtitle: r[2], summary: r[3], sections: r[4] || []
    }))).map(c => ({ ...c, sections: c.sections || [] }));
    const timeline = (e.timeline || []).map(t => Array.isArray(t)
      ? { label: t[0], title: t[1], year: null }
      : { year: t.year, label: t.label || yearLabel(t.year), title: t.title, body: t.body || "" });
    const facts = (e.facts || []).map(f => Array.isArray(f) ? f : [f.label, f.value]);
    const stats = (e.stats || []).length ? e.stats : facts.slice(0, 4).map(f => ({ label: f[0], value: f[1] }));
    return {
      ...e,
      region: REGION_OVERRIDE[e.id] || e.region,
      from: e.from ?? e.frm,
      chapters, timeline, facts, stats,
      figures: e.figures || [],
      sources: e.sources || [],
      debates: e.debates || [],
      connections: e.connections || [],
      legacy: e.legacy || [],
      glossary: e.glossary || []
    };
  }

  const entities = (H.entities || []).map(normalize);
  const byId = Object.fromEntries(entities.map(e => [e.id, e]));
  const events = (H.events || []).slice().sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  const figures = (H.figures && H.figures.length) ? H.figures : entities.flatMap(e => (e.figures || []).map(f => ({ ...f, entity: e.id })));
  const sources = (H.sources && H.sources.length) ? H.sources : entities.flatMap(e => (e.sources || []).map(x => ({ ...x, entity: e.id })));
  const debates = (H.debates && H.debates.length) ? H.debates : entities.flatMap(e => (e.debates || []).map(d => ({ ...d, entity: e.id })));
  const glossary = (H.glossary && H.glossary.length) ? H.glossary : entities.flatMap(e => (e.glossary || []).map(g => typeof g === "string" ? { term: g, definition: "مصطلح وارد في ملف " + e.name + "." } : g));
  const quizzes = H.quizzes || [];

  function dossierHref(e) { return "history-dossier.html?id=" + encodeURIComponent(e.id); }

  function dossierCard(e, opts = {}) {
    const r = regionOf(e);
    const richness = e.chapters.length + e.figures.length + e.sources.length;
    return '<article class="hx-card" style="--region-color:' + r.color + '">' +
      '<div class="hx-card-top"><span class="hx-flag">' + esc(e.flag || "🏛️") + '</span><span class="hx-type">' + esc(typeOf(e)) + "</span></div>" +
      '<div class="hx-period">' + esc(periodOf(e)) + "</div>" +
      "<h3><a href=\"" + dossierHref(e) + "\">" + esc(e.name) + "</a></h3>" +
      "<p>" + esc(e.summary || "") + "</p>" +
      '<div class="hx-card-foot"><span><svg aria-hidden="true"><use href="#i-map"/></svg>' + esc(r.name) + '</span><span>' + e.chapters.length + ' فصول · ' + (e.timeline.length) + ' أحداث</span><a href="' + dossierHref(e) + '">افتح ←</a></div>' +
    "</article>";
  }

  /* ---------- Common shell ---------- */
  const BOOKMARK_KEY = "wrldline:history:bookmarks";
  function bookmarks() {
    try { return new Set(JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "[]")); } catch { return new Set(); }
  }
  function saveBookmarks(set) {
    try { localStorage.setItem(BOOKMARK_KEY, JSON.stringify([...set])); } catch {}
    $$("[data-bookmark-count]").forEach(el => el.textContent = set.size);
  }
  function toggleBookmark(id) {
    const set = bookmarks();
    set.has(id) ? set.delete(id) : set.add(id);
    saveBookmarks(set);
    return set.has(id);
  }

  function initTheme() {
    const btn = $("#themeButton");
    const apply = theme => {
      document.documentElement.dataset.theme = theme;
      const use = btn?.querySelector("use");
      if (use) use.setAttribute("href", theme === "dark" ? "#i-sun" : "#i-moon");
      btn?.setAttribute("aria-label", theme === "dark" ? "التبديل إلى المظهر الفاتح" : "التبديل إلى المظهر الداكن");
    };
    apply(localStorage.getItem("wrldline:theme") || "light");
    btn?.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem("wrldline:theme", next);
      apply(next);
    });
  }

  function initNav() {
    const btn = $("#menuButton"), nav = $("#mainNav");
    btn?.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      nav.classList.toggle("mobile-open", open);
      btn.setAttribute("aria-expanded", String(open));
    });
    $$("[data-year]").forEach(el => el.textContent = new Date().getFullYear());
    saveBookmarks(bookmarks());
  }

  function initProgress() {
    const bar = $("#readProgress");
    if (!bar) return;
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? Math.min(100, (h.scrollTop / max) * 100) : 0) + "%";
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  function initSearch() {
    const input = $("#historySearch"), results = $("#historySearchResults");
    if (!input || !results) return;
    const pool = [
      ...entities.map(e => ({ type: "dossier", label: e.name, sub: periodOf(e), href: dossierHref(e), flag: e.flag, text: e.name + " " + (e.en || "") + " " + (e.summary || "") })),
      ...events.slice(0, 400).map(ev => ({ type: "event", label: ev.title, sub: ev.label || yearLabel(ev.year), href: "history-explore.html?tab=timeline&q=" + encodeURIComponent(ev.title), flag: "🕰️", text: ev.title + " " + (ev.body || "") })),
      ...figures.map(f => ({ type: "figure", label: f.name, sub: f.role || "", href: "history-library.html?tab=figures&q=" + encodeURIComponent(f.name), flag: "👤", text: f.name + " " + (f.note || "") }))
    ];
    function run() {
      const q = input.value.trim();
      if (q.length < 2) { results.hidden = true; results.innerHTML = ""; return; }
      const words = q.split(/\s+/);
      const hits = pool.filter(x => words.every(w => x.text.includes(w))).slice(0, 8);
      results.innerHTML = hits.length ? hits.map(x => '<a href="' + x.href + '"><span class="hx-sr-flag">' + (x.flag || "•") + "</span><span>" + esc(x.label) + "</span><small>" + esc(x.sub) + "</small></a>").join("") : '<div class="hx-search-empty">لا نتائج مطابقة. جرّب اسماً أو سنة أو حدثاً.</div>';
      results.hidden = false;
    }
    input.addEventListener("input", run);
    input.addEventListener("focus", run);
    document.addEventListener("click", e => { if (!e.target.closest(".hx-search")) results.hidden = true; });
  }

  /* ---------- Hub ---------- */
  function renderHub() {
    const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n.toLocaleString("en-US"); };
    setCount("statDossiers", entities.length);
    setCount("statEvents", events.length);
    setCount("statFigures", figures.length);
    setCount("statSources", sources.length);

    const featured = entities.slice().sort((a, b) => (b.chapters.length + b.figures.length + b.sources.length) - (a.chapters.length + a.figures.length + a.sources.length)).slice(0, 6);
    const grid = $("#featuredGrid");
    if (grid) grid.innerHTML = featured.map(e => dossierCard(e)).join("");

    const regionsHost = $("#regionAtlas");
    if (regionsHost) {
      regionsHost.innerHTML = REGIONS.map(r => {
        const n = entities.filter(e => e.region === r.id).length;
        return '<a class="hx-region" href="history-explore.html?region=' + r.id + '" style="--region-color:' + r.color + '"><i></i><b>' + esc(r.name) + "</b><span>" + n + " ملفاً</span></a>";
      }).join("");
    }

    const tl = $("#timelinePreview");
    if (tl) {
      const pick = events.length ? events.filter((_, i) => i % Math.max(1, Math.floor(events.length / 7)) === 0).slice(0, 7) : [];
      tl.innerHTML = pick.length ? pick.map(ev => '<div class="hx-tl-item"><span class="hx-tl-year">' + esc(ev.label || yearLabel(ev.year)) + '</span><h4>' + esc(ev.title) + '</h4><p>' + esc((ev.body || "").slice(0, 110)) + '…</p></div>').join("") : '<div class="hx-empty">تُحمّل الأحداث تباعاً.</div>';
    }

    const paths = $("#learningPaths");
    if (paths) {
      const tools = [
        ["اختبار المعرفة", "أسئلة متدرجة مع شرح لكل إجابة.", "history-library.html?tab=quiz", "i-spark"],
        ["بطاقات المراجعة", "مصطلحات وشخصيات للمراجعة السريعة.", "history-library.html?tab=glossary", "i-book"],
        ["الخلافات التاريخية", "قضايا لا يوجد فيها إجماع، بأدلة الطرفين.", "history-library.html?tab=debates", "i-scale"],
        ["مقارنة الملفات", "ضع دولتين أو حضارتين جنباً إلى جنب.", "history-compare.html", "i-compare"]
      ];
      paths.innerHTML = tools.map(([t, d, href, icon]) => '<a class="hx-card" href="' + href + '"><span class="hx-type" style="align-self:flex-start">أداة</span><h3>' + t + "</h3><p>" + d + '</p><div class="hx-card-foot"><span>افتح الأداة</span><span>←</span></div></a>').join("");
    }

    const srcHost = $("#sourcePreview");
    if (srcHost) {
      const pick = sources.slice(0, 4);
      srcHost.innerHTML = pick.length ? pick.map(s => '<div class="hx-source"><div class="hx-source-icon"><svg aria-hidden="true"><use href="#i-book"/></svg></div><div><h4>' + esc(s.title) + "</h4><small>" + esc([s.author, s.year].filter(Boolean).join(" · ")) + "</small></div></div>").join("") : '<div class="hx-empty">تظهر المكتبة عند اكتمال تحميل البيانات.</div>';
    }

    const latest = $("#latestDossiers");
    if (latest) latest.innerHTML = entities.slice(-3).reverse().map(e => dossierCard(e)).join("");
  }

  /* ---------- Explore ---------- */
  let exploreState = { q: "", region: "all", type: "all", era: "all", sort: "rich", limit: 24, tab: "atlas" };
  function renderExplore() {
    const params = new URLSearchParams(location.search);
    ["q", "region", "type", "era", "sort", "tab"].forEach(k => { if (params.get(k)) exploreState[k] = params.get(k); });
    const qInput = $("#exploreSearch"), regionSel = $("#exploreRegion"), typeSel = $("#exploreType"), eraSel = $("#exploreEra"), sortSel = $("#exploreSort");
    if (qInput) qInput.value = exploreState.q;
    if (regionSel) regionSel.value = exploreState.region;
    if (typeSel) typeSel.value = exploreState.type;
    if (eraSel) eraSel.value = exploreState.era;
    if (sortSel) sortSel.value = exploreState.sort;

    const regionsHost = $("#regionAtlas");
    if (regionsHost) {
      regionsHost.innerHTML = REGIONS.map(r => {
        const n = entities.filter(e => e.region === r.id).length;
        return '<button type="button" class="hx-region' + (exploreState.region === r.id ? " is-active" : "") + '" data-region="' + r.id + '" style="--region-color:' + r.color + '"><i></i><b>' + esc(r.name) + "</b><span>" + n + " ملفاً</span></button>";
      }).join("");
      regionsHost.querySelectorAll("[data-region]").forEach(btn => btn.addEventListener("click", () => {
        exploreState.region = exploreState.region === btn.dataset.region ? "all" : btn.dataset.region;
        if (regionSel) regionSel.value = exploreState.region;
        regionsHost.querySelectorAll("[data-region]").forEach(b => b.classList.toggle("is-active", b.dataset.region === exploreState.region));
        apply();
      }));
    }

    const apply = () => {
      let rows = entities.filter(e => {
        const text = (e.name + " " + (e.en || "") + " " + (e.summary || "") + " " + (e.aliases || "")).toLowerCase();
        const qOk = !exploreState.q || exploreState.q.split(/\s+/).every(w => text.includes(w.toLowerCase()));
        const rOk = exploreState.region === "all" || e.region === exploreState.region;
        const tOk = exploreState.type === "all" || e.type === exploreState.type;
        const y = Number(e.from ?? e.frm);
        const era = ERAS.find(x => exploreState.era === x.id);
        const eOk = !era || (Number.isFinite(y) && y >= era.from && y < era.to);
        return qOk && rOk && tOk && eOk;
      });
      if (exploreState.sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name, "ar"));
      else if (exploreState.sort === "old") rows.sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
      else if (exploreState.sort === "new") rows.sort((a, b) => (b.to ?? 0) - (a.to ?? 0));
      else rows.sort((a, b) => (b.chapters.length + b.figures.length + b.sources.length) - (a.chapters.length + a.figures.length + a.sources.length));

      const grid = $("#exploreGrid"), count = $("#exploreCount");
      if (count) count.textContent = rows.length + " ملفاً";
      if (grid) grid.innerHTML = rows.length ? rows.slice(0, exploreState.limit).map(e => dossierCard(e)).join("") : '<div class="hx-empty">لا ملفات تطابق هذا التصفية. جرّب توسيع النطاق.</div>';
      const more = $("#exploreMore");
      if (more) more.hidden = rows.length <= exploreState.limit;
    };

    const bind = (el, key, ev = "change") => el?.addEventListener(ev, () => {
      exploreState[key] = el.value;
      exploreState.limit = 24;
      const url = new URL(location.href);
      if (exploreState[key] && exploreState[key] !== "all" && exploreState[key] !== "") url.searchParams.set(key, exploreState[key]);
      else url.searchParams.delete(key);
      history.replaceState(null, "", url);
      apply();
    });
    bind(qInput, "q", "input"); bind(regionSel, "region"); bind(typeSel, "type"); bind(eraSel, "era"); bind(sortSel, "sort");
    $("#exploreMore")?.addEventListener("click", () => { exploreState.limit += 24; apply(); });

    $$(".hx-tab[data-explore-tab]").forEach(tab => tab.addEventListener("click", () => {
      exploreState.tab = tab.dataset.exploreTab;
      $$(".hx-tab[data-explore-tab]").forEach(t => t.classList.toggle("is-active", t === tab));
      $("#atlasPanel").hidden = exploreState.tab !== "atlas";
      $("#timelinePanel").hidden = exploreState.tab !== "timeline";
      if (exploreState.tab === "timeline") renderEventTimeline();
    }));
    apply();
    renderEventTimeline();
    $("#eventSearch")?.addEventListener("input", renderEventTimeline);
    $("#eventRegion")?.addEventListener("change", renderEventTimeline);
  }

  function renderEventTimeline() {
    const host = $("#eventTimeline");
    if (!host) return;
    const q = ($("#eventSearch")?.value || "").trim();
    const region = $("#eventRegion")?.value || "all";
    let rows = events.filter(ev => (!q || ev.title.includes(q) || (ev.body || "").includes(q)) && (region === "all" || ev.region === region));
    const count = $("#eventCount");
    if (count) count.textContent = rows.length + " حدثاً";
    if (!rows.length) { host.innerHTML = '<div class="hx-empty">لا أحداث مطابقة. جرّب كلمة أخرى.</div>'; return; }
    if (rows.length > 120) rows = rows.filter((_, i) => i % Math.ceil(rows.length / 120) === 0);
    host.innerHTML = rows.map(ev => '<div class="hx-tl-item"><span class="hx-tl-year">' + esc(ev.label || yearLabel(ev.year)) + '</span><h4>' + esc(ev.title) + '</h4><p>' + esc(ev.body || "") + '</p><span class="hx-tl-region">' + esc(REGION_MAP[ev.region]?.name || "عالمي") + "</span></div>").join("");
  }

  /* ---------- Dossier ---------- */
  function citation(e) {
    return "WRLDLINE History — " + e.name + ". (2026). WRLDLINE. تاريخ الوصول " + new Date().toLocaleDateString("ar-SA-u-ca-gregory") + ". " + location.origin + "/" + dossierHref(e);
  }

  function renderDossier() {
    const id = new URLSearchParams(location.search).get("id") || location.hash.replace("#", "");
    const e = byId[id];
    const host = $("#dossierRoot");
    if (!host) return;
    if (!e) {
      host.innerHTML = '<div class="hx-wrap" style="padding:60px 0"><div class="hx-empty"><h2 style="margin-bottom:8px">الملف غير موجود</h2><p>قد يكون الرابط قديماً. <a href="history-explore.html" style="color:var(--gold-strong)">استعرض الأطلس</a>.</p></div></div>';
      return;
    }
    document.title = e.name + " — موسوعة WRLDLINE التاريخية";
    const r = regionOf(e);
    const localFigures = e.figures.length ? e.figures : figures.filter(f => f.entity === e.id);
    const localDebates = e.debates.length ? e.debates : debates.filter(d => d.entity === e.id);
    const localSources = e.sources.length ? e.sources : sources.filter(x => x.entity === e.id);
    const localConnections = e.connections.length ? e.connections : entities.filter(x => x.id !== e.id && x.region === e.region).slice(0, 4).map(x => ({ id: x.id, note: "تشابه إقليمي وترابط تاريخي" }));
    const chaptersHtml = e.chapters.map((c, i) => '<section class="hx-chapter' + (i === 0 ? " is-open" : "") + '" id="chapter-' + i + '">' +
      '<div class="hx-chapter-head" role="button" tabindex="0" data-chapter="' + i + '"><div><div class="hx-chapter-period">' + esc(c.period || "") + '</div><h3>' + esc(c.title) + '</h3><p>' + esc(c.subtitle || "") + '</p></div><span class="hx-chapter-toggle"><svg aria-hidden="true"><use href="#i-chevron"/></svg></span></div>' +
      '<div class="hx-chapter-body"><p class="hx-chapter-summary">' + esc(c.summary || "") + "</p>" +
      (c.sections || []).map(s => '<div class="hx-section-block"><h4>' + esc(s[0]) + "</h4><p>" + esc(s[1]) + "</p></div>").join("") + "</div></section>").join("");

    const figuresHtml = localFigures.length ? '<div class="hx-people">' + localFigures.map(f => '<div class="hx-person"><div class="hx-person-avatar">' + esc((f.name || "؟").slice(0, 1)) + '</div><div><h4>' + esc(f.name) + '</h4><small>' + esc([f.life, f.role].filter(Boolean).join(" · ")) + "</small><p>" + esc(f.note || "") + "</p></div></div>").join("") + "</div>" : '<div class="hx-empty">لم تُضف شخصيات لهذا الملف بعد.</div>';

    const debatesHtml = localDebates.length ? localDebates.map(d => '<div class="hx-debate"><h3>' + esc(d.question) + '</h3><div class="hx-debate-positions">' + (d.positions || []).map(p => '<div class="hx-position"><b>' + esc(p.view) + "</b><p>" + esc(p.evidence) + "</p></div>").join("") + '</div><div class="hx-debate-note">' + esc(d.note || "خلاف تفسيري؛ لا يوجد إجماع.") + "</div></div>").join("") : '<div class="hx-empty">لا توجد خلافات مسجلة.</div>';

    const connectionsHtml = localConnections.length ? '<div class="hx-connections">' + localConnections.map(c => { const t = byId[c.id]; if (!t) return ""; return '<a class="hx-connection" href="' + dossierHref(t) + '"><span>' + esc(t.flag || "🏛️") + "</span><div><b>" + esc(t.name) + "</b><small>" + esc(c.note || "") + "</small></div></a>"; }).join("") + "</div>" : '<div class="hx-empty">لا روابط محررة بعد.</div>';

    const sourcesHtml = localSources.length ? '<div class="hx-sources">' + localSources.map(s => '<div class="hx-source"><div class="hx-source-icon"><svg aria-hidden="true"><use href="#i-book"/></svg></div><div><h4>' + esc(s.title) + "</h4><small>" + esc([s.author, s.year, s.type].filter(Boolean).join(" · ")) + "</small></div>" + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">المصدر ↗</a>' : "") + "</div>").join("") + "</div>" : '<div class="hx-empty">لم تُضف مصادر بعد.</div>';

    const legacyHtml = e.legacy.length ? '<div class="hx-grid" style="grid-template-columns:repeat(2,1fr)">' + e.legacy.map(l => '<div class="hx-lib-card"><h4>' + esc(l.domain) + "</h4><p>" + esc(l.text) + "</p></div>").join("") + "</div>" : "";

    const timelineHtml = e.timeline.length ? '<div class="hx-timeline">' + e.timeline.map(t => '<div class="hx-tl-item"><span class="hx-tl-year">' + esc(t.label || yearLabel(t.year)) + "</span><h4>" + esc(t.title) + "</h4>" + (t.body ? "<p>" + esc(t.body) + "</p>" : "") + "</div>").join("") + "</div>" : '<div class="hx-empty">لا أحداث زمنية بعد.</div>';

    host.innerHTML = '<header class="hx-dossier-hero"><div class="hx-wrap"><nav class="hx-breadcrumb"><a href="history.html">الموسوعة</a><span>/</span><a href="history-explore.html?region=' + e.region + '">' + esc(r.name) + "</a><span>/</span><span>" + esc(e.name) + "</span></nav>" +
      '<div class="hx-dossier-top"><div><div class="hx-dossier-flag">' + esc(e.flag || "🏛️") + '</div><h1>' + esc(e.name) + '</h1><div class="hx-native">' + esc(e.en || "") + '</div><p class="hx-summary">' + esc(e.summary || "") + "</p>" +
      '<div class="hx-dossier-meta"><span>' + esc(periodOf(e)) + "</span><span>" + esc(typeOf(e)) + "</span><span>" + esc(r.name) + "</span><span>" + e.chapters.length + " فصول</span><span>" + e.figures.length + " شخصيات</span></div>" +
      '<div class="hx-dossier-actions"><button type="button" id="bookmarkBtn"><svg aria-hidden="true"><use href="#i-bookmark"/></svg><span>' + (bookmarks().has(e.id) ? "محفوظ" : "احفظ الملف") + '</span></button><button type="button" id="citeBtn"><svg aria-hidden="true"><use href="#i-quote"/></svg>اقتبس</button><button type="button" id="printBtn"><svg aria-hidden="true"><use href="#i-print"/></svg>طباعة</button><button type="button" id="shareBtn"><svg aria-hidden="true"><use href="#i-share"/></svg>شارك</button></div></div>' +
      '<aside class="hx-facts"><h3>FACT SHEET</h3>' + e.stats.slice(0, 7).map(s => '<div class="hx-fact"><span>' + esc(s.label) + "</span><b>" + esc(s.value) + "</b></div>").join("") + "</aside></div></div></header>" +
      '<div class="hx-wrap hx-dossier-body"><article class="hx-article" id="dossierArticle">' +
        '<h2 id="overview">نظرة عامة</h2><p class="hx-lead">' + esc(e.why || e.summary || "") + "</p>" +
        '<h2 id="chapters">الفصول</h2>' + chaptersHtml +
        '<h2 id="timeline">الخط الزمني</h2>' + timelineHtml +
        '<h2 id="figures">شخصيات ومحركون</h2>' + figuresHtml +
        '<h2 id="debates">خلافات تفسيرية</h2>' + debatesHtml +
        '<h2 id="connections">روابط تاريخية</h2>' + connectionsHtml +
        '<h2 id="sources">المصادر</h2>' + sourcesHtml +
        (legacyHtml ? '<h2 id="legacy">الإرث</h2>' + legacyHtml : "") +
      "</article>" +
      '<aside class="hx-side"><div class="hx-side-card"><h4>في هذا الملف</h4><nav class="hx-toc"><a href="#overview">نظرة عامة</a><a href="#chapters">الفصول</a><a href="#timeline">الخط الزمني</a><a href="#figures">شخصيات</a><a href="#debates">خلافات</a><a href="#sources">المصادر</a></nav></div>' +
      '<div class="hx-side-card"><h4>تقدم القراءة</h4><div class="hx-progress"><i id="readingBar"></i></div><small style="font-size:9.5px;color:var(--muted)">يتحدث مع التمرير</small></div>' +
      '<div class="hx-side-card"><h4>اقتباس جاهز</h4><div class="hx-cite" id="citeText">' + esc(citation(e)) + '</div><button class="wl-btn wl-btn--ghost" type="button" id="copyCite" style="width:100%;margin-top:7px;min-height:34px;font-size:10.5px">انسخ الاقتباس</button></div>' +
      '<div class="hx-side-card"><h4>ملفات مرتبطة</h4><div class="hx-related">' + localConnections.slice(0, 4).map(c => { const t = byId[c.id]; return t ? '<a href="' + dossierHref(t) + '"><span>' + esc(t.flag || "🏛️") + "</span>" + esc(t.name) + "</a>" : ""; }).join("") + "</div></div></aside></div>";

    $$("[data-chapter]").forEach(head => {
      const toggle = () => head.parentElement.classList.toggle("is-open");
      head.addEventListener("click", toggle);
      head.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); } });
    });
    $("#bookmarkBtn")?.addEventListener("click", () => {
      const on = toggleBookmark(e.id);
      $("#bookmarkBtn span").textContent = on ? "محفوظ" : "احفظ الملف";
    });
    $("#citeBtn")?.addEventListener("click", () => $("#citeText").scrollIntoView({ behavior: "smooth", block: "center" }));
    $("#printBtn")?.addEventListener("click", () => window.print());
    $("#shareBtn")?.addEventListener("click", async () => {
      const url = location.href;
      try { if (navigator.share) await navigator.share({ title: e.name, url }); else { await navigator.clipboard.writeText(url); alert("نُسخ الرابط."); } } catch {}
    });
    $("#copyCite")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(citation(e)); $("#copyCite").textContent = "نُسخ"; } catch { alert("تعذر النسخ."); }
    });
    const bar = $("#readingBar");
    if (bar) {
      const article = $("#dossierArticle");
      const update = () => {
        const rect = article.getBoundingClientRect();
        const total = article.offsetHeight - window.innerHeight * .5;
        const done = Math.min(1, Math.max(0, (-rect.top + window.innerHeight * .3) / Math.max(1, total)));
        bar.style.width = (done * 100) + "%";
      };
      window.addEventListener("scroll", update, { passive: true });
      update();
    }
  }

  /* ---------- Compare ---------- */
  function renderCompare() {
    const host = $("#compareRoot");
    if (!host) return;
    const params = new URLSearchParams(location.search);
    let a = byId[params.get("a")] || entities[0];
    let b = byId[params.get("b")] || entities.find(e => e.id !== a?.id);
    if (!a || !b) { host.innerHTML = '<div class="hx-empty">تحتاج ملفين على الأقل للمقارنة.</div>'; return; }
    const options = sel => entities.map(e => `<option value="${e.id}"${e.id === sel ? " selected" : ""}>${esc(e.name)}</option>`).join("");
    const row = (label, av, bv) => `<tr><th>${label}</th><td>${av}</td><td>${bv}</td></tr>`;
    const draw = () => {
      host.innerHTML = `
        <div class="hx-compare-controls">
          <label class="hx-select" style="display:flex;flex-direction:column;gap:4px;height:auto;padding:8px 10px;font-size:10px;color:var(--muted)">الملف الأول<select id="compareA" style="border:0;background:transparent;font-size:12px;color:var(--ink);outline:none">${options(a.id)}</select></label>
          <label class="hx-select" style="display:flex;flex-direction:column;gap:4px;height:auto;padding:8px 10px;font-size:10px;color:var(--muted)">الملف الثاني<select id="compareB" style="border:0;background:transparent;font-size:12px;color:var(--ink);outline:none">${options(b.id)}</select></label>
        </div>
        <table class="hx-compare-table">
          <thead><tr><th></th><th><div class="hx-compare-head"><span>${esc(a.flag || "🏛️")}</span>${esc(a.name)}</div></th><th><div class="hx-compare-head"><span>${esc(b.flag || "🏛️")}</span>${esc(b.name)}</div></th></tr></thead>
          <tbody>
            ${row("النطاق الزمني", esc(periodOf(a)), esc(periodOf(b)))}
            ${row("النوع", esc(typeOf(a)), esc(typeOf(b)))}
            ${row("المنطقة", esc(regionOf(a).name), esc(regionOf(b).name))}
            ${row("العاصمة", esc(a.capital || "—"), esc(b.capital || "—"))}
            ${row("اللغة", esc(a.languages || "—"), esc(b.languages || "—"))}
            ${row("النظام", esc(a.government || "—"), esc(b.government || "—"))}
            ${row("ملخص", esc((a.summary || "").slice(0, 260)) + "…", esc((b.summary || "").slice(0, 260)) + "…")}
            ${row("عدد الفصول", a.chapters.length, b.chapters.length)}
            ${row("الشخصيات", a.figures.length, b.figures.length)}
            ${row("المصادر", a.sources.length, b.sources.length)}
            ${row("الإرث", esc((a.legacy || []).map(l => l.domain).join(" · ") || "—"), esc((b.legacy || []).map(l => l.domain).join(" · ") || "—"))}
          </tbody>
        </table>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          <a class="wl-btn wl-btn--primary" href="${dossierHref(a)}">افتح ${esc(a.name)}</a>
          <a class="wl-btn wl-btn--ghost" href="${dossierHref(b)}">افتح ${esc(b.name)}</a>
        </div>`;
      $("#compareA")?.addEventListener("change", ev => { a = byId[ev.target.value]; sync(); draw(); });
      $("#compareB")?.addEventListener("change", ev => { b = byId[ev.target.value]; sync(); draw(); });
    };
    const sync = () => {
      const url = new URL(location.href);
      url.searchParams.set("a", a.id); url.searchParams.set("b", b.id);
      history.replaceState(null, "", url);
    };
    draw();
  }

  /* ---------- Library ---------- */
  function renderLibrary() {
    const host = $("#libraryRoot");
    if (!host) return;
    const params = new URLSearchParams(location.search);
    let tab = params.get("tab") || "sources";
    const q = (params.get("q") || "").toLowerCase();
    const tabs = [["sources", "المكتبة"], ["figures", "الشخصيات"], ["glossary", "المصطلحات"], ["debates", "الخلافات"], ["quiz", "الاختبار"]];
    const nav = $("#libraryTabs");
    if (nav) nav.innerHTML = tabs.map(([id, label]) => '<button class="hx-tab' + (id === tab ? " is-active" : "") + '" data-lib-tab="' + id + '">' + label + "</button>").join("");
    const draw = () => {
      if (tab === "sources") {
        const rows = sources.filter(s => !q || (s.title + " " + (s.author || "")).toLowerCase().includes(q));
        host.innerHTML = rows.length ? '<div class="hx-library-grid">' + rows.slice(0, 90).map(s => '<div class="hx-lib-card"><h4>' + esc(s.title) + "</h4><small>" + esc([s.author, s.year, s.type].filter(Boolean).join(" · ")) + "</small><p>" + esc(s.note || "") + "</p>" + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer" style="font-size:9.5px;color:var(--gold-strong)">المصدر ↗</a>' : "") + "</div>").join("") + "</div>" : '<div class="hx-empty">لا مصادر مطابقة.</div>';
      } else if (tab === "figures") {
        const rows = figures.filter(f => !q || (f.name + " " + (f.note || "")).toLowerCase().includes(q));
        host.innerHTML = rows.length ? '<div class="hx-people">' + rows.slice(0, 90).map(f => '<div class="hx-person"><div class="hx-person-avatar">' + esc((f.name || "؟").slice(0, 1)) + '</div><div><h4>' + esc(f.name) + "</h4><small>" + esc([f.life, f.role].filter(Boolean).join(" · ")) + "</small><p>" + esc(f.note || "") + "</p></div></div>").join("") + "</div>" : '<div class="hx-empty">لا شخصيات مطابقة.</div>';
      } else if (tab === "glossary") {
        const rows = glossary.filter(g => !q || (g.term + " " + (g.definition || "")).toLowerCase().includes(q));
        host.innerHTML = rows.length ? rows.slice(0, 120).map(g => '<div class="hx-glossary-item"><b>' + esc(g.term) + "</b><span>" + esc(g.en || "") + "</span><p>" + esc(g.definition) + "</p></div>").join("") : '<div class="hx-empty">لا مصطلحات مطابقة.</div>';
      } else if (tab === "debates") {
        const rows = debates.filter(d => !q || (d.question + " " + (d.context || "")).toLowerCase().includes(q));
        host.innerHTML = rows.length ? rows.slice(0, 40).map(d => '<div class="hx-debate"><h3>' + esc(d.question) + "</h3><p style=\"font-size:11px;color:var(--muted);line-height:1.8\">" + esc(d.context || "") + '</p><div class="hx-debate-positions">' + (d.positions || []).map(p => '<div class="hx-position"><b>' + esc(p.view) + "</b><p>" + esc(p.evidence) + "</p></div>").join("") + '</div><div class="hx-debate-note">' + esc(d.verdict || "خلاف تفسيري مفتوح.") + "</div></div>").join("") : '<div class="hx-empty">لا خلافات مطابقة.</div>';
      } else {
        drawQuiz();
      }
    };
    nav?.addEventListener("click", ev => {
      const btn = ev.target.closest("[data-lib-tab]");
      if (!btn) return;
      tab = btn.dataset.libTab;
      const url = new URL(location.href); url.searchParams.set("tab", tab); history.replaceState(null, "", url);
      $$(".hx-tab[data-lib-tab]").forEach(t => t.classList.toggle("is-active", t === btn));
      draw();
    });
    draw();
  }

  function drawQuiz() {
    const host = $("#libraryRoot");
    if (!host) return;
    const pool = quizzes.length ? quizzes : [];
    if (!pool.length) { host.innerHTML = '<div class="hx-empty">يُحمّل بنك الأسئلة مع اكتمال البيانات.</div>'; return; }
    let i = 0, score = 0, answered = false;
    const draw = () => {
      const q = pool[i];
      host.innerHTML = '<div class="hx-quiz"><div class="hx-quiz-top"><span>سؤال ' + (i + 1) + " / " + pool.length + '</span><span>النتيجة: ' + score + '</span></div><h3>' + esc(q.q || q.question) + "</h3>" +
        (q.options || []).map((o, idx) => '<button class="hx-answer" data-answer="' + idx + '">' + esc(o) + "</button>").join("") +
        '<div class="hx-quiz-feedback" id="quizFeedback"></div><div class="hx-quiz-foot"><span style="font-size:10px;color:var(--muted)">' + esc(q.level || "") + '</span><button class="wl-btn wl-btn--ghost" id="quizNext" style="min-height:34px;font-size:11px" disabled>التالي</button></div></div>';
      host.querySelectorAll("[data-answer]").forEach(btn => btn.addEventListener("click", () => {
        if (answered) return; answered = true;
        const choice = Number(btn.dataset.answer), correct = choice === (q.answer ?? q.correct ?? 0);
        if (correct) score++;
        host.querySelectorAll("[data-answer]").forEach(x => { x.disabled = true; if (Number(x.dataset.answer) === (q.answer ?? 0)) x.classList.add("is-correct"); else if (x === btn) x.classList.add("is-wrong"); });
        const fb = host.querySelector("#quizFeedback"); fb.classList.add("is-on");
        fb.textContent = (correct ? "إجابة صحيحة. " : "ليست الإجابة الصحيحة. ") + (q.explain || "");
        host.querySelector("#quizNext").disabled = false;
      }));
      host.querySelector("#quizNext")?.addEventListener("click", () => {
        if (!answered) return;
        if (i === pool.length - 1) {
          host.innerHTML = '<div class="hx-quiz"><h3>انتهى الاختبار</h3><p style="font-size:12px;color:var(--muted);margin:8px 0 14px">نتيجتك ' + score + " من " + pool.length + ".</p><button class=\"wl-btn wl-btn--primary\" id=\"quizRestart\">أعد المحاولة</button></div>";
          host.querySelector("#quizRestart")?.addEventListener("click", () => { i = 0; score = 0; answered = false; draw(); });
        } else { i++; answered = false; draw(); }
      });
    };
    draw();
  }

  /* ---------- Init ---------- */
  function boot() {
    initTheme(); initNav(); initProgress(); initSearch();
    const page = document.body.dataset.historyPage;
    if (page === "hub") renderHub();
    else if (page === "explore") renderExplore();
    else if (page === "dossier") renderDossier();
    else if (page === "compare") renderCompare();
    else if (page === "library") renderLibrary();
    else { renderHub(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.WLH = { entities, byId, events, figures, sources, glossary, debates, quizzes, dossierHref, periodOf, regionOf, typeOf };
})();
