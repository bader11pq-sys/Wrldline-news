/* WRLDLINE economic intelligence dashboard. Indicators: World Bank API (source and update date shown).
   Markets and currencies: the existing market-data service, normalised by WLMarkets. Nothing is estimated,
   interpolated or pre-filled; failures are shown as failures. DOM builders only (no innerHTML). */
(() => {
  "use strict";
  const P = window.WLProduct, E = window.WLEditorial, WB = window.WLWorldBank, CH = window.WLCharts, EC = window.WLEconomy, M = window.WLMarkets;
  const { h } = P;
  const lang = P.currentLang();
  const $ = (id) => document.getElementById(id);
  let session = null; try { session = window.sessionStorage; session.getItem("wl:probe"); } catch { session = null; }
  const MARKET_URL = P.SUPABASE_URL + "/functions/v1/market-data";

  const L = {
    ar: {
      title: "لوحات الذكاء الاقتصادي", lead: "مؤشرات اقتصادية رسمية من البنك الدولي لمقارنة الدول عبر الزمن، مع لقطة أسواق وعملات من مزود بيانات مستقل. لكل رقم مصدر وتاريخ تحديث، وما لا توجد له بيانات يظهر كغير متاح.",
      controls: "الاختيارات", addCountry: "أضف دولة للمقارنة", chooseCountry: "اختر دولة", remove: "إزالة", max: "الحد الأقصى ست دول.", indicator: "المؤشر", range: "الفترة", years: "سنة",
      matrix: "المؤشرات الرئيسية", matrixNote: "آخر قيمة منشورة لكل دولة. قد تختلف سنة القياس بين الدول.", history: "السلسلة التاريخية", compare: "مقارنة بين الدول", mixed: "تنبيه: سنة آخر قيمة تختلف بين الدول، فالمقارنة تقريبية.",
      markets: "الأسواق والعملات", marketsNote: "بيانات مزودين خارجيين وقد تكون متأخرة. تُعرض مع وقت الرصد ولا تُعد نصيحة استثمارية.",
      sources: "المصادر والتحديث", source: "المصدر: البنك الدولي، مؤشرات التنمية العالمية", updated: "آخر تحديث لدى المصدر", fetched: "تم الجلب", noData: "غير متاح", noSeries: "لا توجد بيانات منشورة لهذا المؤشر ضمن الفترة المختارة.",
      failedCountries: "تعذر جلب بيانات: ", unavailable: "تعذر تحميل البيانات الآن. لم نعرض أي أرقام بديلة.", retry: "إعادة المحاولة", loading: "جارٍ التحميل…",
      country: "الدولة", provider: "المزود", observed: "وقت الرصد", old: "أقدم من النافذة المرجعية", dated: "آخر قراءة من المزود", unknown: "وقت الرصد غير متاح", marketsDown: "بيانات الأسواق غير متاحة الآن. لم نعرض أي أسعار.",
      cat: { index: "مؤشرات", fx: "عملات", energy: "طاقة", metals: "معادن", crypto: "أصول رقمية", stock: "أسهم", etf: "صناديق", other: "أخرى" },
      methodology: "المنهجية", method: "تُجلب الأرقام مباشرة من واجهة البنك الدولي عند فتح الصفحة وتُخزَّن في جلسة المتصفح ست ساعات. القيم الناقصة تبقى ناقصة. أسعار الأسواق من خدمة البيانات الحالية في الموقع وتحمل وقت رصد كل مزود. روابط التحميل ثابتة، فيمكنك مشاركة اختياراتك عبر عنوان الصفحة.",
      markets_link: "افتح لوحة الأسعار الكاملة", countryPage: "ملف الدولة", feedHint: "الجدول قابل للتمرير أفقياً على الشاشات الصغيرة."
    },
    en: {
      title: "Economic intelligence dashboards", lead: "Official World Bank indicators to compare countries over time, plus a market and currency snapshot from an independent data provider. Every number carries its source and update date; anything without data is shown as unavailable.",
      controls: "Selections", addCountry: "Add a country to compare", chooseCountry: "Choose a country", remove: "Remove", max: "Up to six countries.", indicator: "Indicator", range: "Period", years: "years",
      matrix: "Key indicators", matrixNote: "Latest published value per country. The reference year can differ between countries.", history: "Historical series", compare: "Country comparison", mixed: "Note: the latest year differs between countries, so the comparison is approximate.",
      markets: "Markets and currencies", marketsNote: "Third-party provider data that may be delayed. Shown with the observation time; not investment advice.",
      sources: "Sources and updates", source: "Source: World Bank, World Development Indicators", updated: "Last updated by the source", fetched: "Retrieved", noData: "n/a", noSeries: "No published data for this indicator in the selected period.",
      failedCountries: "Data could not be fetched for: ", unavailable: "Data could not be loaded right now. No substitute numbers are shown.", retry: "Retry", loading: "Loading…",
      country: "Country", provider: "Provider", observed: "Observed", old: "Older than the reference window", dated: "Latest provider observation", unknown: "Observation time unavailable", marketsDown: "Market data is unavailable right now. No prices are shown.",
      cat: { index: "Indices", fx: "Currencies", energy: "Energy", metals: "Metals", crypto: "Crypto", stock: "Stocks", etf: "ETFs", other: "Other" },
      methodology: "Methodology", method: "Figures are fetched directly from the World Bank API when the page opens and cached in your browser session for six hours. Missing values stay missing. Market prices come from the site's existing market data service and carry each provider's observation time. Links are stable, so you can share your selections through the page address.",
      markets_link: "Open the full quote board", countryPage: "Country profile", feedHint: "The table scrolls horizontally on small screens."
    }
  };
  const t = (k) => L[lang][k] ?? L.ar[k] ?? k;
  const nameOf = (iso3) => E.countryName(iso3, lang) || iso3;
  const fmtStamp = (iso) => P.dateFormat(iso, lang, { dateStyle: "medium", timeStyle: "short" });
  const fmtDay = (iso) => P.dateFormat(iso, lang, { dateStyle: "medium" });
  const nowYear = new Date().getFullYear();
  const fill = (el, ...c) => el.replaceChildren(...c.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));

  const state = EC.parseState(location.search);
  const results = {};      // indicator id -> multi result
  const failedBy = {};     // indicator id -> failed country list
  let token = 0;
  const allCountries = E.iso3List().map((iso3) => ({ iso3, name: nameOf(iso3) })).filter((c) => c.name).sort((a, b) => a.name.localeCompare(b.name, lang));

  const sectionEl = (id, titleKey) => h("section", { class: "wp-card wp-section", id, "aria-labelledby": id + "H" }, h("h2", { id: id + "H", text: t(titleKey) }), h("div", { class: "wp-section-body", id: id + "Body" }, h("div", { class: "wp-skeleton" })));

  function syncUrl() { try { history.replaceState(null, "", "?" + EC.serializeState(state) + (new URLSearchParams(location.search).get("lang") ? "&lang=" + new URLSearchParams(location.search).get("lang") : "")); } catch { /* sandboxed */ } }

  function controls() {
    const box = h("div", { class: "wp-card wp-controls", role: "group", "aria-labelledby": "ctrlH" }, h("h2", { id: "ctrlH", class: "wp-sr", text: t("controls") }));
    const chips = h("ul", { class: "wp-chips", "aria-label": t("compare") });
    for (const iso3 of state.countries) {
      chips.append(h("li", {}, h("span", { class: "wp-chip is-on" }, h("a", { class: "wp-chip-link", href: "country.html?c=" + iso3, title: t("countryPage"), text: nameOf(iso3) }),
        h("button", { class: "wp-chip-x", type: "button", "aria-label": `${t("remove")}: ${nameOf(iso3)}`, disabled: state.countries.length < 2 ? true : false, onclick: () => { Object.assign(state, EC.removeCountry(state, iso3)); refresh(true); }, text: "×" }))));
    }
    const addSel = h("select", { class: "wp-select", id: "addCountry", disabled: state.countries.length >= EC.MAX_COUNTRIES ? true : false, onchange: (e) => { if (!e.target.value) return; Object.assign(state, EC.addCountry(state, e.target.value)); refresh(true); } },
      h("option", { value: "", text: t("chooseCountry") }), allCountries.filter((c) => !state.countries.includes(c.iso3)).map((c) => h("option", { value: c.iso3, text: c.name })));
    const indSel = h("select", { class: "wp-select", id: "indicatorSel", onchange: (e) => { state.indicator = e.target.value; refresh(false); } },
      EC.dashboardIndicators().map((id) => h("option", { value: id, selected: id === state.indicator ? true : false, text: WB.INDICATORS[id][lang] })));
    const rangeSel = h("select", { class: "wp-select", id: "rangeSel", onchange: (e) => { state.years = Number(e.target.value); refresh(false); } },
      EC.RANGES.map((y) => h("option", { value: y, selected: y === state.years ? true : false, text: `${P.numberFormat(y, lang)} ${t("years")}` })));
    box.append(chips, h("div", { class: "wp-filters" },
      h("label", { class: "wp-field", for: "addCountry" }, t("addCountry"), addSel),
      h("label", { class: "wp-field", for: "indicatorSel" }, t("indicator"), indSel),
      h("label", { class: "wp-field", for: "rangeSel" }, t("range"), rangeSel)),
      ...(state.countries.length >= EC.MAX_COUNTRIES ? [h("p", { class: "wp-footnote", text: t("max") })] : []));
    return box;
  }

  function stamp(list) {
    const ok = list.filter((r) => r && r.ok);
    if (!ok.length) return null;
    const upd = ok.map((r) => r.lastUpdated).filter(Boolean).sort().pop(), got = ok.map((r) => r.fetchedAt).filter(Boolean).sort().pop();
    return h("p", { class: "wp-footnote", "data-stamp": "wb" }, h("a", { href: WB.SOURCE.url, rel: "noopener", text: t("source") }),
      upd ? ` · ${t("updated")}: ${fmtDay(upd)}` : "", got ? ` · ${t("fetched")}: ${fmtStamp(got)}` : "");
  }
  const retryBox = () => h("div", { class: "wp-notice warn", role: "alert" }, t("unavailable") + " ", h("button", { class: "wp-btn", type: "button", onclick: () => refresh(true), text: t("retry") }));

  function renderMatrix() {
    const body = $("matrixBody"), ids = EC.dashboardIndicators();
    if (ids.every((id) => !(results[id] && results[id].ok))) { fill(body, retryBox()); return; }
    const m = EC.matrix(results, state.countries, ids);
    const head = h("tr", {}, h("th", { scope: "col", text: t("indicator") }), state.countries.map((c) => h("th", { scope: "col", text: nameOf(c) })));
    const rows = m.map((r) => h("tr", {}, h("th", { scope: "row", text: r.def[lang] }),
      r.cells.map((c) => h("td", { dir: "ltr" }, c.value === null ? h("span", { class: "wp-muted", text: t("noData") }) : [h("strong", { text: WB.formatValue(c.value, r.def.unit, lang) }), h("span", { class: "wp-year", text: ` (${c.year})` })]))));
    fill(body, h("p", { class: "wp-muted", text: t("matrixNote") }), h("div", { class: "wp-table-wrap", tabindex: "0", role: "region", "aria-label": t("matrix") }, h("table", { class: "wp-table" }, h("thead", {}, head), h("tbody", {}, rows))),
      stamp(ids.map((id) => results[id])));
  }

  function renderHistory() {
    const body = $("historyBody"), res = results[state.indicator], def = WB.INDICATORS[state.indicator];
    if (!res || !res.ok) { fill(body, retryBox()); return; }
    const series = EC.chartSeries(res, state.countries, state.years, nowYear).map((s) => ({ name: nameOf(s.iso3), points: s.points }));
    const parts = [h("h3", { text: def[lang] }), CH.lineChart(document, { title: def[lang], description: t("source"), series, formatY: (v) => WB.formatValue(v, def.unit, lang), labels: { empty: t("noSeries"), year: t("country") } })];
    const missing = state.countries.filter((c, i) => !series[i].points.length).map(nameOf);
    if (missing.length && missing.length < state.countries.length) parts.push(h("p", { class: "wp-footnote", text: `${t("noSeries")} ${missing.join(lang === "ar" ? "، " : ", ")}` }));
    if (failedBy[state.indicator] && failedBy[state.indicator].length) parts.push(h("p", { class: "wp-footnote", text: t("failedCountries") + failedBy[state.indicator].map(nameOf).join(", ") }));
    parts.push(stamp([res]));
    fill(body, ...parts);
  }

  function renderCompare() {
    const body = $("compareBody"), res = results[state.indicator], def = WB.INDICATORS[state.indicator];
    if (!res || !res.ok) { fill(body, retryBox()); return; }
    const cmp = EC.comparison(res, state.countries);
    fill(body, h("h3", { text: def[lang] }),
      CH.barChart(document, { title: def[lang], items: cmp.items.map((i) => ({ label: nameOf(i.iso3), value: i.value, year: i.year })), formatValue: (v) => WB.formatValue(v, def.unit, lang), labels: { noData: t("noData") } }),
      cmp.mixedYears ? h("p", { class: "wp-notice", text: t("mixed") }) : null, stamp([res]));
  }

  /* ---------- markets: existing service, validated by WLMarkets ---------- */
  async function feed(mode) {
    const response = await fetch(`${MARKET_URL}?mode=${mode}`, { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("feed");
    return response.json();
  }
  const quoteFmt = (q) => new Intl.NumberFormat(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", { maximumFractionDigits: q.price < 1 ? 6 : 4, minimumFractionDigits: 2 }).format(q.price) + " " + q.currency;
  async function renderMarkets() {
    const body = $("marketsBody");
    let rows = [], fx = null;
    const [q, f] = await Promise.allSettled([feed("quotes"), feed("fx")]);
    if (q.status === "fulfilled") rows = M.quotes(q.value.quotes);
    if (f.status === "fulfilled") fx = M.normalize(f.value.quote, Date.now(), true);
    const all = fx ? [fx, ...rows.filter((r) => r.symbol !== fx.symbol)] : rows;
    if (!all.length) { fill(body, h("p", { class: "wp-notice warn", role: "alert", text: t("marketsDown") })); return; }
    const groups = EC.groupQuotes(all);
    const fmtObs = (ms) => ms ? new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(ms) + (lang === "en" ? " (Riyadh)" : " (الرياض)") : t("unknown");
    fill(body, h("p", { class: "wp-muted", text: t("marketsNote") }),
      ...groups.map((g) => h("div", { class: "wp-market-group" }, h("h3", { text: t("cat")[g.category] || g.category }),
        h("div", { class: "wp-table-wrap", tabindex: "0", role: "region", "aria-label": t("cat")[g.category] }, h("table", { class: "wp-table" },
          h("thead", {}, h("tr", {}, h("th", { scope: "col", text: t("indicator") }), h("th", { scope: "col", text: "" }), h("th", { scope: "col", text: t("observed") }), h("th", { scope: "col", text: t("provider") }))),
          h("tbody", {}, g.quotes.slice(0, 12).map((qt) => h("tr", {}, h("th", { scope: "row", text: lang === "en" ? qt.label : qt.labelAr }), h("td", { dir: "ltr" }, h("strong", { text: quoteFmt(qt) }), qt.changePercent === null ? null : h("span", { class: "wp-year", text: ` ${qt.changePercent > 0 ? "+" : ""}${qt.changePercent.toFixed(2)}%` })),
            h("td", {}, h("span", { text: fmtObs(qt.timestamp) }), h("br"), h("span", { class: "wp-footnote", text: t(qt.freshness) })), h("td", { text: qt.provider })))))))),
      h("p", { class: "wp-footnote" }, h("a", { href: "markets.html", text: t("markets_link") })));
  }

  function renderSources() {
    const ids = EC.dashboardIndicators().filter((id) => results[id] && results[id].ok);
    fill($("sourcesBody"), h("h3", { text: t("methodology") }), h("p", { class: "wp-muted", text: t("method") }),
      h("ul", { class: "wp-list" }, h("li", {}, h("a", { href: WB.SOURCE.url, rel: "noopener", text: WB.SOURCE.name })),
        ids.map((id) => h("li", {}, h("a", { href: "https://data.worldbank.org/indicator/" + encodeURIComponent(id), rel: "noopener", text: `${WB.INDICATORS[id][lang]} (${id})` })))), stamp(ids.map((id) => results[id])));
  }

  async function refresh(reloadAll) {
    const mine = ++token;
    syncUrl();
    fill($("controls"), controls());
    if (reloadAll || !Object.keys(results).length) {
      for (const id of Object.keys(results)) delete results[id];
      for (const s of ["matrix", "history", "compare"]) $(s + "Body").replaceChildren(h("div", { class: "wp-skeleton", "aria-hidden": "true" }));
      await Promise.all(EC.dashboardIndicators().map(async (id) => {
        const r = await WB.fetchIndicatorMulti({ countries: state.countries, indicator: id, from: nowYear - 36, to: nowYear }, { storage: session });
        if (mine !== token) return;
        results[id] = r; failedBy[id] = r.failed || [];
      }));
      if (mine !== token) return;
      renderMatrix(); renderSources();
    }
    renderHistory(); renderCompare();
    $("live").textContent = `${WB.INDICATORS[state.indicator][lang]} — ${state.countries.map(nameOf).join(lang === "ar" ? "، " : ", ")}`;
    document.documentElement.setAttribute("data-economy-ready", String(mine));
  }

  function init() {
    document.title = t("title") + " | WRLDLINE NEWS";
    $("eTitle").textContent = t("title"); $("eLead").textContent = t("lead");
    fill($("eApp"), h("p", { id: "live", class: "wp-sr", "aria-live": "polite" }), h("div", { id: "controls" }),
      sectionEl("matrix", "matrix"), sectionEl("history", "history"), sectionEl("compare", "compare"), sectionEl("markets", "markets"), sectionEl("sources", "sources"));
    refresh(true);
    renderMarkets();
  }
  init();
})();
