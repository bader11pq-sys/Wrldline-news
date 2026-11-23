/* Independently load the optional classified snapshot without blocking front-page news. */
(() => {
  const host = document.querySelector(".edition-monitor");
  const monitor = window.WLMonitor;
  if (!host || !monitor) return;
  const el = id => document.getElementById(id);
  const words = {
    editionMonitorTitle:["مرصد العالم","World Monitor"],
    editionMonitorDeck:["إشارات التغطية المصنّفة بحسب موقع الحدث خلال آخر 24 ساعة.","Classified coverage by event location over the last 24 hours."],
    editionReportLabel:["تقارير مصنّفة","Classified reports"],
    editionCountryLabel:["دول بها إشارات","Countries with signals"],
    editionHighLabel:["مرتفعة أو حرجة","High or critical"],
    editionMonitorLink:["افتح الخريطة","Open the map"]
  };
  const status = {
    idle:["تُحمَّل الإشارات عند الوصول إلى هذا القسم.","The snapshot loads when this section comes into view."],
    loading:["جارٍ تحميل الإشارات المصنّفة…","Loading classified signals…"],
    error:["تعذر تحميل الملخص. يمكنك فتح المرصد مباشرة.","The snapshot is unavailable. You can still open the monitor."],
    empty:["لا توجد تقارير مصنّفة في الخلاصة لهذه الفترة.","The feed has no classified reports for this period."],
    ready:["الأعداد تخص التقارير المصنّفة ولا تقيس سلامة الدول.","Counts describe classified reports, not country safety."],
    capped:["الملخص مبني على أحدث ١٬٠٠٠ تقرير في الخلاصة.","The snapshot uses the latest 1,000 reports in the feed."]
  };
  let phase = "idle", snapshot = null;
  function render() {
    const english = window.wrldlineLang === "en", index = Number(english);
    for (const [id, values] of Object.entries(words)) el(id).textContent = values[index];
    el("editionMonitorStatus").textContent = status[phase][index];
    el("editionMonitorMetrics").hidden = snapshot === null;
    if (!snapshot) return;
    // The Arabic zero resembles a dot at dashboard sizes. Use a clearly shaped 0.
    const number = new Intl.NumberFormat(english ? "en" : "ar-SA", { numberingSystem: "latn" });
    for (const [id, value] of Object.entries(snapshot)) el(id).textContent = number.format(value);
  }
  async function load() {
    if (phase !== "idle") return;
    phase = "loading";
    render();
    try {
      const {items, capped, checked} = await monitor.fetchFeed();
      const view = monitor.select(items, monitor.defaults, checked);
      snapshot = {editionReportCount:view.events.length, editionCountryCount:view.countries, editionHighCount:view.high};
      phase = capped ? "capped" : view.events.length ? "ready" : "empty";
    } catch { phase = "error"; }
    render();
  }
  render();
  document.addEventListener("wrldline:language", render);
  if (!("IntersectionObserver" in window)) { void load(); return; }
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    void load();
  }, {rootMargin:"160px"});
  observer.observe(host);
})();
