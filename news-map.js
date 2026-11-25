/* WRLDLINE coverage map. Published articles (existing public_home_news_recent_v4 service) are placed by their
   editorial event country. Optional automated risk layer reuses the existing World Monitor feed and is labelled
   as machine classification, not verification. Vendored Leaflet and Natural Earth only; no third-party tiles.
   DOM builders only (no innerHTML). */
(() => {
  "use strict";
  const P = window.WLProduct, F = window.WLFeed, E = window.WLEditorial, WB = window.WLWorldBank, C = window.WLCountry,
    NM = window.WLNewsMap, MON = window.WLMonitor, TAX = window.WRLDLINE_TAXONOMY;
  const { h } = P;
  const lang = P.currentLang();
  const $ = (id) => document.getElementById(id);
  const fill = (el, ...c) => el.replaceChildren(...c.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
  let session = null; try { session = window.sessionStorage; session.getItem("wl:probe"); } catch { session = null; }

  const L = {
    ar: {
      title: "خريطة تغطية الأخبار", lead: "توزيع الأخبار المنشورة حسب دولة الحدث والمنطقة. الأعداد تصف حجم التغطية في الخلاصة المحمّلة، لا حالة الدولة.",
      filters: "الفلاتر", topic: "الموضوع", allTopics: "كل المواضيع", period: "الفترة", days1: "آخر يوم", days3: "آخر 3 أيام", days7: "آخر 7 أيام", days30: "آخر 30 يومًا",
      trust: "حالة التحقق", trustAll: "الكل", trustConfirmed: "مؤكد فقط", trustDeveloping: "تقارير متطورة وغير مؤكدة",
      layer: "الطبقة", layerCoverage: "حجم التغطية", layerRisk: "إشارات المخاطر الآلية (24 ساعة)",
      map: "الخريطة", mapHint: "اختر دولة من الخريطة أو من الجدول لعرض أخبارها.", legendCoverage: "عدد الأخبار", legendRisk: "أعلى مستوى خطورة مصنّف آليًا",
      none: "لا أخبار", fewer: "أقل", more: "أكثر", mapFail: "تعذر تحميل الخريطة. الجداول والأخبار أدناه متاحة.",
      countries: "الدول", region: "المناطق", articles: "الأخبار", count: "العدد", confirmed: "مؤكد", developing: "متطور", disputed: "متنازع عليه", latest: "الأحدث",
      allCountries: "كل الدول", clear: "إلغاء اختيار الدولة", openCountry: "ملف الدولة", noArticles: "لا أخبار تطابق هذه الفلاتر.", more_btn: "عرض المزيد",
      unlocated: "أخبار بلا دولة حدث محددة (غير معروضة على الخريطة)", feedWindow: "الخلاصة المحمّلة تغطي من", to: "إلى", of: "من",
      loaded: "خبرًا", retry: "إعادة المحاولة", error: "تعذر تحميل الأخبار الآن. لا نعرض بيانات بديلة.", loading: "جارٍ التحميل…", unknownRegion: "منطقة غير محددة",
      verifTitle: "كيف نميّز المؤكد من المتطور", verif: "مؤكد: راجعه فريق التحرير. متطور: تقرير منشور لم يُؤكَّد تحريريًا بعد. متنازع عليه: توجد روايات متعارضة. ألوان الخريطة تعتمد على العدد فقط ولا تعكس درجة التحقق؛ استخدم فلتر حالة التحقق للتمييز.",
      riskNote: "هذه الطبقة تصنيف آلي لأخبار آخر 24 ساعة (دولة الحدث ومستوى الخطورة). ليست تحققًا تحريريًا ولا تقييمًا لأمان الدولة، وفلتر الموضوع والفترة وحالة التحقق لا ينطبق عليها.",
      riskLink: "افتح مرصد العالم الكامل", riskReports: "تقارير مصنّفة آليًا", riskEmpty: "لا إشارات مصنّفة في آخر 24 ساعة.", riskFail: "تعذر تحميل طبقة المخاطر؛ تبقى طبقة التغطية متاحة.",
      automated: "تصنيف آلي", source: "المصدر الأصلي", sev: { critical: "حرج", high: "مرتفع", elevated: "متصاعد", guarded: "مراقبة", low: "منخفض" },
      sources: "المصادر والمنهجية", method: "الأخبار من خدمة الأخبار العامة في الموقع والمنشورة فقط. تُحدد الدولة من حقل دولة الحدث التحريري؛ ما لا يمكن ربطه بدولة بوضوح لا يُخمَّن. حدود الدول من Natural Earth (مرفقة محليًا) وأسماء المناطق من البنك الدولي. لا تُطلب بلاطات خرائط من أطراف ثالثة.",
      regionSource: "المناطق: تصنيف البنك الدولي", regionMissing: "تعذر تحميل تصنيف المناطق؛ تُعرض الدول فقط.", tableHint: "جدول بديل للخريطة", updated: "آخر تحديث للصفحة"
    },
    en: {
      title: "News coverage map", lead: "Distribution of published news by event country and region. Counts describe coverage volume in the loaded feed, not the condition of a country.",
      filters: "Filters", topic: "Topic", allTopics: "All topics", period: "Period", days1: "Last day", days3: "Last 3 days", days7: "Last 7 days", days30: "Last 30 days",
      trust: "Verification status", trustAll: "All", trustConfirmed: "Confirmed only", trustDeveloping: "Developing and unconfirmed reports",
      layer: "Layer", layerCoverage: "Coverage volume", layerRisk: "Automated risk signals (24 hours)",
      map: "Map", mapHint: "Choose a country on the map or in the table to see its news.", legendCoverage: "Number of articles", legendRisk: "Highest machine-classified severity",
      none: "No articles", fewer: "Fewer", more: "More", mapFail: "The map could not load. The tables and news below still work.",
      countries: "Countries", region: "Regions", articles: "Articles", count: "Count", confirmed: "Confirmed", developing: "Developing", disputed: "Disputed", latest: "Latest",
      allCountries: "All countries", clear: "Clear country selection", openCountry: "Country profile", noArticles: "No articles match these filters.", more_btn: "Show more",
      unlocated: "Articles without a clear event country (not on the map)", feedWindow: "The loaded feed covers", to: "to", of: "of",
      loaded: "articles", retry: "Retry", error: "News could not be loaded right now. No substitute data is shown.", loading: "Loading…", unknownRegion: "Region not classified",
      verifTitle: "Confirmed versus developing", verif: "Confirmed: reviewed by the editorial team. Developing: published but not yet editorially confirmed. Disputed: conflicting accounts exist. Map shading shows volume only, not verification; use the verification filter to separate them.",
      riskNote: "This layer is an automated classification of the last 24 hours (event country and severity). It is not editorial verification nor a safety rating, and the topic, period and verification filters do not apply to it.",
      riskLink: "Open the full World Monitor", riskReports: "Machine-classified reports", riskEmpty: "No classified signals in the last 24 hours.", riskFail: "The risk layer could not load; the coverage layer remains available.",
      automated: "Automated classification", source: "Original source", sev: { critical: "Critical", high: "High", elevated: "Elevated", guarded: "Guarded", low: "Low" },
      sources: "Sources and methodology", method: "Articles come from the site's public news service and are published items only. The country is taken from the editorial event-country field; anything that cannot be tied to one country is not guessed. Country borders are Natural Earth (bundled locally); region names are World Bank classifications. No third-party map tiles are requested.",
      regionSource: "Regions: World Bank classification", regionMissing: "Region classification could not load; countries are shown only.", tableHint: "Table alternative to the map", updated: "Page updated"
    }
  };
  const t = (k) => L[lang][k] ?? L.ar[k] ?? k;
  const topics = [...TAX.ALLOWED_CATEGORIES].filter((k) => k !== "uncategorized");
  const state = NM.parseState(location.search, topics, (c) => Boolean(E.codeOf(c)));
  const nameOf = (iso3) => E.countryName(iso3, lang) || iso3;
  const fmtDay = (ms) => P.dateFormat(ms, lang, { dateStyle: "medium" });
  const fmtStamp = (ms) => P.dateFormat(ms, lang, { dateStyle: "medium", timeStyle: "short" });
  const num = (n) => P.numberFormat(n, lang);
  const regionLabel = (r) => (r ? C.wbLabel(r, lang) : { text: t("unknownRegion"), lang });

  const ST = { articles: null, regionMap: null, monitor: null, monitorFailed: false, view: null, shown: 20, map: null, layer: null, mapFailed: false, loadedAt: null };

  function sync() {
    const q = NM.serializeState(state);
    try { history.replaceState(null, "", location.pathname + q); } catch { /* ignore */ }
  }
  const coverageColors = ["#e9ecef", "#bcd6ec", "#7db3dc", "#3a85bf", "#0b4f8a"];
  const riskColors = { low: "#9fcfb0", guarded: "#e6d682", elevated: "#efb36a", high: "#e0703f", critical: "#a3262a", none: "#e9ecef" };

  function compute() {
    const now = Date.now();
    ST.view = NM.aggregate(ST.articles, state, now, (c) => (ST.regionMap && ST.regionMap[c] ? ST.regionMap[c].region : undefined));
    if (state.layer === "risk" && ST.monitor) ST.risk = MON.select(ST.monitor.items, { hours: 24, country: state.country, severity: "all", type: "all", order: "severity" }, now);
  }
  function styleFor(feature) {
    const code = feature.properties.code, selected = code === state.country;
    let fillColor = coverageColors[0];
    if (state.layer === "coverage") fillColor = coverageColors[NM.level((ST.view.byCountry.get(code) || {}).count, ST.view.max)];
    else if (ST.risk) { const top = ST.risk.byCountry.get(code); fillColor = riskColors[top ? top[0].severity : "none"]; }
    return { color: selected ? "#111827" : "#6b7280", weight: selected ? 2.6 : 0.6, fillColor, fillOpacity: 0.92 };
  }
  function pick(code) { state.country = state.country === code ? "all" : code; render(); }

  async function initMap(box) {
    try {
      if (!window.L) {
        const css = document.createElement("link");
        css.rel = "stylesheet"; css.href = "vendor/leaflet-1.9.4.css"; css.integrity = "sha256-M3v8pcq9A7OYFbJwD+vis7ft9VkhxZzUn4jssyghIwM="; css.crossOrigin = "anonymous";
        document.head.append(css);
        await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "vendor/leaflet-1.9.4.js"; s.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="; s.crossOrigin = "anonymous"; s.onload = res; s.onerror = rej; document.head.append(s); });
      }
      const geo = await (await fetch("vendor/natural-earth-countries-110m-v5.1.2.geojson")).json();
      const map = window.L.map(box, { zoomControl: true, scrollWheelZoom: false, worldCopyJump: false, minZoom: 0, maxZoom: 6, attributionControl: true });
      map.attributionControl.addAttribution("Natural Earth");
      ST.layer = window.L.geoJSON(geo, {
        style: styleFor,
        onEachFeature(f, poly) {
          const code = f.properties.code;
          if (!E.codeOf(code)) return;
          poly.bindTooltip(() => {
            const c = ST.view && ST.view.byCountry.get(code);
            return `${nameOf(code)} · ${num(c ? c.count : 0)}`;
          }, { sticky: true });
          poly.on("click", () => pick(code));
        }
      }).addTo(map);
      map.fitBounds([[-57, -180], [82, 180]], { padding: [6, 6], animate: false });
      ST.map = map;
      document.documentElement.setAttribute("data-news-map", "ready");
    } catch { ST.mapFailed = true; fill(box, h("p", { class: "wp-notice warn", text: t("mapFail") })); }
  }

  function legend() {
    if (state.layer === "risk") {
      return h("ul", { class: "wp-legend", "aria-label": t("legendRisk") }, ["low", "guarded", "elevated", "high", "critical"].map((k) =>
        h("li", {}, h("span", { class: "wp-swatch" }), t("sev")[k])));
    }
    return h("ul", { class: "wp-legend", "aria-label": t("legendCoverage") }, coverageColors.map((c, i) =>
      h("li", {}, h("span", { class: "wp-swatch", "data-level": String(i) }), i === 0 ? t("none") : i === 1 ? t("fewer") : i === 4 ? t("more") : "")));
  }
  function paintSwatches(root) {
    const items = root.querySelectorAll(".wp-swatch");
    items.forEach((s, i) => {
      s.style.background = state.layer === "risk" ? riskColors[["low", "guarded", "elevated", "high", "critical"][i]] : coverageColors[i];
    });
  }

  function badge(kind) { return h("span", { class: "wp-badge " + (kind === "confirmed" ? "confirmed" : kind === "disputed" ? "disputed" : "developing"), text: t(kind) }); }

  function countryTable() {
    const rows = ST.view.countries.slice(0, 25);
    if (!rows.length) return h("p", { class: "wp-muted", text: t("noArticles") });
    return h("div", { class: "wp-table-wrap" }, h("table", { class: "wp-table" },
      h("caption", { class: "wp-sr", text: `${t("countries")} — ${t("tableHint")}` }),
      h("thead", {}, h("tr", {}, ["countries", "count", "confirmed", "developing", "disputed", "latest"].map((k) => h("th", { scope: "col", text: t(k) })))),
      h("tbody", {}, rows.map((c) => h("tr", { class: c.iso3 === state.country ? "is-selected" : "" },
        h("th", { scope: "row" }, h("button", { type: "button", class: "wp-linkbtn", "aria-pressed": String(c.iso3 === state.country), onclick: () => pick(c.iso3), text: nameOf(c.iso3) })),
        h("td", { text: num(c.count) }), h("td", { text: num(c.confirmed) }), h("td", { text: num(c.developing) }), h("td", { text: num(c.disputed) }), h("td", { text: fmtDay(c.latest) }))))));
  }
  function regionTable() {
    if (!ST.regionMap) return h("p", { class: "wp-footnote", text: t("regionMissing") });
    return h("div", { class: "wp-table-wrap" }, h("table", { class: "wp-table" },
      h("caption", { class: "wp-sr", text: t("region") }),
      h("thead", {}, h("tr", {}, ["region", "count", "countries", "confirmed", "developing"].map((k) => h("th", { scope: "col", text: t(k) })))),
      h("tbody", {}, ST.view.regions.map((g) => { const l = regionLabel(g.region);
        return h("tr", {}, h("th", { scope: "row", lang: l.lang, dir: l.lang === "ar" ? "rtl" : "ltr", text: l.text }), h("td", { text: num(g.count) }), h("td", { text: num(g.countries) }), h("td", { text: num(g.confirmed) }), h("td", { text: num(g.developing + g.disputed) })); }))),
      h("p", { class: "wp-footnote", text: t("regionSource") }));
  }

  function riskPanel() {
    if (ST.monitorFailed) return h("p", { class: "wp-notice warn", text: t("riskFail") });
    if (!ST.monitor) return h("p", { class: "wp-skeleton" });
    const events = ST.risk ? ST.risk.events.slice(0, ST.shown) : [];
    if (!events.length) return h("p", { class: "wp-muted", text: t("riskEmpty") });
    return h("ul", { class: "wp-list" }, events.map((e) => h("li", { class: "wp-item" },
      h("div", { class: "wp-meta" }, h("span", { class: "wp-badge developing", text: t("automated") }), h("span", { class: "wp-badge", text: t("sev")[e.severity] || e.severity }), h("span", { text: nameOf(e.countryCode) }),
        h("time", { datetime: new Date(e.published).toISOString(), text: fmtStamp(e.published) })),
      h("a", { href: "/news/" + encodeURIComponent(e.id), dir: "auto", text: e.title }))));
  }
  function articlePanel() {
    const list = ST.view.articles;
    if (!list.length) return h("p", { class: "wp-muted", text: t("noArticles") });
    const shown = list.slice(0, ST.shown);
    return h("div", {},
      h("ul", { class: "wp-list" }, shown.map((a) => P.articleItem(a, lang, a.country ? h("span", { text: nameOf(a.country) }) : null))),
      list.length > shown.length ? h("button", { type: "button", class: "wp-btn", onclick: () => { ST.shown += 20; render(); }, text: `${t("more_btn")} (${num(list.length - shown.length)})` }) : null);
  }

  function controls() {
    const sel = (id, label, options, value, onchange) => h("label", { class: "wp-field", for: id }, label,
      h("select", { id, class: "wp-select", onchange: (e) => onchange(e.target.value) }, options.map(([v, l]) => h("option", Object.assign({ value: v }, String(v) === String(value) ? { selected: "" } : {}), l))));
    const risk = state.layer === "risk";
    return h("section", { class: "wp-card", "aria-labelledby": "nFilters" }, h("h2", { id: "nFilters", text: t("filters") }),
      h("div", { class: "wp-controls" },
        sel("fTopic", t("topic"), [["all", t("allTopics")], ...topics.map((k) => [k, TAX.categoryName(k, lang)])], state.topic, (v) => { state.topic = v; ST.shown = 20; render(); }),
        sel("fDays", t("period"), NM.DAYS.map((d) => [d, t("days" + d)]), state.days, (v) => { state.days = Number(v); ST.shown = 20; render(); }),
        sel("fTrust", t("trust"), [["all", t("trustAll")], ["confirmed", t("trustConfirmed")], ["developing", t("trustDeveloping")]], state.trust, (v) => { state.trust = v; ST.shown = 20; render(); }),
        sel("fLayer", t("layer"), [["coverage", t("layerCoverage")], ["risk", t("layerRisk")]], state.layer, (v) => { state.layer = v; ST.shown = 20; if (v === "risk") loadMonitor(); render(); })),
      risk ? h("p", { class: "wp-notice warn", text: t("riskNote") }, " ") : null);
  }

  function summary() {
    const w = NM.feedWindow(ST.articles), v = ST.view;
    const bits = [h("p", { class: "wp-footnote" }, `${num(v.total)} ${t("of")} ${num(ST.articles.length)} ${t("loaded")}`,
      w ? ` · ${t("feedWindow")} ${fmtDay(w.oldest)} ${t("to")} ${fmtDay(w.newest)}` : "", ST.loadedAt ? ` · ${t("updated")}: ${fmtStamp(ST.loadedAt)}` : "")];
    if (v.unlocated) bits.push(h("p", { class: "wp-footnote", text: `${t("unlocated")}: ${num(v.unlocated)}` }));
    return bits;
  }

  let built = false;
  const slots = {};
  function build() {
    const app = $("nApp");
    slots.controls = h("div", {}); slots.summary = h("div", {});
    slots.mapBox = h("div", { class: "wp-map wp-map-lg", id: "newsMap", role: "region", "aria-label": t("map") });
    slots.legend = h("div", {}); slots.country = h("div", {}); slots.region = h("div", {}); slots.list = h("div", {}); slots.listHead = h("div", {});
    fill(app, slots.controls, slots.summary,
      h("section", { class: "wp-card", "aria-labelledby": "nMapT" }, h("h2", { id: "nMapT", text: t("map") }), h("p", { class: "wp-footnote", text: t("mapHint") }), slots.mapBox, slots.legend),
      h("div", { class: "wp-grid-2" },
        h("section", { class: "wp-card", "aria-labelledby": "nCt" }, h("h2", { id: "nCt", text: t("countries") }), slots.country),
        h("section", { class: "wp-card", "aria-labelledby": "nRg" }, h("h2", { id: "nRg", text: t("region") }), slots.region)),
      h("section", { class: "wp-card", "aria-labelledby": "nAr" }, h("h2", { id: "nAr", text: t("articles") }), slots.listHead, slots.list),
      h("section", { class: "wp-card", "aria-labelledby": "nVf" }, h("h2", { id: "nVf", text: t("verifTitle") }), h("p", { text: t("verif") }),
        h("p", {}, h("a", { href: "map.html", text: t("riskLink") }))),
      h("section", { class: "wp-card", "aria-labelledby": "nSrc" }, h("h2", { id: "nSrc", text: t("sources") }), h("p", { text: t("method") })));
    initMap(slots.mapBox);
    built = true;
  }

  function render() {
    if (!ST.articles) return;
    if (!built) build();
    compute(); sync();
    fill(slots.controls, controls());
    fill(slots.summary, summary());
    fill(slots.legend, legend()); paintSwatches(slots.legend);
    fill(slots.country, countryTable());
    fill(slots.region, regionTable());
    const sel = state.country !== "all";
    fill(slots.listHead, sel ? h("p", { class: "wp-chips-row" }, h("strong", { text: nameOf(state.country) }), " ",
      h("button", { type: "button", class: "wp-btn", onclick: () => { state.country = "all"; render(); }, text: t("clear") }), " ",
      h("a", { href: "country.html?c=" + encodeURIComponent(state.country), text: t("openCountry") })) : null);
    fill(slots.list, state.layer === "risk" ? [h("h3", { text: t("riskReports") }), riskPanel()] : articlePanel());
    if (ST.layer) ST.layer.setStyle(styleFor);
    document.documentElement.setAttribute("data-news-map-state", `${state.layer}:${ST.view.total}`);
  }

  async function loadMonitor() {
    if (ST.monitor || !MON) return;
    try { ST.monitor = await MON.fetchFeed(); ST.monitorFailed = false; } catch { ST.monitorFailed = true; }
    render();
  }
  async function load() {
    $("nTitle").textContent = t("title"); $("nLead").textContent = t("lead"); document.title = t("title") + " | WRLDLINE NEWS";
    fill($("nApp"), h("p", { class: "wp-skeleton", text: t("loading") }));
    const [rows, list] = await Promise.all([
      P.publicNews(1000).catch(() => null),
      WB.fetchCountryList({ storage: session }).catch(() => null)
    ]);
    if (!Array.isArray(rows)) {
      fill($("nApp"), h("div", { class: "wp-notice warn" }, h("p", { text: t("error") }), h("button", { type: "button", class: "wp-btn", onclick: () => location.reload(), text: t("retry") })));
      return;
    }
    ST.articles = rows.map((r) => F.toArticle(r, lang));
    ST.regionMap = list; ST.loadedAt = Date.now();
    render();
    if (state.layer === "risk") loadMonitor();
  }
  load();
})();
