(() => {
  const $ = id => document.getElementById(id);
  const M = window.WLMonitor, E = window.WLEditorial, L = window.L;
  const messages = {
    title:["مرصد العالم","World Monitor"], deck:["تابع الأحداث المصنّفة حسب دولة الحدث ومستوى الخطورة ووقت النشر.","Track classified news by event country, severity and publication time."],
    filters:["خيارات العرض","Display filters"], overview:["ملخص التصفية","Filtered overview"], period:["الفترة حسب النشر","Publication window"], hour:["آخر ساعة","Last hour"], six:["آخر 6 ساعات","Last 6 hours"], day:["آخر 24 ساعة","Last 24 hours"],
    type:["نوع الحدث","Event type"], allTypes:["كل الأنواع","All event types"], severity:["مستوى الخطورة","Severity"], allLevels:["كل المستويات","All levels"],
    critical:["حرج","Critical"], high:["مرتفع","High"], elevated:["متصاعد","Elevated"], guarded:["مراقبة","Guarded"], low:["منخفض","Low"], neutral:["لا إشارة مطابقة","No matching signal"],
    country:["دولة الحدث","Event country"], allCountries:["كل الدول","All countries"], reset:["مسح الفلاتر","Clear filters"], items:["أخبار مطابقة","Matching reports"], countries:["دول بها إشارات","Countries with signals"], highItems:["أخبار بخطورة مرتفعة أو حرجة","High or critical reports"],
    mapTitle:["خريطة الإشارات","Signal map"], mapHint:["اختر دولة من الخريطة أو من القائمة.","Choose a country on the map or from the list."], zoomIn:["تكبير الخريطة","Zoom in"], zoomOut:["تصغير الخريطة","Zoom out"], resetMap:["عرض العالم","World view"], legend:["مفتاح ألوان الخريطة","Map legend"],
    retry:["إعادة المحاولة","Retry"], loading:["جارٍ تحميل بيانات المرصد…","Loading monitor data…"],
    error:["تعذر تحميل الأخبار المصنّفة.","Classified news could not be loaded."], stale:["تعذر التحديث؛ نعرض آخر بيانات متاحة.","Refresh failed; showing the last available data."],
    checked:["آخر فحص","Last checked"], newest:["أحدث نشر في الخلاصة","Latest publication in feed"], noReports:["لا توجد أخبار مصنّفة في الخلاصة خلال آخر 24 ساعة.","The feed has no classified reports in the last 24 hours."],
    mapLoading:["جارٍ تحميل حدود الخريطة…","Loading map boundaries…"], mapError:["تعذر تحميل حدود الخريطة. لا يزال بإمكانك استخدام قائمة الدول.","Map boundaries unavailable. You can still use the country list."],
    mapUnavailable:["تعذر تشغيل الخريطة. تظل الفلاتر والأخبار متاحة.","The map could not start. Filters and reports are still available."],
    eventTitle:["الأخبار المصنّفة","Classified reports"], count:["عدد الأخبار","Reports"], shown:["المعروض","Showing"], noMatch:["لا توجد أخبار مصنّفة تطابق الفلاتر الحالية.","No classified reports match the current filters."],
    limited:["الأعداد تستند إلى أحدث 1,000 خبر في الخلاصة وقد لا تشمل جميع النتائج.","Counts use the latest 1,000 feed entries and may not include every match."],
    topLevel:["أعلى إشارة مطابقة","Highest matching signal"], source:["المصدر الأصلي","Original source"], more:["عرض المزيد","Show more"],
    skip:["انتقل إلى المرصد","Skip to the monitor"], back:["غرفة الأخبار","Newsroom"], dark:["المظهر الداكن","Dark appearance"],
    jumpNav:["أقسام المرصد","Monitor sections"], jumpAnalysis:["التوزيع وتوقيت النشر","Breakdown and timeline"], jumpReports:["التقارير المصنّفة","Classified reports"],
    sort:["الترتيب","Sort"], highest:["الأعلى خطورة","Highest severity"], latest:["الأحدث نشرًا","Most recently published"],
    share:["مشاركة العرض","Share view"], shareLabel:["رابط هذا العرض","Link to this view"], close:["إغلاق","Close"],
    copied:["نُسخ رابط العرض.","View link copied."], copyManual:["يمكنك نسخ الرابط المحدّد.","You can copy the selected link."],
    countryNews:["تصفّح أخبار هذه الدولة","Browse news for this country"], analysis:["توزيع الخطورة","Severity breakdown"], analysisHint:["عدد الأخبار المطابقة في كل مستوى.","Matching reports at each level."],
    timeline:["توقيت النشر","Publication timeline"], timelineHint:["عدد الأخبار المطابقة في ست فترات متساوية، بتوقيت جهازك.","Matching reports in six equal intervals, in your device’s time zone."],
    countriesTitle:["أبرز الإشارات حسب الدولة","Leading signals by country"], countriesHint:["مرتّبة حسب أعلى خطورة، ثم عدد التقارير، عبر جميع الدول المطابقة.","Ranked by highest severity, then report count, across matching countries."],
    analysisPending:["تظهر الأعداد بعد تحميل الخلاصة.","Counts appear after the feed loads."], analysisEmpty:["لا توجد إشارات مطابقة.","No matching signals."],
    compareTitle:["مقارنة التغطية بين بلدين","Compare coverage across two countries"],
    compareHint:["نفس الفترة ونوع الحدث ومستوى الخطورة. الاختياران مستقلان عن فلتر الدولة في الخريطة.","Same publication window, event type and severity. These selections are independent of the map’s country filter."],
    compareFirst:["البلد الأول","First country"], compareSecond:["البلد الثاني","Second country"], pickCountry:["اختر بلدًا","Select a country"],
    comparePick:["اختر بلدين مختلفين للمقارنة.","Choose two different countries to compare."],
    compareLimit:["هذه أعداد تغطية من الخلاصة، لا مقارنة لأمان البلدين. أسماء الناشرين لا تعني مصادر مستقلة.","These are feed counts, not a comparison of country safety. Publisher names do not imply independent sources."],
    comparePublishers:["أسماء ناشرين مختلفة","Distinct publisher names"], compareLatest:["آخر نشر مطابق","Latest matching publication"],
    readContext:["اقرأ ملفات السياق","Read Context Room dossiers"], readSources:["تصفّح دليل المصادر","Browse the source directory"],
    methodTitle:["كيف تقرأ الخريطة؟","How to read the map"],
    method:["لون البلد يمثّل أعلى مستوى خطورة لخبر مطابق في التغطية المصنّفة آلياً، وليس مستوى خطورة البلد نفسه أو تحذيراً للسفر. عدم وجود إشارة لا يعني عدم وقوع أحداث، وقد تصل الأخبار من مصادرها بتأخير.","A country’s color represents the highest severity of a matching, automatically classified report, not the country’s safety or a travel advisory. No signal does not mean no events occurred, and reports can arrive late."]
  };
  let lang = window.wrldlineLang === "en" ? "en" : "ar", items = [], boundaryNames = new Map(), layer, map, view;
  let lastChecked = null, newest = null, capped = false, feedState = "loading", mapState = "loading", busy = false, geometryBusy = false;
  let displayLimit = 20, fittedWorldZoom;
  const mapBounds = [[-57, -180], [82, 180]];
  let mapColors = {};
  const msg = key => messages[key][lang === "en" ? 1 : 0];
  const locale = () => lang === "ar" ? "ar-SA-u-ca-gregory" : "en";
  let formats;
  function setFormats(){
    formats={number:new Intl.NumberFormat(locale()), date:new Intl.DateTimeFormat(locale(),{dateStyle:"short",timeStyle:"short"}),
      time:new Intl.DateTimeFormat(locale(),{hour:"2-digit",minute:"2-digit",hourCycle:"h23"})};
  }
  setFormats();
  const number = value => formats.number.format(value);
  const date = value => formats.date.format(value);
  const countryName = (code, fallback) => E.countryName(code, lang) || fallback || code;
  const safeURL = value => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  };
  function el(tag, value, className) {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  }
  function localize() {
    document.querySelectorAll("[data-copy]").forEach(node => { node.textContent = msg(node.dataset.copy); });
    document.querySelectorAll("[data-aria-copy]").forEach(node => node.setAttribute("aria-label", msg(node.dataset.ariaCopy)));
    document.title = `${msg("title")} | WRLDLINE NEWS`;
    setTheme(document.documentElement.dataset.theme);
  }
  function setTheme(theme, persist=false) {
    const dark=theme==="dark";
    document.documentElement.dataset.theme=dark?"dark":"light";
    const button=$("monitorTheme");
    button.textContent=msg("dark");
    button.setAttribute("aria-pressed",String(dark));
    const palette=getComputedStyle(document.documentElement);
    mapColors=Object.fromEntries([...M.levels,"neutral","boundary","focus"].map(key=>[key,palette.getPropertyValue(`--${key}`).trim()]));
    if(persist)try{localStorage.setItem("wrldline:theme",dark?"dark":"light");}catch{}
    layer?.setStyle(style);
  }
  function status() {
    const prefix = feedState === "stale" || feedState === "error" ? `${msg(feedState)} ` : "";
    const details = lastChecked === null ? msg(feedState) : `${prefix}${msg("checked")}: ${date(lastChecked)}${newest !== null ? ` · ${msg("newest")}: ${date(newest)}` : ""}`;
    const updated = $("updatedAt");
    updated.dataset.state = ["stale", "error"].includes(feedState) ? "error" : feedState;
    if (updated.textContent !== details) updated.textContent = details;
    $("retryFeed").hidden = !["stale", "error"].includes(feedState);
    $("retryFeed").disabled = busy;
    $("mapMessage").hidden = mapState === "ready";
    if (mapState !== "ready") $("mapStatus").textContent = msg(mapState);
    $("retryMap").hidden = !["mapError", "mapUnavailable"].includes(mapState);
    $("retryMap").disabled = geometryBusy;
  }
  function style(feature) {
    const key = feature.properties.code;
    const selected = key !== "" && key === $("countryFilter").value;
    const matches = view?.byCountry.get(key) || [];
    const included = $("countryFilter").value === "all" || selected;
    return {
      color: selected ? mapColors.focus : mapColors.boundary, weight: selected ? 2.6 : .8,
      fillColor: mapColors[included ? matches[0]?.severity || "neutral" : "neutral"],
      fillOpacity: included ? 1 : .64
    };
  }
  function chooseCountry(code) {
    if (!code) return;
    $("countryFilter").value = $("countryFilter").value === code ? "all" : code;
    changeFilter();
  }
  function updateZoom() {
    if (!map || !layer) return;
    $("zoomIn").disabled = map.getZoom() >= map.getMaxZoom();
    $("zoomOut").disabled = map.getZoom() <= fittedWorldZoom;
    $("resetMap").disabled = false;
  }
  function fitWorld() {
    if (!map || !layer) return;
    map.setMinZoom(0);
    map.fitBounds(mapBounds, {padding:[10, 10], animate:false});
    fittedWorldZoom = map.getZoom();
    map.setMinZoom(fittedWorldZoom);
    updateZoom();
  }
  async function loadBoundaries() {
    if (geometryBusy || layer) return;
    if (!L) { mapState = "mapUnavailable"; status(); return; }
    geometryBusy = true;
    status();
    try {
      const response = await fetch("./vendor/natural-earth-countries-110m-v5.1.2.geojson", {signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error("Map asset not available");
      const data = await response.json();
      if (data.type !== "FeatureCollection" || !Array.isArray(data.features) || !data.features.length) throw new TypeError("Invalid map asset");
      if (!map) {
        map = L.map("worldMap", {zoomSnap:.25, zoomDelta:.5, scrollWheelZoom:false, zoomControl:false, maxZoom:6, worldCopyJump:false, maxBounds:[[-85, -205], [85, 205]], maxBoundsViscosity:.8});
        map.setView([18, 0], 1);
        map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Natural Earth</a>');
        map.on("zoomend", updateZoom);
        map.on("resize", () => { if (map.getZoom() === fittedWorldZoom) fitWorld(); });
      }
      boundaryNames = new Map(data.features.filter(f => E.codeOf(f.properties.code)).map(f => [f.properties.code, f.properties.name]));
      layer = L.geoJSON(data, {style, onEachFeature(feature, polygon) {
        const {code, name} = feature.properties;
        if (!E.codeOf(code)) return;
        polygon.bindTooltip(() => {
          const selected = $("countryFilter").value;
          const top = selected === "all" || selected === code ? view?.byCountry.get(code)?.[0] : null;
          const content = el("span", `${countryName(code, name)} · ${msg(top?.severity || "neutral")}`);
          content.dir = lang === "ar" ? "rtl" : "ltr";
          return content;
        }, {className:"monitor-tooltip", sticky:true});
        polygon.on("click", () => chooseCountry(code));
        polygon.on("mouseover", () => polygon.setStyle({color:mapColors.focus, weight:2}));
        polygon.on("mouseout", () => layer?.resetStyle(polygon));
      }}).addTo(map);
      fitWorld();
      mapState = "ready";
      render();
    } catch {
      mapState = "mapError";
    } finally {
      geometryBusy = false;
      status();
    }
  }
  function replaceOptions(control, entries) {
    const previous = control.value;
    if (control.options.length === entries.length && entries.every(([value, label], i) => control.options[i].value === value && control.options[i].textContent === label)) return;
    control.replaceChildren(...entries.map(([value, label]) => new Option(label, value)));
    control.value = entries.some(([value]) => value === previous) ? previous : "all";
  }
  function eventCard(report) {
    const translated = Array.isArray(report.article_translations) ? report.article_translations.find(entry => entry?.lang === lang && typeof entry.title === "string") : null;
    const card = el("article", "", "monitor-event");
    const top = el("div", "", "monitor-event-top");
    top.append(el("span", msg(report.severity), `monitor-badge level-${report.severity}`), el("span", countryName(report.countryCode)));
    const title = el("h3", translated?.title || report.title);
    title.dir = "auto";
    card.append(top, title);
    const summary = translated ? translated.ai_summary || translated.summary : report.ai_summary || report.summary;
    if (typeof summary === "string" && summary.trim()) {
      const description = el("p", summary);
      description.dir = "auto";
      card.append(description);
    }
    const facts = el("p", `${E.eventTypeLabel(report.eventType, lang)} · `, "monitor-event-meta");
    const published = el("time", date(report.published));
    published.dateTime = new Date(report.published).toISOString();
    facts.append(published);
    card.append(facts);
    const url = safeURL(report.url);
    if (url) {
      const link = el("a", `${msg("source")} ↗`);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      card.append(link);
    }
    return card;
  }
  function activeFilters() {
    return {hours:Number($("timeFilter").value), country:$("countryFilter").value, severity:$("riskFilter").value,
      type:$("eventTypeFilter").value, order:$("eventOrder").value};
  }
  function restoreFilters() {
    const filters=M.filtersFrom(new URLSearchParams(location.search));
    for(const [id,key] of [["timeFilter","hours"],["countryFilter","country"],["riskFilter","severity"],["eventTypeFilter","type"],["eventOrder","order"]]){
      const select=$(id),value=String(filters[key]);
      if(![...select.options].some(option=>option.value===value))select.add(new Option(key==="country"?countryName(value):E.eventTypeLabel(value,lang),value));
      select.value=value;
    }
  }
  function updateLocation() {
    const url=M.filtersTo(activeFilters(),location.href);
    try{history.replaceState(history.state,"",url);}catch{}
    if(!$("monitorShare").hidden)$("monitorShareURL").value=shareURL();
  }
  function shareURL() {
    const url=M.filtersTo(activeFilters(),location.href);
    // Drop unrelated query strings and anchor state from the shared link.
    const safe=new URL(url.pathname,url.origin);
    for(const key of Object.keys(M.defaults))if(url.searchParams.has(key))safe.searchParams.set(key,url.searchParams.get(key));
    safe.searchParams.set("lang",lang);
    return safe.href;
  }
  function analysisPanels(filters, now) {
    const breakdown=$("severityDistribution"), timeline=$("reportTimeline"), leaders=$("countryLeaders");
    if(lastChecked===null) {
      for(const node of [breakdown,timeline,leaders]) node.replaceChildren(el("li",msg("analysisPending"),"monitor-analysis-empty"));
      return;
    }
    const total=view.events.length;
    breakdown.replaceChildren(...[...M.levels].reverse().map(severity=>{
      const count=view.distribution[severity],row=el("li","",`level-${severity}`);
      const track=el("span","","monitor-bar-track"), bar=el("i","");
      track.setAttribute("aria-hidden","true");
      bar.style.inlineSize=`${total?count/total*100:0}%`;track.append(bar);
      row.append(el("span",msg(severity)),track,el("strong",number(count)));return row;
    }));
    const step=filters.hours*3600000/6, peak=Math.max(...view.buckets,1);
    timeline.replaceChildren(...view.buckets.map((count,i)=>{
      const end=now-step*(5-i),from=formats.time.format(end-step),to=formats.time.format(end);
      const row=el("li",""), track=el("span","","monitor-time-track"),bar=el("i","");
      row.setAttribute("aria-label",`${from}–${to}: ${number(count)}`);
      track.setAttribute("aria-hidden","true");
      bar.style.blockSize=`${count/peak*100}%`;track.append(bar);
      row.append(el("strong",number(count)),track,el("small",from));return row;
    }));
    const previous=leaders.contains(document.activeElement)&&document.activeElement.dataset.country;
    leaders.replaceChildren(...(view.leaders.length?view.leaders.slice(0,5).map(({code,count,top})=>{
      const row=el("li",""), button=el("button","");
      button.type="button";
      button.dataset.country=code;
      button.setAttribute("aria-pressed",String(filters.country===code));
      button.append(el("strong",countryName(code,boundaryNames.get(code))),el("span",msg(top.severity),`monitor-badge level-${top.severity}`),el("span",number(count),"monitor-leader-count"));
      row.append(button);return row;
    }):[el("li",msg("analysisEmpty"),"monitor-analysis-empty")]));
    if(previous)[...leaders.querySelectorAll("button")].find(button=>button.dataset.country===previous)?.focus({preventScroll:true});
  }
  function compareCountries(entries) {
    const inputs = [$("monitorCompareFirst"), $("monitorCompareSecond")];
    for (const input of inputs) replaceOptions(input, [["all", msg("pickCountry")], ...entries]);
    const [first, second] = inputs.map(input => input.value);
    const host = $("monitorCompareResult");
    const statusLine = $("monitorCompareStatus");
    if (first === "all" || second === "all" || first === second || lastChecked === null) {
      host.replaceChildren();
      statusLine.textContent = msg(lastChecked === null ? (feedState === "error" ? "error" : "analysisPending") : "comparePick");
      return;
    }
    statusLine.textContent = [feedState === "stale" ? msg("stale") : "", msg("compareLimit"), capped ? msg("limited") : ""].filter(Boolean).join(" ");
    host.replaceChildren(...[first, second].map(code => {
      const s = M.countryStats(view.byCountry, code), card = el("article", "", "monitor-compare-card"), stats = el("dl", "");
      for (const [label, value] of [
        ["count", number(s.count)], ["highItems", number(s.high)], ["comparePublishers", number(s.sources)],
        ["topLevel", msg(s.top || "neutral")], ["compareLatest", s.latest === null ? "—" : date(s.latest)]
      ]) stats.append(el("dt", msg(label)), el("dd", value));
      card.append(el("h3", countryName(code, boundaryNames.get(code))), stats);
      return card;
    }));
  }
  function render() {
    const filters = activeFilters();
    // Anchor stale views to the last successful snapshot instead of aging them into a false zero.
    const now = lastChecked ?? Date.now();
    view = M.select(items, filters, now);
    const order = (a, b) => a[1].localeCompare(b[1], locale());
    const typeEntries = [...view.types].map(type => [type, E.eventTypeLabel(type, lang)]);
    if (filters.type !== "all" && !view.types.has(filters.type)) typeEntries.push([filters.type, E.eventTypeLabel(filters.type, lang)]);
    replaceOptions($("eventTypeFilter"), [["all", msg("allTypes")], ...typeEntries.sort(order)]);
    const available = new Map(boundaryNames);
    for (const event of items) if (!available.has(event.countryCode)) available.set(event.countryCode, "");
    if (filters.country !== "all" && !available.has(filters.country)) available.set(filters.country, "");
    const countriesForSelect = [...available].map(([code, name]) => [code, countryName(code, name)]).sort(order);
    replaceOptions($("countryFilter"), [["all", msg("allCountries")], ...countriesForSelect]);
    compareCountries(countriesForSelect);
    const {events, countries, high} = view;
    for (const [id, value] of [["statEvents", events.length], ["statCountries", countries], ["statHigh", high]]) $(id).textContent = lastChecked === null ? "—" : number(value);
    $("panelTitle").textContent = filters.country === "all" ? msg("eventTitle") : countryName(filters.country, available.get(filters.country));
    $("eventCount").textContent = lastChecked === null ? "" : `${msg("count")}: ${number(events.length)}${events.length > displayLimit ? ` · ${msg("shown")}: ${number(displayLimit)}` : ""}`;
    $("countrySummary").hidden = (filters.country === "all" && !capped) || lastChecked === null;
    $("countrySummary").textContent = [
      filters.country === "all" ? "" : `${msg("topLevel")}: ${msg(view.highest?.severity || "neutral")}`,
      capped ? msg("limited") : ""
    ].filter(Boolean).join(" · ");
    const news=$("countryNewsLink");
    news.hidden=filters.country==="all";
    if(!news.hidden)news.href=`index.html?country=${encodeURIComponent(filters.country)}&lang=${lang}#newsSection`;
    analysisPanels(filters,now);
    const list = $("eventList");
    const previousFocus = list.contains(document.activeElement) && document.activeElement.href;
    list.replaceChildren(...(events.length ? events.slice(0, displayLimit).map(eventCard) :
      [el("p", msg(lastChecked === null ? feedState : newest === null ? "noReports" : "noMatch"), "monitor-empty")]));
    if (previousFocus) [...list.querySelectorAll("a")].find(a => a.href === previousFocus)?.focus({preventScroll:true});
    $("showMoreEvents").hidden = events.length <= displayLimit;
    layer?.eachLayer(polygon => { polygon.closeTooltip(); layer.resetStyle(polygon); });
    if (filters.country !== "all") layer?.eachLayer(polygon => { if (polygon.feature.properties.code === filters.country) polygon.bringToFront(); });
    status();
  }
  function changeFilter() {
    displayLimit = 20;
    $("eventList").scrollTop = 0;
    updateLocation();
    render();
  }
  async function loadFeed() {
    if (busy) return;
    busy = true;
    status();
    try {
      const feed=await M.fetchFeed(), checked=feed.checked;
      items=feed.items;
      capped=feed.capped;
      newest = items.length ? Math.max(...items.map(event => event.published)) : null;
      lastChecked = checked;
      feedState = "ready";
    } catch {
      feedState = lastChecked === null ? "error" : "stale";
    } finally {
      busy = false;
      render();
    }
  }
  for (const id of ["timeFilter", "eventTypeFilter", "riskFilter", "countryFilter", "eventOrder"]) $(id).addEventListener("change", changeFilter);
  for (const id of ["monitorCompareFirst", "monitorCompareSecond"]) $(id).addEventListener("change", render);
  $("resetFilters").addEventListener("click", () => {
    $("timeFilter").value = "24";
    for (const id of ["eventTypeFilter", "riskFilter", "countryFilter"]) $(id).value = "all";
    $("eventOrder").value="severity";
    changeFilter();
  });
  $("countryLeaders").addEventListener("click",event=>{
    const code=event.target.closest("button[data-country]")?.dataset.country;
    if(code)chooseCountry(code);
  });
  $("monitorTheme").addEventListener("click",()=>setTheme(document.documentElement.dataset.theme==="dark"?"light":"dark",true));
  $("shareView").addEventListener("click",async()=>{
    const panel=$("monitorShare"), input=$("monitorShareURL");
    input.value=shareURL();panel.hidden=false;input.focus();input.select();
    let copied=false;
    try{await navigator.clipboard.writeText(input.value);copied=true;}catch{}
    $("shareStatus").textContent=msg(copied?"copied":"copyManual");
  });
  $("closeMonitorShare").addEventListener("click",()=>{$("monitorShare").hidden=true;$("shareView").focus();});
  $("zoomIn").addEventListener("click", () => map.zoomIn(.5, {animate:false}));
  $("zoomOut").addEventListener("click", () => map.zoomOut(.5, {animate:false}));
  $("resetMap").addEventListener("click", fitWorld);
  $("retryMap").addEventListener("click", () => { if (!L) location.reload(); else loadBoundaries(); });
  $("retryFeed").addEventListener("click", loadFeed);
  $("showMoreEvents").addEventListener("click", () => {
    const firstNew = displayLimit;
    displayLimit += 20;
    render();
    const heading = $("eventList").querySelectorAll("h3")[firstNew];
    if (heading) { heading.tabIndex = -1; heading.focus(); }
  });
  document.addEventListener("wrldline:language", event => {
    lang = event.detail.lang === "en" ? "en" : "ar";
    setFormats();
    localize();
    if(!$("monitorShare").hidden)$("monitorShareURL").value=shareURL();
    render();
  });
  window.addEventListener("popstate",()=>{restoreFilters();displayLimit=20;render();});
  try{setTheme(localStorage.getItem("wrldline:theme"));}catch{setTheme("light");}
  restoreFilters();
  localize();
  render();
  loadBoundaries();
  loadFeed();
  setInterval(loadFeed, 60000);
})();
