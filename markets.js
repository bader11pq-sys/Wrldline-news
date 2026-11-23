(() => {
  "use strict";
  const $ = id => document.getElementById(id), M = window.WLMarkets;
  const safeGet = key => { try { return localStorage.getItem(key); } catch { return ""; } };
  const safeSet = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  const requested = new URLSearchParams(location.search).get("lang");
  const lang = requested || safeGet("wrldline:language"), en = lang === "en";
  const tr = (ar, english) => en ? english : ar;
  const locales = tr("ar-SA-u-ca-gregory", "en-US");
  const base = "https://vmaxbnogmmfyrcucapnq.supabase.co/functions/v1/market-data";
  const state = { rows: [], fx: null, checked: 0, fxChecked: 0, error: false, fxError: false, busy: false, compared: [] };
  const catalog = {
    all: ["كل الفئات", "All assets"], stock: ["أسهم", "Stocks"], etf: ["صناديق", "ETFs"], crypto: ["أصول رقمية", "Crypto"],
    energy: ["طاقة", "Energy"], metals: ["معادن", "Metals"], fx: ["عملات", "Currencies"], index: ["مؤشرات", "Indices"], other: ["أخرى", "Other"]
  };
  const date = new Intl.DateTimeFormat(locales, {dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Riyadh"});
  const amount = (value, unit) => `${new Intl.NumberFormat("en", { maximumFractionDigits: value < 1 ? 6 : 4, minimumFractionDigits: 2 }).format(value)} ${unit}`;
  const change = value => value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
  const name = q => en ? q.label : q.labelAr;
  const text = (tag, value, cls) => {
    const n = document.createElement(tag);
    n.textContent = value;
    if (cls) n.className = cls;
    return n;
  };
  function action(label, callback) {
    const button = text("button", label, "market-action");
    button.type = "button"; button.addEventListener("click", callback);
    return button;
  }
  const checkedTime = millis => millis ? `${date.format(millis)} ${tr("الرياض","Riyadh")}` : tr("الوقت غير معروف","Time unknown");
  const freshnessLabel = code => ({
    old: tr("قراءة أقدم من النافذة المرجعية","Older than the reference window"),
    dated: tr("آخر قراءة من المزود","Latest provider observation"),
    unknown: tr("وقت الرصد غير متاح","Observation time unavailable")
  })[code];
  function quoteCard(q, fx = false, compact = false) {
    const card = text("article", "", "direct-market-card");
    const title = text("h3", name(q)); title.dir = "auto";
    const meta = text("div", "", "direct-market-top");
    meta.append(title, text("small", tr(...catalog[q.category])));
    const value = text("strong", amount(q.price,q.currency), "direct-market-price");
    value.dir = "ltr";
    const delta = text("div", fx ? tr("سعر مرجعي","Reference rate") :
      q.changePercent === null ? tr("التغير غير متاح","Change unavailable") : change(q.changePercent),
      "direct-market-change " + (q.changePercent > 0 ? "up" : q.changePercent < 0 ? "down" : ""));
    if (!fx && q.changePercent !== null) delta.dir = "ltr";
    const foot = text("div", "", "direct-market-foot");
    const observed = text("time", checkedTime(q.timestamp));
    if (q.timestamp) observed.dateTime = new Date(q.timestamp).toISOString();
    foot.append(text("span",q.provider), observed);
    const note = text("span", freshnessLabel(q.freshness), "market-freshness market-freshness--" + q.freshness);
    card.append(meta,value,delta,note,foot);
    if (compact && q.previousClose !== null) card.append(text("p", tr("الإغلاق المرجعي: ","Reference close: ") + amount(q.previousClose,q.currency)));
    const actions = text("div", "", "market-card-actions");
    actions.append(action(tr("مشاركة","Share"), () => window.WRLDLINE_SHARE?.share({
      title: `${name(q)} · ${amount(q.price,q.currency)}`,
      description: `${checkedTime(q.timestamp)}${q.changePercent === null ? "" : " · " + change(q.changePercent)}`,
      category: tr("الأسواق","Markets"), source: q.provider
    })));
    if (!fx && !compact) {
      const selected = state.compared.includes(q.symbol);
      const button = action(selected ? tr("أزل من المقارنة","Remove from comparison") : tr("أضف للمقارنة","Add to comparison"), () => {
        if (state.compared.includes(q.symbol)) state.compared = state.compared.filter(s => s !== q.symbol);
        else if (state.compared.length < 2) state.compared.push(q.symbol);
        else { $("marketCompareStatus").textContent = tr("أزل أصلًا قبل إضافة آخر.","Remove one asset before adding another."); return; }
        render();
        const restored = [...$("directMarketGrid").querySelectorAll("[data-compare]")].find(el => el.dataset.compare === q.symbol);
        restored?.focus();
        if (state.compared.length === 2) $("marketCompareStatus").textContent = tr("أصلان جاهزان للمقارنة أدناه.","Two assets are ready to compare below.");
      });
      button.setAttribute("aria-pressed", String(selected));
      button.dataset.compare = q.symbol;
      actions.append(button);
    }
    card.append(actions);
    return card;
  }
  function render() {
    const filtered = M.filter(state.rows, $("marketCategory").value, $("marketQuery").value, $("marketSort").value);
    const grid = $("directMarketGrid");
    const focused = grid.contains(document.activeElement) && document.activeElement.dataset.compare;
    grid.replaceChildren(...(filtered.length ? filtered.map(quoteCardWrapper) : [text("p",
      state.rows.length ? tr("لا توجد أسعار تطابق البحث أو الفئة.","No prices match the selected search or category.") :
        state.busy ? tr("جارٍ تحميل الأسعار…","Loading quotes…") : tr("لا توجد أسعار صالحة للعرض. جرّب التحديث أو راجع أدوات الرسم.","No usable quotes. Refresh or open the charting tools."), "market-loading")]));
    if (focused) [...grid.querySelectorAll("[data-compare]")].find(el=>el.dataset.compare===focused)?.focus({preventScroll:true});
    $("marketCount").textContent = tr(`${filtered.length} من ${state.rows.length} أسعار`,`Showing ${filtered.length} of ${state.rows.length} quotes`);
    $("marketFeedStatus").textContent = state.error ? (state.rows.length ? tr("تعذر التحديث؛ نعرض آخر قراءة مستلمة.","Refresh failed; showing the previous response.") : tr("التغذية غير متاحة.","Feed unavailable.")) :
      state.checked ? tr("آخر وصول للبيانات: ","Last feed response: ") + checkedTime(state.checked) : tr("جارٍ الفحص…","Checking…");
    $("directFxStatus").textContent = state.fxError ? (state.fx ? tr("تعذر التحديث؛ القراءة السابقة معروضة.","Refresh failed; previous reading shown.") : tr("سعر الصرف غير متاح الآن.","FX reference unavailable.")) :
      state.fxChecked ? tr("آخر وصول للبيانات: ","Last feed response: ") + checkedTime(state.fxChecked) : tr("جارٍ الفحص…","Checking…");
    $("directFxGrid").replaceChildren(state.fx ? quoteCard(state.fx,true) : text("p",
      state.fxError ? tr("أعد المحاولة من لوحة الأسعار.","Retry from the quote board.") : tr("انتظر وصول سعر الصرف.","Waiting for the reference rate."), "market-loading"));
    const comparison = state.compared.map(symbol => state.rows.find(q => q.symbol === symbol)).filter(Boolean);
    $("marketComparison").replaceChildren(...(comparison.length ? comparison.map(q => quoteCard(q,false,true)) : [text("p", tr("اختر أصلين من لوحة الأسعار.","Choose two assets from the quote board."))]));
    $("marketClear").disabled = comparison.length === 0;
  }
  function quoteCardWrapper(q) { return quoteCard(q); }
  async function feed(mode) {
    const response = await fetch(`${base}?mode=${mode}`, {cache:"no-store", credentials:"omit", signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error("Feed unavailable");
    return response.json();
  }
  async function update(includeFx = false) {
    if (state.busy) return;
    state.busy = true;
    $("marketRefresh").disabled = true;
    const quotes = feed("quotes").then(payload => {
      const rows = M.quotes(payload.quotes);
      if (!rows.length) throw new Error("No valid quotes");
      state.rows = rows; state.checked = Date.now(); state.error = false;
      state.compared = state.compared.filter(symbol => rows.some(row=>row.symbol===symbol));
    }).catch(()=>{ state.error = true; }).finally(render);
    const fx = (includeFx || !state.fxChecked) ? feed("fx").then(payload => {
      const row = M.normalize(payload.quote,Date.now(),true);
      if (!row) throw new Error("No valid FX");
      state.fx = row; state.fxChecked = Date.now(); state.fxError = false;
    }).catch(()=>{ state.fxError = true; }).finally(render) : Promise.resolve();
    await Promise.all([quotes, fx]);
    state.busy = false; $("marketRefresh").disabled = false; render();
  }

  for (const [key, names] of Object.entries(catalog)) $("marketCategory").append(new Option(tr(...names), key));
  for (const [value, ar, english] of [["default","ترتيب المزود","Provider order"],["newest","أحدث رصد","Latest observation"],["up","الأكثر ارتفاعًا","Biggest gains"],["down","الأكثر انخفاضًا","Biggest declines"]]) {
    $("marketSort").append(new Option(tr(ar,english),value));
  }
  for (const [id, event] of [["marketCategory","change"],["marketQuery","input"],["marketSort","change"]]) $(id).addEventListener(event,render);
  $("marketRefresh").addEventListener("click", () => update(true));
  $("marketClear").addEventListener("click", () => { state.compared = []; $("marketCompareStatus").textContent = ""; render(); $("marketQuery").focus(); });
  $("marketYear").textContent = new Date().getFullYear();
  $("marketDate").textContent = new Intl.DateTimeFormat(locales, {dateStyle:"full", timeZone:"Asia/Riyadh"}).format(new Date());
  $("marketLanguage").textContent = tr("English","العربية");
  $("marketLanguage").addEventListener("click", () => {
    const next = new URL(location.href), other = tr("en","ar");
    safeSet("wrldline:language", other); next.searchParams.set("lang",other); location.assign(next);
  });
  if (en) {
    document.documentElement.lang = "en"; document.documentElement.dir = "ltr";
    document.querySelectorAll("[data-market-en]").forEach(n => { n.textContent = n.dataset.marketEn; });
  }
  function setTheme(value) {
    const dark = value === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    $("marketThemeButton").textContent = dark ? "☀" : "☾";
    $("marketThemeButton").setAttribute("aria-pressed", String(dark));
  }
  setTheme(safeGet("wrldline:theme"));
  $("marketThemeButton").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    safeSet("wrldline:theme",next); setTheme(next);
  });
  $("marketMenuButton").addEventListener("click", () => {
    const open = $("marketNav").classList.toggle("mobile-open");
    $("marketMenuButton").setAttribute("aria-expanded", String(open));
  });

  // Third-party widgets are optional. Native prices and editorial reading links
  // remain available even when the external widget is blocked.
  const widgets = {
    ticker: ["ticker-tape", { symbols:[["TVC:UKOIL","Brent"],["TVC:USOIL","WTI"],["TVC:GOLD","Gold"],["TADAWUL:TASI","TASI"],["FX:USDSAR","USD/SAR"],["NASDAQ:NVDA","NVIDIA"]].map(([proName,title])=>({proName,title})), showSymbolLogo:true,displayMode:"adaptive" }],
    overview: ["market-overview", { dateRange:"1D",showChart:true,width:"100%",height:450,showSymbolLogo:true,tabs:[
      {title:tr("الطاقة والمعادن","Energy & metals"),symbols:["NYMEX:CL1!","ICEEUR:BRN1!","NYMEX:NG1!","COMEX:GC1!","COMEX:SI1!"].map(s=>({s}))},
      {title:tr("السوق السعودي","Saudi market"),symbols:["TADAWUL:TASI","TADAWUL:2222","TADAWUL:1120","TADAWUL:7010"].map(s=>({s}))},
      {title:tr("العملات","Currencies"),symbols:["FX:EURUSD","FX:USDJPY","TVC:DXY","FX:USDSAR"].map(s=>({s}))},
      {title:tr("أسهم وصناديق","Stocks & ETFs"),symbols:["NASDAQ:AAPL","NASDAQ:NVDA","AMEX:SPY","NASDAQ:QQQ"].map(s=>({s}))}
    ] }],
    heat: ["stock-heatmap", { exchanges:[],dataSource:"SPX500",grouping:"sector",blockSize:"market_cap_basic",blockColor:"change",hasTopBar:true,isDataSetEnabled:true,isZoomEnabled:true,width:"100%",height:"480" }]
  };
  document.querySelectorAll("[data-market-widget]").forEach(button => {
    button.addEventListener("click", () => {
      const host = $(button.getAttribute("aria-controls")), [type, options] = widgets[button.dataset.marketWidget];
      if (!host || host.querySelector("iframe")) return;
      const area = text("div", "", "tradingview-widget-container__widget");
      const script = document.createElement("script");
      const status = text("p", tr("جارٍ تحميل الأداة…","Loading chart…"), "market-loading");
      status.setAttribute("role","status");
      button.disabled = true;
      host.replaceChildren(area, status);
      script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${type}.js`;
      script.async = true;
      script.textContent = JSON.stringify({...options,locale:tr("ar","en"),colorTheme:document.documentElement.dataset.theme,isTransparent:false});
      let timer;
      const titleFrames = () => host.querySelectorAll("iframe").forEach(frame => {
        if (!frame.title) frame.title = tr("أداة أسواق TradingView","TradingView market tool");
      });
      const observer = new MutationObserver(() => {
        if (host.querySelector("iframe")) { clearTimeout(timer); titleFrames(); status.remove(); observer.disconnect(); button.hidden = true; }
      });
      const fail = () => {
        clearTimeout(timer); observer.disconnect(); button.disabled = false;
        host.replaceChildren(text("p", tr("لم تُحمّل الأداة؛ استعمل رابط المزود أو حاول مجددًا.","Chart unavailable; use the provider link or try again."), "market-loading"));
      };
      observer.observe(host,{childList:true,subtree:true}); script.onerror = fail;
      timer = setTimeout(fail,11000); host.insertBefore(script,status);
    });
  });
  render();
  update(true);
  setInterval(() => { if (!document.hidden) update(state.fxChecked < Date.now() - 3600000); }, 60000);
  window.WRLDLINE_ANALYTICS?.track("market_view", { page_path:"/markets.html" });
})();
