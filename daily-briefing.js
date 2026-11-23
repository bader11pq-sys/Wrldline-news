(() => {
  const M = window.WLBriefing;
  const $ = (selector) => document.querySelector(selector);
  const picker = $("#briefingDate");
  const state = { request: 0, lastDay: "", selected: "", lastRender: "", pending: false, session: undefined };
  let auth;
  try { auth = window.supabase?.createClient(M.base, M.apikey, { auth: { detectSessionInUrl: false } }); } catch {}

  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);

  const localTime = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false });
  function formatDate(value) {
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date(value + "T12:00:00Z"));
  }
  function formatTime(value) {
    if (!Number.isFinite(Date.parse(value))) return "غير متاح";
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
    const links = sources.slice(0, 8).flatMap(source => {
      const url = M.link(source?.url);
      return url ? ['<a href="' + escapeHTML(url) + '" target="_blank" rel="noopener noreferrer">' +
        escapeHTML(source.name || "المصدر الأصلي") + ' ↗</a>'] : [];
    });
    return links.length ? '<div class="briefing-sources">' + links.join("") + "</div>" : "";
  }
  const confidenceNames = { confirmed: "مؤكد من عدة مصادر", reported: "منقول / يحتاج متابعة", developing: "تطور مستمر", unverified: "غير متحقق" };
  const categoryNames = {
    politics:"سياسة ودبلوماسية", security:"أمن ودفاع", economy:"اقتصاد وأعمال وطاقة",
    technology:"تقنية وذكاء اصطناعي", tech:"تقنية وذكاء اصطناعي", health:"صحة وطب", sports:"رياضة",
    science_environment:"علوم وبيئة", culture_society:"ثقافة ومجتمع", science:"علوم",
    culture:"ثقافة", environment:"بيئة", society:"مجتمع", world:"حول العالم", entertainment:"ترفيه"
  };
  function storyCard(item) {
    const confidence = Object.hasOwn(confidenceNames, item.confidence) ? item.confidence : "reported";
    return '<article class="briefing-story"><div class="briefing-meta"><span class="briefing-tag">' + escapeHTML(categoryNames[item.category] || item.category || "حول العالم") + '</span><span class="confidence-' + escapeHTML(confidence) + '">' + escapeHTML(confidenceNames[confidence] || confidenceNames.reported) + '</span></div>' +
      '<h3>' + escapeHTML(item.headline) + '</h3><p>' + escapeHTML(item.summary) + '</p>' +
      (item.impact ? '<p class="impact"><strong>الدلالة:</strong> ' + escapeHTML(item.impact) + '</p>' : "") +
      sourceLinks(item.sources) + '</article>';
  }
  function fingerprint(value) {
    return M.fingerprint(value);
  }
  function dedupeBriefingItems(items, key, seen) {
    return (Array.isArray(items) ? items : []).filter((item) => {
      const value = fingerprint(item && item[key]);
      if (!value || seen.has(value)) return false;
      seen.add(value); return true;
    });
  }
  function setPeriod(day) {
    const window = M.windowOf(day);
    if (!window) return;
    const end = new Date(window.end).toISOString().slice(0, 10);
    $("#briefingWindow").textContent = `${formatDate(day)} 00:00 إلى ${formatDate(end)} 00:00 (UTC)`;
  }
  function renderBriefing(row, stale = false) {
    $("#publicBriefing").hidden = true;
    $("#utcDateLabel").textContent = "ملخص يوم " + formatDate(row.briefing_date);
    setPeriod(row.briefing_date);
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

    const sections = (Array.isArray(row.sections) ? row.sections : []).filter(Boolean)
      .map((section) => ({...section, items: dedupeBriefingItems(section.items, "headline", seen)})).filter((section) => section.items.length);
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

    const freshness = stale ? "لم تصدر نسخة اليوم؛ هذه أحدث نسخة متاحة للحساب." : "النسخة الكاملة متاحة.";
    setStatus(freshness + " تاريخ التغطية: " + formatDate(row.briefing_date) + ". وقت الإعداد: " + formatTime(row.generated_at) + " UTC.", stale ? "warning" : "");
  }
  function clearEdition() {
    for (const id of ["briefingStats", "executiveSection", "topSection", "coverageSection", "trendsSection", "watchSection", "publicBriefing"]) $("#" + id).hidden = true;
    for (const id of ["executiveSummary", "topDevelopments", "briefingSections", "globalTrends", "watchlist", "publicBriefingGrid"]) $("#" + id).replaceChildren();
  }
  function renderPublic(items) {
    $("#publicBriefingGrid").innerHTML = items.map(item =>
      '<article class="briefing-story"><div class="briefing-meta"><span class="briefing-tag">' +
      escapeHTML(categoryNames[item.category] || "أخبار العالم") + '</span>' +
      (item.needsReview ? '<span class="confidence-reported">منشور · غير متحقق منه بصورة مستقلة</span>' : "") + '<time datetime="' +
      new Date(item.published).toISOString() + '">' + escapeHTML(localTime.format(item.published)) +
      ' الرياض</time></div><h3 dir="auto">' + escapeHTML(item.title) + '</h3>' +
      (item.summary ? '<p dir="auto">' + escapeHTML(item.summary) + '</p>' : "") +
      '<div class="briefing-sources">' + (item.id ? '<a href="index.html?article=' + item.id + '">اقرأ التغطية</a>' : "") +
      '<a href="' + escapeHTML(item.url) + '" target="_blank" rel="noopener noreferrer" dir="auto">' +
      escapeHTML(item.source) + ' <span aria-hidden="true">↗</span></a></div></article>'
    ).join("");
    $("#publicBriefing").hidden = items.length === 0;
  }
  async function load({ hard = false } = {}) {
    const day = state.selected || M.previousDay(), serial = ++state.request;
    state.pending = true;
    $("#retryBriefing").disabled = true;
    if (hard) {
      clearEdition();
      state.lastRender = "";
      $("#utcDateLabel").textContent = "النسخة اليومية العالمية";
      setPeriod(day);
      setStatus("جارٍ تحميل تغطية " + formatDate(day) + "…", "loading");
    }
    let hasToken = false, privateFailed = false, needsLogin = false;
    // The callback never awaits an Auth call: Supabase locks session reads during Auth events.
    try {
      let token;
      try {
        token = state.session !== undefined ? state.session?.access_token : (await auth?.auth.getSession())?.data?.session?.access_token;
      } catch { /* The public feed does not depend on session discovery. */ }
      if (serial !== state.request) return;
      hasToken = Boolean(token);
      needsLogin = !hasToken;
      if (hasToken) {
        try {
          let row = await M.edition(token, day);
          if (!row && day === M.previousDay()) row = await M.edition(token, day, true);
          if (serial !== state.request) return;
          if (row) {
            state.lastRender = `private:${day}`;
            $("#briefingSignIn").hidden = true;
            renderBriefing(row, row.briefing_date !== day);
            return;
          }
        } catch (error) {
          privateFailed = true;
          needsLogin = [401, 403].includes(error.status);
        }
      }
      if (serial !== state.request) return;
      // The public feed is authorized to show public articles only, never private editions.
      $("#briefingSignIn").hidden = !needsLogin;
      if (needsLogin) $("#briefingSignIn").href = "account.html?next=" + encodeURIComponent("/daily-briefing.html" + (day === M.previousDay() ? "" : "?date=" + day));
      if (needsLogin && state.lastRender.startsWith("private:")) {
        clearEdition();
        state.lastRender = "";
      }
      const items = await M.publicEdition(day);
      if (serial !== state.request) return;
      $("#utcDateLabel").textContent = "تغطية يوم " + formatDate(day);
      setPeriod(day);
      clearEdition();
      renderPublic(items);
      state.lastRender = items.length ? `public:${day}` : "";
      const access = needsLogin ? " سجّل دخولك لفتح النسخة الكاملة عند توفرها." :
        privateFailed ? " تعذّر تحميل النسخة الكاملة من حسابك." : " لا توجد نسخة كاملة لهذا التاريخ.";
      setStatus((items.length ? "نعرض مختارات من الأخبار العامة المنشورة لهذا التاريخ، لا النسخة الكاملة." :
        "لا توجد مواد عامة متاحة لهذا التاريخ. اختر يومًا آخر.") + access, "warning");
    } catch {
      if (serial !== state.request) return;
      setStatus(state.lastRender ? "تعذّر التحديث. نعرض القراءة السابقة لهذه الصفحة." :
        "تعذّر الوصول إلى بيانات هذا اليوم. أعد المحاولة أو تصفّح الأرشيف العام.", "error");
    } finally {
      if (serial === state.request) {
        state.pending = false;
        $("#retryBriefing").disabled = false;
      }
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
    const target = M.previousDay(now);
    if (target !== state.lastDay) {
      const followLatest = state.selected === state.lastDay;
      state.lastDay = target;
      picker.max = target;
      if (followLatest) { picker.value = state.selected = target; load({ hard: true }); }
    }
  }
  let theme;
  try { theme = localStorage.getItem("wrldline:theme"); } catch {}
  theme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  $("#briefingThemeButton").textContent = theme === "dark" ? "☀" : "☾";
  $("#briefingThemeButton").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("wrldline:theme", next); } catch {}
    $("#briefingThemeButton").textContent = next === "dark" ? "☀" : "☾";
  });
  $("#briefingYear").textContent = new Date().getUTCFullYear();
  state.lastDay = M.previousDay();
  picker.max = state.lastDay;
  const requested = new URLSearchParams(location.search).get("date") || "";
  picker.value = state.selected = M.windowOf(requested) && requested <= state.lastDay ? requested : state.lastDay;
  function chooseDate(day) {
    day ||= state.lastDay;
    if (!M.windowOf(day) || day > M.previousDay()) {
      picker.value = state.selected;
      return;
    }
    picker.value = state.selected = day;
    const next = new URL(location.href);
    if (day === state.lastDay) next.searchParams.delete("date");
    else next.searchParams.set("date", day);
    try { history.replaceState(null, "", next); } catch {}
    load({ hard: true });
  }
  picker.addEventListener("change", () => chooseDate(picker.value));
  $("#latestBriefing").addEventListener("click", () => { picker.value = state.lastDay; chooseDate(picker.value); });
  $("#retryBriefing").addEventListener("click", () => load());
  auth?.auth.onAuthStateChange((event, session) => {
    const old = state.session?.access_token;
    state.session = session;
    if (event === "SIGNED_OUT" || (old !== session?.access_token && event !== "INITIAL_SESSION")) {
      ++state.request;
      clearEdition();
      setTimeout(() => load({ hard: true }), 0);
    }
  });
  load({ hard: true });
  updateCountdown();
  setInterval(updateCountdown, 1000);
  setInterval(() => { if (!document.hidden && !state.pending && picker.value === state.lastDay) load(); }, 5 * 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !state.pending) load(); });
})();
