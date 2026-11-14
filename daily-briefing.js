(() => {
  const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const SUPABASE_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const $ = (selector) => document.querySelector(selector);
  const state = { lastTarget: "", timer: null };

  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);

  function utcDateKey(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1)).toISOString().slice(0, 10);
  }
  function formatDate(value) {
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date(value + "T12:00:00Z"));
  }
  function formatTime(value) {
    return new Intl.DateTimeFormat("ar-SA", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  }
  function setStatus(message, type = "") {
    const host = $("#briefingStatus");
    host.className = "briefing-status" + (type ? " " + type : "");
    host.innerHTML = (type === "loading" ? '<span class="briefing-spinner"></span>' : "") + "<span>" + escapeHTML(message) + "</span>";
    host.hidden = false;
  }
  function sourceLinks(sources) {
    if (!Array.isArray(sources) || !sources.length) return "";
    return '<div class="briefing-sources">' + sources.slice(0, 8).map((source) =>
      '<a href="' + escapeHTML(source.url) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHTML(source.title || source.name) + '">' +
      escapeHTML(source.name || "المصدر الأصلي") + ' ↗</a>'
    ).join("") + "</div>";
  }
  const confidenceNames = { confirmed: "مؤكد من عدة مصادر", reported: "منقول / يحتاج متابعة", developing: "تطور مستمر", unverified: "غير متحقق" };
  const categoryNames = {
    politics:"سياسة ودبلوماسية", security:"أمن ودفاع", economy:"اقتصاد وأعمال وطاقة",
    technology:"تقنية وذكاء اصطناعي", health:"صحة وطب", sports:"رياضة",
    science_environment:"علوم وبيئة", culture_society:"ثقافة ومجتمع", world:"حول العالم"
  };
  function storyCard(item) {
    const confidence = item.confidence || "reported";
    return '<article class="briefing-story"><div class="briefing-meta"><span class="briefing-tag">' + escapeHTML(categoryNames[item.category] || item.category || "حول العالم") + '</span><span class="confidence-' + escapeHTML(confidence) + '">' + escapeHTML(confidenceNames[confidence] || confidenceNames.reported) + '</span></div>' +
      '<h3>' + escapeHTML(item.headline) + '</h3><p>' + escapeHTML(item.summary) + '</p>' +
      (item.impact ? '<p class="impact"><strong>الدلالة:</strong> ' + escapeHTML(item.impact) + '</p>' : "") +
      sourceLinks(item.sources) + '</article>';
  }
  function fingerprint(value) {
    return String(value || "").toLocaleLowerCase("ar").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  function dedupeBriefingItems(items, key, seen) {
    return (items || []).filter((item) => {
      const value = fingerprint(item && item[key]);
      if (!value || seen.has(value)) return false;
      seen.add(value); return true;
    });
  }
  function renderBriefing(row, stale = false) {
    const start = new Date(row.window_start), end = new Date(row.window_end);
    $("#utcDateLabel").textContent = "ملخص يوم " + formatDate(row.briefing_date);
    $("#briefingWindow").textContent = formatDate(row.briefing_date) + " · 00:00 UTC — 00:00 UTC";
    $("#statArticles").textContent = Number(row.article_count || 0).toLocaleString("en-US");
    $("#statSelected").textContent = Number(row.selected_article_count || 0).toLocaleString("en-US");
    $("#statSources").textContent = Number(row.source_count || 0).toLocaleString("en-US");
    $("#statGenerated").textContent = formatTime(row.generated_at) + " UTC";
    $("#briefingStats").hidden = false;

    $("#executiveSummary").textContent = row.executive_summary || "";
    $("#executiveSection").hidden = !row.executive_summary;

    const seen = new Set();
    const topItems = dedupeBriefingItems(row.top_developments, "headline", seen);
    $("#topDevelopments").innerHTML = topItems.map(storyCard).join("");
    $("#topSection").hidden = !topItems.length;

    const sections = (row.sections || []).map((section) => ({...section, items: dedupeBriefingItems(section.items, "headline", seen)})).filter((section) => section.items.length);
    $("#briefingSections").innerHTML = sections.map((section) =>
      '<article class="briefing-category"><h3>' + escapeHTML(section.title) + '</h3><p>' + escapeHTML(section.overview || "") + '</p>' +
      section.items.map(storyCard).join("") + '</article>'
    ).join("");
    $("#coverageSection").hidden = !sections.length;

    function renderList(items, host) {
      host.innerHTML = (items || []).map((item) =>
        '<article class="briefing-list-item"><h3>' + escapeHTML(item.title || "متابعة") + '</h3><p>' + escapeHTML(item.analysis || "") + '</p>' + sourceLinks(item.sources) + '</article>'
      ).join("");
    }
    const trendSeen = new Set();
    const globalTrends = dedupeBriefingItems(row.global_trends, "title", trendSeen);
    const watchlist = dedupeBriefingItems(row.watchlist, "title", trendSeen);
    renderList(globalTrends, $("#globalTrends"));
    renderList(watchlist, $("#watchlist"));
    $("#trendsSection").hidden = !globalTrends.length;
    $("#watchSection").hidden = !watchlist.length;

    const freshness = stale ? "تنبيه: لم يتوفر ملخص دورة اليوم بعد؛ نعرض أحدث نسخة مكتملة." : "اكتمل إعداد ملخص اليوم.";
    setStatus(freshness + " الفترة: " + formatDate(row.briefing_date) + " (UTC). آخر إنشاء: " + formatTime(row.generated_at) + " UTC.", stale ? "warning" : "");
  }

  async function fetchRow(target) {
    const params = new URLSearchParams({ select: "*", briefing_date: "eq." + target, limit: "1" });
    const token = await window.WRLDLINE_AUTH?.getAccessToken?.();
    const response = await fetch(SUPABASE_URL + "/rest/v1/daily_news_briefings?" + params.toString(), {
      headers: { apikey: SUPABASE_KEY, ...(token ? { Authorization: "Bearer " + token } : {}) },
      cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("تعذر جلب الملخص (" + response.status + ")");
    const rows = await response.json();
    return rows[0] || null;
  }
  async function fetchLatest() {
    const params = new URLSearchParams({ select: "*", order: "briefing_date.desc", limit: "1" });
    const token = await window.WRLDLINE_AUTH?.getAccessToken?.();
    const response = await fetch(SUPABASE_URL + "/rest/v1/daily_news_briefings?" + params.toString(), {
      headers: { apikey: SUPABASE_KEY, ...(token ? { Authorization: "Bearer " + token } : {}) },
      cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("تعذر جلب آخر نسخة مكتملة (" + response.status + ")");
    const rows = await response.json();
    return rows[0] || null;
  }
  async function load() {
    const target = utcDateKey(new Date());
    if (target !== state.lastTarget) state.lastTarget = target;
    try {
      const row = await fetchRow(target);
      if (row) { renderBriefing(row, false); return; }
      const latest = await fetchLatest();
      if (latest) { renderBriefing(latest, true); return; }
      setStatus("لم يُنشأ أول ملخص بعد. سيُنشأ تلقائياً عند أول منتصف ليل UTC، ثم يتجدد يومياً.", "warning");
    } catch (error) {
      setStatus(String(error.message || error) + " — أعد تحميل الصفحة بعد قليل.", "error");
    }
  }
  function updateCountdown() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const seconds = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000));
    const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const remainder = String(seconds % 60).padStart(2, "0");
    $("#countdown").textContent = hours + ":" + minutes + ":" + remainder;
    const target = utcDateKey(now);
    if (target !== state.lastTarget) load();
  }

  const theme = localStorage.getItem("wrldline:theme") || "light";
  document.documentElement.dataset.theme = theme;
  $("#briefingThemeButton").textContent = theme === "dark" ? "☀" : "☾";
  $("#briefingThemeButton").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("wrldline:theme", next);
    $("#briefingThemeButton").textContent = next === "dark" ? "☀" : "☾";
  });
  $("#briefingYear").textContent = new Date().getUTCFullYear();
  load();
  updateCountdown();
  setInterval(updateCountdown, 1000);
  setInterval(load, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();