/* WRLDLINE country directory and profiles. Joins the history atlas (editorial, Arabic), published news
   (public RPC) and World Bank indicators. Every number shown carries its source and update date; missing
   data is reported as missing. No innerHTML: all nodes are built with DOM builders. */
(() => {
  "use strict";
  const P = window.WLProduct, F = window.WLFeed, E = window.WLEditorial, C = window.WLCountry, WB = window.WLWorldBank, CH = window.WLCharts, TAX = window.WRLDLINE_TAXONOMY;
  const { h } = P;
  const lang = P.currentLang();
  const mode = document.body.dataset.mode;
  const $ = (id) => document.getElementById(id);
  const storage = P.safeStorage();
  let fetchStorage = null;
  try { fetchStorage = window.sessionStorage; fetchStorage.getItem("wl:probe"); } catch { fetchStorage = null; }

  const L = {
    ar: {
      dirTitle: "الدول والملفات القطرية", dirLead: "ابحث عن أي دولة لتصل إلى ملفها: الأخبار المنشورة، والتاريخ، والمؤشرات الاقتصادية والاجتماعية من البنك الدولي.",
      search: "ابحث عن دولة", atlasOnly: "الدول التي لها ملف تاريخي تحريري فقط", atlasBadge: "ملف تاريخي", none: "لا توجد دول مطابقة.", count: "دولة",
      kicker: "ملف الدولة", notFound: "لم نجد هذه الدولة. اختر دولة من الدليل.", backDir: "دليل الدول",
      follow: "تابع هذه الدولة", following: "تتابع هذه الدولة", openFeed: "افتح صفحتك الشخصية", followErr: "تعذر حفظ المتابعة.", followLocal: "تُحفظ المتابعة على هذا الجهاز حتى تسجل الدخول.",
      navOverview: "نظرة عامة", navNews: "الأخبار", navTimeline: "التسلسل الزمني", navPolitics: "السياسة", navEconomy: "الاقتصاد", navSociety: "المجتمع", navCulture: "الثقافة", navScience: "العلوم والتقنية", navMap: "الخريطة", navSources: "المصادر",
      overview: "نظرة عامة", news: "آخر الأخبار", timeline: "التسلسل الزمني", politics: "السياسة", economy: "الاقتصاد", society: "المجتمع", culture: "الثقافة", science: "العلوم والتقنية", map: "الموقع الجغرافي", sources: "المصادر والمراجع", related: "أخبار ذات صلة",
      capital: "العاصمة", region: "المنطقة (تصنيف البنك الدولي)", income: "فئة الدخل (البنك الدولي)", government: "نظام الحكم", languages: "اللغات", religion: "الدين",
      loading: "جارٍ التحميل…", retry: "إعادة المحاولة", unavailable: "تعذر تحميل البيانات الآن. لم نعرض أي أرقام بديلة.", noData: "لا توجد بيانات منشورة لهذا المؤشر",
      noNews: "لا توجد أخبار منشورة حالياً مرتبطة بهذه الدولة في أرشيفنا. لا يعني ذلك غياب الأحداث، بل أنه لا يوجد خبر منشور مصنف لها.",
      newsMeta: "أخبار منشورة مصنفة لهذه الدولة", confirmed: "مؤكد", unconfirmed: "متطور/غير مؤكد", disputed: "متنازع عليه", total: "الإجمالي",
      newsNote: "تُعرض الأخبار المنشورة فقط، وتُميَّز حالة التحقق لكل خبر. التقارير المتطورة لم تُؤكد بعد.",
      wbSource: "المصدر: البنك الدولي، مؤشرات التنمية العالمية", wbUpdated: "آخر تحديث لدى المصدر", wbFetched: "تم الجلب", indicator: "المؤشر", year: "السنة", value: "القيمة",
      chart: "عرض الرسم لمؤشر", yearSuffix: "آخر سنة متاحة", change: "التغير عن السنة السابقة", up: "ارتفاع", down: "انخفاض", flat: "دون تغيير",
      govNote: "مؤشرات الحوكمة تقديرات إحصائية مركبة تعتمد على مسوح وآراء خبراء، وليست تقييماً رسمياً من WRLDLINE ولا ترتيباً للشرعية.",
      atlasNote: "المحتوى التاريخي والثقافي من أطلس WRLDLINE التاريخي (تحرير بشري، بالعربية).", atlasMissing: "لا يوجد بعد ملف تاريخي تحريري لهذه الدولة في الأطلس. نعرض البيانات الموثقة فقط.",
      enUntranslated: "هذا النص متاح بالعربية فقط حالياً.", openAtlas: "افتح الملف التاريخي الكامل", exploreAtlas: "استكشف الأطلس التاريخي",
      scopeNote: { mesopotamia: "ملف الأطلس يغطي بلاد الرافدين تاريخياً وليس العراق الحديث وحده.", "west-african-empires": "ملف الأطلس يغطي إمبراطوريات غرب أفريقيا وليس مالي الحديثة وحدها.", "korean-peninsula": "ملف الأطلس يغطي شبه الجزيرة الكورية بشطريها.", "rome-and-italy": "ملف الأطلس يغطي روما وإيطاليا عبر العصور.", anatolia: "ملف الأطلس يغطي الأناضول وتركيا عبر العصور." },
      keyPeriods: "محطات رئيسية", atlasEvents: "أحداث في الأطلس", atlasFigures: "أرقام مرجعية تقديرية من الأطلس (مؤرخة، وليست بيانات رسمية حديثة)",
      mapNote: "الموقع من بيانات البنك الدولي والحدود من Natural Earth (مقياس 1:110م، قد تغيب الدول الصغيرة جداً).", capitalMarker: "العاصمة", mapFail: "تعذر تحميل الخريطة.", noMap: "لا تتوفر إحداثيات موثقة لهذه الدولة.",
      methodology: "المنهجية", methodText: "الأرقام تُجلب مباشرة من واجهة البنك الدولي عند فتح الصفحة وتُخزَّن في جلسة المتصفح ست ساعات. لا نقدّر ولا نملأ القيم الناقصة. المحتوى التاريخي تحريري ويُنسب إلى مراجعه.",
      newsSources: "مصادر الأخبار المعروضة", indicatorsUsed: "المؤشرات المستخدمة", sourcesAtlas: "مراجع الملف التاريخي", sourcesNone: "لا توجد مراجع تاريخية.",
      economyLinks: "الأسواق والعملات", marketsLink: "افتح صفحة الأسواق"
    },
    en: {
      dirTitle: "Countries and country profiles", dirLead: "Find any country to reach its profile: published news, history, and World Bank economic and social indicators.",
      search: "Search for a country", atlasOnly: "Only countries with an editorial history profile", atlasBadge: "History profile", none: "No matching countries.", count: "countries",
      kicker: "COUNTRY PROFILE", notFound: "We could not find that country. Choose one from the directory.", backDir: "Country directory",
      follow: "Follow this country", following: "Following this country", openFeed: "Open my feed", followErr: "Could not save the follow.", followLocal: "Follows are stored on this device until you sign in.",
      navOverview: "Overview", navNews: "News", navTimeline: "Timeline", navPolitics: "Politics", navEconomy: "Economy", navSociety: "Society", navCulture: "Culture", navScience: "Science & technology", navMap: "Map", navSources: "Sources",
      overview: "Overview", news: "Latest news", timeline: "Timeline", politics: "Politics", economy: "Economy", society: "Society", culture: "Culture", science: "Science and technology", map: "Geographic location", sources: "Sources and references", related: "Related articles",
      capital: "Capital", region: "Region (World Bank classification)", income: "Income group (World Bank)", government: "Government", languages: "Languages", religion: "Religion",
      loading: "Loading…", retry: "Retry", unavailable: "Data could not be loaded right now. No substitute numbers are shown.", noData: "No published data for this indicator",
      noNews: "There are currently no published articles tagged to this country in our archive. That does not mean nothing is happening; it means no published story is classified to it.",
      newsMeta: "Published articles classified to this country", confirmed: "Confirmed", unconfirmed: "Developing / unconfirmed", disputed: "Disputed", total: "Total",
      newsNote: "Only published articles appear, each with its verification status. Developing reports are not yet confirmed.",
      wbSource: "Source: World Bank, World Development Indicators", wbUpdated: "Last updated by the source", wbFetched: "Retrieved", indicator: "Indicator", year: "Year", value: "Value",
      chart: "Show chart for", yearSuffix: "Latest year available", change: "Change from previous year", up: "up", down: "down", flat: "unchanged",
      govNote: "Governance indicators are statistical composites based on surveys and expert perceptions. They are not an official WRLDLINE assessment or a ranking of legitimacy.",
      atlasNote: "Historical and cultural content comes from the WRLDLINE history atlas (human-edited, in Arabic).", atlasMissing: "The atlas has no editorial history profile for this country yet. Only verified data is shown.",
      enUntranslated: "This text is currently available in Arabic only.", openAtlas: "Open the full history profile", exploreAtlas: "Explore the history atlas",
      scopeNote: { mesopotamia: "The atlas profile covers historical Mesopotamia, not only modern Iraq.", "west-african-empires": "The atlas profile covers the West African empires, not only modern Mali.", "korean-peninsula": "The atlas profile covers the whole Korean peninsula, both states.", "rome-and-italy": "The atlas profile covers Rome and Italy across the ages.", anatolia: "The atlas profile covers Anatolia and Turkey across the ages." },
      keyPeriods: "Key periods", atlasEvents: "Events in the atlas", atlasFigures: "Approximate reference figures from the atlas (dated; not recent official data)",
      mapNote: "Location from World Bank data; borders from Natural Earth (1:110m, very small states may be missing).", capitalMarker: "Capital", mapFail: "The map could not be loaded.", noMap: "No verified coordinates for this country.",
      methodology: "Methodology", methodText: "Figures are fetched directly from the World Bank API when the page opens and cached in your browser session for six hours. We never estimate or fill missing values. Historical content is editorial and credited to its references.",
      newsSources: "News sources shown", indicatorsUsed: "Indicators used", sourcesAtlas: "History profile references", sourcesNone: "No historical references.",
      economyLinks: "Markets and currencies", marketsLink: "Open the markets page"
    }
  };
  const t = (k) => L[lang][k] ?? L.ar[k] ?? k;
  const flag = (iso3) => { const c = E.codeOf(iso3); return c ? String.fromCodePoint(...[...c].map((ch) => 127397 + ch.charCodeAt(0))) : ""; };
  const dirOf = (l) => (l === "ar" ? "rtl" : "ltr");
  const textNode = (text, l, tag = "p", cls) => h(tag, { class: cls, lang: l, dir: dirOf(l), text });

  /* ======================= directory ======================= */
  function renderDirectory() {
    document.title = t("dirTitle") + " | WRLDLINE NEWS";
    $("cTitle").textContent = t("dirTitle"); $("cLead").textContent = t("dirLead");
    const all = C.directory(lang, Object.keys(C.HISTORY_TO_ISO3));
    const state = { q: "", atlas: false };
    const list = h("ul", { class: "wp-countries", id: "countryList" });
    const count = h("p", { class: "wp-muted", "aria-live": "polite", id: "countryCount" });
    const draw = () => {
      const q = state.q.trim().toLowerCase();
      const rows = all.filter((c) => (!state.atlas || c.hasHistory) && (!q || c.name.toLowerCase().includes(q) || c.iso3.toLowerCase() === q || c.iso2.toLowerCase() === q));
      list.replaceChildren(...rows.map((c) => h("li", {}, h("a", { class: "wp-country-link", href: "country.html?c=" + c.iso3 },
        h("span", { class: "wp-flag", "aria-hidden": "true", text: flag(c.iso3) }), h("span", { text: c.name }),
        c.hasHistory ? h("span", { class: "wp-badge confirmed", text: t("atlasBadge") }) : null))));
      count.textContent = rows.length ? `${P.numberFormat(rows.length, lang)} ${t("count")}` : t("none");
    };
    $("cApp").replaceChildren(
      h("div", { class: "wp-filters wp-card" },
        h("label", { class: "wp-field", for: "countrySearch" }, t("search"), h("input", { class: "wp-input", id: "countrySearch", type: "search", autocomplete: "off", oninput: (e) => { state.q = e.target.value; draw(); } })),
        h("label", { class: "wp-check" }, h("input", { type: "checkbox", id: "atlasOnly", onchange: (e) => { state.atlas = e.target.checked; draw(); } }), " " + t("atlasOnly"))),
      count, list);
    draw();
  }

  /* ======================= profile ======================= */
  const catName = (k) => (TAX && TAX.categoryName ? TAX.categoryName(k, lang) : k);
  const fmtDate = (iso) => (iso ? P.dateFormat(iso, lang, { dateStyle: "medium" }) : "");
  const THEME_CATS = { politics: ["politics", "security"], economy: ["economy"], society: ["society", "health", "environment"], culture: ["culture", "sports"], science: ["science", "tech"] };

  function section(id, titleKey) {
    const body = h("div", { class: "wp-section-body" }, h("div", { class: "wp-skeleton", "aria-hidden": "true" }));
    const el = h("section", { class: "wp-card wp-section", id, "aria-labelledby": id + "H" }, h("h2", { id: id + "H", text: t(titleKey) }), body);
    return { el, body };
  }
  const errorBox = (retry) => h("div", { class: "wp-notice warn", role: "alert" }, t("unavailable") + " ", h("button", { class: "wp-btn", type: "button", onclick: retry, text: t("retry") }));

  function sourceFootnote(results) {
    const ok = results.filter((r) => r && r.ok);
    if (!ok.length) return null;
    const updated = ok.map((r) => r.lastUpdated).filter(Boolean).sort().pop();
    const fetched = ok.map((r) => r.fetchedAt).filter(Boolean).sort().pop();
    return h("p", { class: "wp-footnote" }, h("a", { href: WB.SOURCE.url, rel: "noopener", text: t("wbSource") }),
      updated ? ` · ${t("wbUpdated")}: ${fmtDate(updated)}` : "", fetched ? ` · ${t("wbFetched")}: ${P.dateFormat(fetched, lang, { dateStyle: "medium", timeStyle: "short" })}` : "");
  }

  function indicatorCards(group, ctx, results) {
    const ids = WB.indicatorsIn(group);
    const cards = [], missing = [], chartable = [];
    for (const id of ids) {
      const def = WB.INDICATORS[id], res = results[id];
      const s = res && res.ok ? WB.series(res.rows, ctx.iso3) : [];
      if (!s.length) { missing.push(def[lang]); continue; }
      chartable.push(id);
      const last = s[s.length - 1], ch = WB.change(s);
      const dirWord = ch ? (Math.abs(ch.delta) < 1e-9 ? t("flat") : ch.delta > 0 ? t("up") : t("down")) : "";
      cards.push(h("li", { class: "wp-stat", "data-indicator": id },
        h("span", { class: "wp-stat-label", text: def[lang] }),
        h("strong", { class: "wp-stat-value", dir: "ltr", text: WB.formatValue(last.value, def.unit, lang) }),
        h("span", { class: "wp-stat-meta", text: `${last.date}` + (ch && ch.to - ch.from === 1 ? ` · ${t("change")}: ${dirWord}` : "") })));
    }
    return { cards, missing, chartable };
  }

  function indicatorBlock(group, ctx, results, retry) {
    const failed = WB.indicatorsIn(group).every((id) => !(results[id] && results[id].ok));
    if (failed) return [errorBox(retry)];
    const { cards, missing, chartable } = indicatorCards(group, ctx, results);
    const out = [];
    if (cards.length) out.push(h("ul", { class: "wp-stats" }, cards));
    if (chartable.length) {
      const holder = h("div", { class: "wp-chart-holder" });
      const draw = (id) => {
        const def = WB.INDICATORS[id];
        holder.replaceChildren(CH.lineChart(document, {
          title: def[lang] + " — " + ctx.name, description: `${t("wbSource")}`, rtl: false,
          series: [{ name: ctx.name, points: WB.series(results[id].rows, ctx.iso3).map((p) => ({ x: p.date, y: p.value })) }],
          formatY: (v) => WB.formatValue(v, def.unit, lang), labels: { empty: t("noData"), year: t("year") }
        }));
      };
      const sel = h("select", { class: "wp-select", id: group + "Select", onchange: (e) => draw(e.target.value) },
        chartable.map((id) => h("option", { value: id, text: WB.INDICATORS[id][lang] })));
      out.push(h("label", { class: "wp-field", for: group + "Select" }, t("chart"), sel), holder);
      draw(chartable[0]);
    }
    const foot = sourceFootnote(WB.indicatorsIn(group).map((id) => results[id]));
    if (foot) out.push(foot);
    if (missing.length) out.push(h("p", { class: "wp-footnote" }, t("noData") + ": " + missing.join(lang === "ar" ? "، " : ", ")));
    return out;
  }

  function relatedList(articles, cats) {
    const items = articles.filter((a) => cats.includes(a.category)).slice(0, 4);
    if (!items.length) return null;
    return h("div", { class: "wp-related" }, h("h3", { text: t("related") }), h("ul", { class: "wp-list" }, items.map((a) => P.articleItem(a, lang, h("span", { text: catName(a.category) })))));
  }

  function atlasList(pairs, ctx) {
    return h("div", { class: "wp-atlas" }, pairs.map(([title, body]) => {
      const lt = C.localize(title, lang, ctx.enMap), lb = C.localize(body, lang, ctx.enMap);
      const translated = lb.translated;
      return h("article", { class: "wp-atlas-item" }, textNode(lt.text, lt.lang, "h3"), textNode(lb.text, lb.lang), !translated ? h("p", { class: "wp-footnote", text: t("enUntranslated") }) : null);
    }));
  }

  async function loadAtlasScripts() {
    if (window.WL_HISTORY) return window.WL_HISTORY;
    const files = ["history-data.js", "history-entities-a.js", "history-entities-b.js", "history-entities-c.js", "history-events.js"].concat(lang === "en" ? ["history-en.js"] : []);
    for (const f of files) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script"); s.src = f; s.async = false; s.onload = resolve; s.onerror = () => reject(new Error(f));
        document.head.append(s);
      });
    }
    return window.WL_HISTORY;
  }

  async function renderProfile() {
    const params = new URLSearchParams(location.search);
    const iso3 = C.normalizeIso3(params.get("c"));
    $("cKicker").textContent = t("kicker");
    if (!iso3) {
      $("cTitle").textContent = t("kicker"); document.title = t("kicker") + " | WRLDLINE NEWS";
      $("cApp").replaceChildren(h("p", { class: "wp-notice warn", role: "alert" }, t("notFound") + " ", h("a", { href: "countries.html", text: t("backDir") })));
      return;
    }
    const name = E.countryName(iso3, lang) || iso3;
    document.title = `${name} | ${t("kicker")} | WRLDLINE NEWS`;
    $("cTitle").textContent = `${flag(iso3)} ${name}`;
    const ctx = { iso3, name, enMap: null };
    const historyId = C.historyIdFor(iso3);

    const sections = [["overview", "navOverview"], ["news", "navNews"], ["timeline", "navTimeline"], ["politics", "navPolitics"], ["economy", "navEconomy"], ["society", "navSociety"], ["culture", "navCulture"], ["science", "navScience"], ["map", "navMap"], ["sources", "navSources"]];
    const S = {}; for (const [id] of sections) S[id] = section(id, id === "map" ? "map" : id);
    const nav = h("nav", { class: "wp-subnav", "aria-label": t("kicker") }, h("ul", {}, sections.map(([id, key]) => h("li", {}, h("a", { href: "#" + id, text: t(key) })))));
    const followBtn = h("button", { class: "wp-btn primary", type: "button", id: "followBtn", "aria-pressed": "false", text: t("follow") });
    const followNote = h("p", { class: "wp-footnote", id: "followNote" });
    $("cApp").replaceChildren(h("div", { class: "wp-row wp-actions" }, followBtn, h("a", { class: "wp-btn", href: "for-you.html", text: t("openFeed") }), h("a", { class: "wp-btn", href: "countries.html", text: t("backDir") })), followNote, nav, ...sections.map(([id]) => S[id].el));
    $("cLead").textContent = "";

    initFollow(iso3, followBtn, followNote);

    /* ---- data requests start together ---- */
    const env = { storage: fetchStorage };
    const year = new Date().getFullYear();
    const results = {};
    const loadIndicators = () => Promise.all(Object.keys(WB.INDICATORS).map(async (id) => { results[id] = await WB.fetchIndicator({ countries: [iso3], indicator: id, from: 1990, to: year }, env); }));
    const pMeta = WB.fetchCountry(iso3, env);
    const pInd = loadIndicators();
    const pNews = P.publicNews(600).then((rows) => (Array.isArray(rows) ? rows : []).map((r) => F.toArticle(r, lang)), () => null);
    const pAtlas = historyId ? loadAtlasScripts().then((H) => H, () => null) : Promise.resolve(null);

    const [meta, atlasData, news] = await Promise.all([pMeta, pAtlas, pNews]);
    ctx.enMap = lang === "en" ? window.WRLDLINE_HISTORY_EN || {} : null;
    const entity = atlasData && historyId ? atlasData.entities.find((e) => e.id === historyId) : null;
    const atlas = entity ? C.atlasSections(entity, atlasData.events) : null;
    const articles = news ? C.newsFor(news, iso3) : [];

    /* overview */
    const rows = C.overviewRows({ meta, atlas, lang, enMap: ctx.enMap });
    const ov = [];
    if (atlas && atlas.scope) ov.push(h("p", { class: "wp-notice", text: t("scopeNote")[atlas.scope] }));
    if (rows.length) ov.push(h("dl", { class: "wp-dl" }, rows.map((r) => [h("dt", { text: t(r.key) }), h("dd", { lang: r.lang, dir: dirOf(r.lang), text: r.value, "data-source": r.source })])));
    if (atlas && atlas.summary) { const l = C.localize(atlas.summary, lang, ctx.enMap); ov.push(textNode(l.text, l.lang)); if (!l.translated) ov.push(h("p", { class: "wp-footnote", text: t("enUntranslated") })); }
    if (!atlas) ov.push(h("p", { class: "wp-notice", text: t("atlasMissing") }), h("a", { class: "wp-btn", href: "history-explore.html", text: t("exploreAtlas") }));
    else ov.push(h("a", { class: "wp-btn", href: "history-dossier.html?id=" + encodeURIComponent(atlas.id), text: t("openAtlas") }));
    if (!rows.length && !atlas) ov.unshift(h("p", { class: "wp-notice warn", text: t("unavailable") }));
    S.overview.body.replaceChildren(...ov);

    /* news */
    if (!news) S.news.body.replaceChildren(errorBox(() => location.reload()));
    else if (!articles.length) S.news.body.replaceChildren(h("p", { class: "wp-notice", text: t("noNews") }));
    else {
      const sum = C.trustSummary(articles);
      S.news.body.replaceChildren(
        h("p", { class: "wp-muted", text: t("newsNote") }),
        h("ul", { class: "wp-trust-sum", "aria-label": t("newsMeta") },
          h("li", { text: `${t("total")}: ${sum.total}` }), h("li", { class: "wp-badge confirmed", text: `${t("confirmed")}: ${sum.confirmed}` }),
          h("li", { class: "wp-badge developing", text: `${t("unconfirmed")}: ${sum.unconfirmed}` }), h("li", { class: "wp-badge disputed", text: `${t("disputed")}: ${sum.disputed}` })),
        h("ul", { class: "wp-list" }, articles.slice(0, 12).map((a) => P.articleItem(a, lang, h("span", { text: catName(a.category) })))));
    }

    /* timeline */
    if (!atlas) S.timeline.body.replaceChildren(h("p", { class: "wp-notice", text: t("atlasMissing") }));
    else {
      const parts = [h("p", { class: "wp-footnote", text: t("atlasNote") })];
      if (atlas.timeline.length) parts.push(h("h3", { text: t("keyPeriods") }), h("ol", { class: "wp-timeline" }, atlas.timeline.map((r) => { const d = C.localize(r.date, lang, ctx.enMap), x = C.localize(r.text, lang, ctx.enMap); return h("li", {}, textNode(d.text, d.lang, "strong"), textNode(x.text, x.lang, "span")); })));
      if (atlas.events.length) parts.push(h("h3", { text: t("atlasEvents") }), h("ol", { class: "wp-timeline" }, atlas.events.map((e) => { const d = C.localize(e.label, lang, ctx.enMap), x = C.localize(e.title, lang, ctx.enMap); return h("li", {}, textNode(d.text, d.lang, "strong"), textNode(x.text, x.lang, "span")); })));
      if (lang === "en" && atlas.timeline.some((r) => !C.localize(r.text, "en", ctx.enMap).translated)) parts.push(h("p", { class: "wp-footnote", text: t("enUntranslated") }));
      S.timeline.body.replaceChildren(...parts);
    }

    /* culture (atlas only) */
    const cultureParts = [];
    if (atlas && atlas.culture.length) cultureParts.push(h("p", { class: "wp-footnote", text: t("atlasNote") }), atlasList(atlas.culture, ctx));
    else cultureParts.push(h("p", { class: "wp-notice", text: t("atlasMissing") }));
    const cr = relatedList(articles, THEME_CATS.culture); if (cr) cultureParts.push(cr);
    S.culture.body.replaceChildren(...cultureParts);

    /* map */
    renderMap(S.map.body, ctx, meta, atlas);

    /* sources (without indicator data yet) */
    const renderSources = () => {
      const parts = [h("h3", { text: t("methodology") }), h("p", { class: "wp-muted", text: t("methodText") })];
      const used = Object.keys(WB.INDICATORS).filter((id) => results[id] && results[id].ok && WB.series(results[id].rows, iso3).length);
      parts.push(h("ul", { class: "wp-list" }, h("li", {}, h("a", { href: WB.SOURCE.url, rel: "noopener", text: WB.SOURCE.name }))));
      if (used.length) parts.push(h("h3", { text: t("indicatorsUsed") }), h("ul", { class: "wp-list" }, used.map((id) => h("li", {}, h("a", { href: "https://data.worldbank.org/indicator/" + encodeURIComponent(id), rel: "noopener", text: WB.INDICATORS[id][lang] + " (" + id + ")" })))));
      parts.push(h("h3", { text: t("sourcesAtlas") }));
      parts.push(atlas && atlas.sources.length ? h("ul", { class: "wp-list" }, atlas.sources.map((s) => h("li", {}, h("a", { href: s.url, rel: "noopener", lang: "und", text: s.title || s.url }), s.type ? " · " + s.type : ""))) : h("p", { class: "wp-muted", text: t("sourcesNone") }));
      const names = [...new Set(articles.slice(0, 12).map((a) => a.source).filter(Boolean))];
      if (names.length) parts.push(h("h3", { text: t("newsSources") }), h("p", { class: "wp-muted", text: names.join(lang === "ar" ? "، " : ", ") }));
      S.sources.body.replaceChildren(...parts);
    };
    renderSources();

    /* indicator-driven sections */
    const paint = () => {
      for (const group of ["politics", "economy", "society", "science"]) {
        const body = [];
        if (group === "politics") {
          if (atlas && atlas.overview.government) { const l = C.localize(atlas.overview.government, lang, ctx.enMap); body.push(h("dl", { class: "wp-dl" }, h("dt", { text: t("government") }), h("dd", { lang: l.lang, dir: dirOf(l.lang), text: l.text }))); }
        }
        if (group === "society" && atlas) {
          for (const k of ["languages", "religion"]) if (atlas.overview[k]) { const l = C.localize(atlas.overview[k], lang, ctx.enMap); body.push(h("dl", { class: "wp-dl" }, h("dt", { text: t(k) }), h("dd", { lang: l.lang, dir: dirOf(l.lang), text: l.text }))); }
        }
        body.push(...indicatorBlock(group === "society" ? "society" : group, ctx, results, () => { S[group].body.replaceChildren(h("div", { class: "wp-skeleton" })); loadIndicators().then(() => { paint(); renderSources(); }); }));
        if (group === "society") body.push(...indicatorBlock("geography", ctx, results, () => {}).filter((n) => !n.classList || !n.classList.contains("wp-notice")));
        if (group === "politics") body.push(h("p", { class: "wp-footnote", text: t("govNote") }));
        if (group === "economy") body.push(h("p", { class: "wp-footnote" }, h("a", { href: "markets.html", text: t("marketsLink") })));
        const rel = relatedList(articles, THEME_CATS[group]); if (rel) body.push(rel);
        S[group].body.replaceChildren(...body);
      }
    };
    await pInd; paint(); renderSources();
    document.documentElement.setAttribute("data-country-ready", iso3);
  }

  /* ---------- map (Leaflet is vendored; no third-party tiles are requested) ---------- */
  function loadScript(src, integrity) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; if (integrity) { s.integrity = integrity; s.crossOrigin = "anonymous"; } s.onload = res; s.onerror = rej; document.head.append(s); }); }
  async function renderMap(body, ctx, meta, atlas) {
    const coords = C.countryCoords(meta, atlas);
    if (!coords) { body.replaceChildren(h("p", { class: "wp-notice", text: t("noMap") })); return; }
    const box = h("div", { class: "wp-map", id: "countryMap", role: "region", "aria-label": `${t("map")} — ${ctx.name}` });
    body.replaceChildren(box, h("p", { class: "wp-footnote", text: t("mapNote") }));
    try {
      if (!window.L) {
        const css = document.createElement("link");
        css.rel = "stylesheet"; css.href = "vendor/leaflet-1.9.4.css"; css.integrity = "sha256-M3v8pcq9A7OYFbJwD+vis7ft9VkhxZzUn4jssyghIwM="; css.crossOrigin = "anonymous";
        document.head.append(css);
        await loadScript("vendor/leaflet-1.9.4.js", "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=");
      }
      const geo = await (await fetch("vendor/natural-earth-countries-110m-v5.1.2.geojson")).json();
      const map = window.L.map(box, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, worldCopyJump: false });
      map.attributionControl.addAttribution("Natural Earth");
      const layer = window.L.geoJSON(geo, { style: (f) => f.properties.code === ctx.iso3 ? { color: "#0b5fa5", weight: 2, fillColor: "#0b5fa5", fillOpacity: 0.45 } : { color: "#8a8f98", weight: 0.6, fillColor: "#e6e8eb", fillOpacity: 0.7 } }).addTo(map);
      let target = null; layer.eachLayer((l) => { if (l.feature.properties.code === ctx.iso3) target = l; });
      if (target) map.fitBounds(target.getBounds(), { maxZoom: 6, padding: [20, 20] }); else map.setView(coords, 5);
      if (meta && meta.lat != null && meta.capital) window.L.circleMarker([meta.lat, meta.lon], { radius: 5, color: "#b7791f", fillOpacity: 1 }).addTo(map).bindTooltip(`${t("capitalMarker")}: ${meta.capital}`);
      document.documentElement.setAttribute("data-map-ready", target ? "highlighted" : "marker");
    } catch { body.replaceChildren(h("p", { class: "wp-notice warn", text: t("mapFail") })); }
  }

  /* ---------- follow (same tables as the personalised feed) ---------- */
  async function initFollow(iso3, btn, note) {
    const client = P.getClient();
    let user = null, following = false;
    const local = () => F.loadLocalFollows(storage);
    const paint = () => { btn.setAttribute("aria-pressed", String(following)); btn.textContent = following ? t("following") : t("follow"); };
    try {
      if (client) { const { data } = await client.auth.getSession(); user = data.session ? data.session.user : null; }
      if (user) { const { data, error } = await client.from("user_follows").select("target_value").eq("user_id", user.id).eq("target_type", "country").eq("target_value", iso3); if (!error) following = Boolean(data && data.length); }
      else following = local().country.includes(iso3);
    } catch { /* anonymous fallback */ }
    if (!user) note.textContent = t("followLocal");
    paint();
    btn.addEventListener("click", async () => {
      const want = !following;
      try {
        if (user) {
          const q = client.from("user_follows");
          const { error } = want ? await q.insert({ user_id: user.id, target_type: "country", target_value: iso3 }) : await q.delete().eq("user_id", user.id).eq("target_type", "country").eq("target_value", iso3);
          if (error && !(want && error.code === "23505")) throw error;
        } else {
          const f = local(); const v = F.validateFollow("country", iso3);
          if (want && F.followCount(f) >= F.MAX_FOLLOWS) throw new Error("limit");
          f.country = want ? [...new Set([...f.country, v.value])] : f.country.filter((x) => x !== v.value);
          storage.setItem(F.KEYS.follows, JSON.stringify(f));
        }
        following = want; paint(); note.textContent = user ? "" : t("followLocal");
      } catch { note.textContent = t("followErr"); }
    });
  }

  if (mode === "directory") renderDirectory(); else renderProfile();
})();
