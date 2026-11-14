/* WRLDLINE Intelligence layer — client-only, source-attributed and privacy-light. */
(() => {
  "use strict";
  const VISIT_KEY = "wrldline:last-visit:v1";
  const READ_KEY = "wrldline:reading-mode:v1";
  const $ = (id) => document.getElementById(id);
  let articles = [];
  const API = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const esc = (v) => window.WRLDLINE_UI?.escapeHTML?.(v) || String(v ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const fmt = (v) => { try { return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {dateStyle:"medium", timeStyle:"short"}).format(new Date(v)); } catch { return "غير متوفر"; } };
  const reliability = (a) => {
    const v = a.verification || "unconfirmed";
    const map = {unconfirmed:["غير مؤكد","neutral"],single:["مصدر واحد","single"],multi:["مؤكد بمصدرين","multi"],confirmed:["مؤكد بثلاثة مصادر","confirmed"],official_confirmed:["تأكيد رسمي + مصادر مستقلة","official"],field_confirmed:["تأكيد ميداني + مصادر مستقلة","official"],disputed:["متنازع عليه","disputed"],corrected:["صُحح","corrected"],retracted:["مسحوب","retracted"]};
    return map[v] || map.unconfirmed;
  };
  function renderReliability(a) {
    const [label, cls] = reliability(a);
    const count = Number(a.verification_independent_count || a.verification_source_count || 0);
    return `<section class="intel-reliability intel-reliability--${cls}" aria-label="مقياس موثوقية الخبر"><div><strong>${label}</strong><span>${count ? `${count} مصدر مستقل` : "لم تُسجل قرائن مستقلة بعد"}</span></div><div class="intel-steps"><i class="is-on"></i><i class="${count >= 2 ? "is-on" : ""}"></i><i class="${a.verification_official_count ? "is-on" : ""}"></i></div><small>المقياس يتغير عند إضافة أدلة تحريرية. لا تعني كثرة التغطية استقلال المصادر.</small></section>`;
  }
  function analyze(a) {
    const text = `${a.title || ""} ${a.summary || ""}`;
    const type = /سعر|تضخم|فائدة|نفط|سوق|اقتصاد|ميزانية|عملة|دولار/.test(text) ? "اقتصادي" : /حرب|هجوم|أمن|جيش|صاروخ|حدود|دفاع/.test(text) ? "أمني" : /انتخاب|حكومة|رئيس|برلمان|سياسة|اتفاق/.test(text) ? "سياسي" : "عام";
    const dimensions = {سياسي:"موازين القوة والقرارات الرسمية",اقتصادي:"الأسواق والكلفة على الأسر والشركات",أمني:"المخاطر والقدرة على التصعيد",عام:"الأطراف والسياق والآثار المحتملة"};
    return `<section class="intel-analysis"><div class="intel-analysis-head"><strong>تحليل الخبر</strong><span>زاوية ${type}</span></div><p><b>ما الذي نعرفه:</b> هذا ملخص منسوب إلى <b>${esc(a.src || "المصدر الأصلي")}</b>، وليس بديلاً عن النص الكامل.</p><p><b>البعد الأبرز:</b> ${dimensions[type]}.</p><p><b>ما الذي نراقبه:</b> أي بيان رسمي جديد، مصدر مستقل إضافي، أو تصحيح من الناشر.</p><small>تحليل مساعد آلياً · يحتاج مراجعة بشرية قبل استخدامه كحكم نهائي.</small></section>`;
  }
  function askBox(a) {
    return `<section class="intel-ask"><div><strong>اسأل الخبر</strong><span>إجابات قصيرة من بيانات هذه القصة ومصادرها فقط</span></div><form id="intelAskForm"><label class="sr-only" for="intelAskInput">سؤالك عن الخبر</label><input id="intelAskInput" placeholder="ما الذي تغيّر؟ ومن المصدر؟" autocomplete="off"><button type="submit">اسأل</button></form><p id="intelAskAnswer" class="intel-ask-answer" hidden></p></section>`;
  }
  function wireAsk(a) {
    $("intelAskForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = $("intelAskInput").value.trim();
      if (!q) return;
      const answer = $("intelAskAnswer");
      answer.hidden = false;
      answer.innerHTML = `بحسب الملخص المنشور، يتعلق السؤال بـ «${esc(a.title)}». المصدر المنسوب هو <b>${esc(a.src || "المصدر الأصلي")}</b>، وآخر توقيت مسجل ${esc(fmt(a.published_at))}. لا نضيف معلومة لا تظهر في مصادر القصة؛ <a href="${esc(a.sourceURL || "#")}" target="_blank" rel="noopener noreferrer">افتح المصدر الأصلي ↗</a>`;
    });
  }
  function changeLogShell() {
    return `<section class="intel-change-log"><div class="intel-analysis-head"><strong>سجل التغيير المرئي</strong><span>تحديثات القصة</span></div><div class="intel-change-items"><small>جارٍ التحقق من سجل العنوان والملخص والثقة…</small></div></section>`;
  }
  async function loadChangeLog(a, body) {
    const host = body.querySelector(".intel-change-items");
    if (!host) return;
    try {
      const select = "changed_at,change_type,changed_fields";
      const url = `${API}/rest/v1/article_change_log?select=${select}&article_id=eq.${encodeURIComponent(a.id)}&order=changed_at.desc&limit=8`;
      const token = await window.WRLDLINE_AUTH?.getAccessToken?.();
      const response = await fetch(url, {headers:{apikey:KEY,...(token?{Authorization:"Bearer "+token}:{})}, signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = await response.json();
      if (!rows.length) { host.innerHTML = "<small>لا توجد تغييرات مسجلة بعد؛ هذه هي النسخة الحالية المنشورة.</small>"; return; }
      const labels = {title:"العنوان",summary:"الملخص",verification:"الموثوقية",verification_source_count:"عدد المصادر",correction_note:"التصحيح",ai_summary:"التحليل المساعد",editorial_status:"الحالة"};
      host.innerHTML = rows.map(row => { const fields = Object.keys(row.changed_fields || {}).map(k => labels[k] || k).join("، "); const kind = row.change_type === "correction" ? "تصحيح" : row.change_type === "verification" ? "تحديث موثوقية" : row.change_type === "created" ? "أُنشئت القصة" : "تحديث تحريري"; return `<div class="intel-change-item"><strong>${esc(kind)}</strong><span>${esc(fmt(row.changed_at))}</span><p>${esc(fields || "تغيرت بيانات القصة")}</p></div>`; }).join("");
    } catch (error) {
      host.innerHTML = "<small>سجل التغييرات سيظهر بعد تفعيل ترحيل التدقيق في Supabase؛ لا نخمن تاريخاً غير موجود.</small>";
      console.warn("WRLDLINE change log:", error);
    }
  }
  function enhanceModal(e) {
    const a = e.detail?.article;
    if (!a) return;
    const body = document.querySelector(".modal-article-body");
    if (!body || body.querySelector(".intel-reliability")) return;
    body.insertAdjacentHTML("beforeend", renderReliability(a) + analyze(a) + askBox(a) + changeLogShell());
    wireAsk(a);
    loadChangeLog(a, body);
  }
  function renderDashboard() {
    const last = Number(localStorage.getItem(VISIT_KEY) || 0);
    const fresh = articles.filter(a => Date.parse(a.published_at || "") > last);
    $("intelNewCount") && ($("intelNewCount").textContent = fresh.length);
    $("intelLastVisit") && ($("intelLastVisit").textContent = last ? `منذ ${fmt(last)}` : "هذه أول زيارة مسجلة");
    const counts = articles.reduce((m, a) => { const k = reliability(a)[0]; m[k] = (m[k] || 0) + 1; return m; }, {});
    $("intelReliabilitySummary") && ($("intelReliabilitySummary").textContent = `${counts["مؤكد بمصدرين"] || 0} قصص متعددة المصادر · ${counts["تأكيد رسمي + مصادر مستقلة"] || 0} تأكيدات رسمية`);
    $("intelNewButton")?.addEventListener("click", () => { document.querySelector("#newsGrid")?.scrollIntoView({behavior:"smooth"}); document.querySelectorAll(".news-card").forEach(card => card.classList.toggle("is-new-since-visit", fresh.some(a => card.textContent.includes(a.title.slice(0, 24))))); });
    $("intelVisitButton")?.addEventListener("click", () => { localStorage.setItem(VISIT_KEY, String(Date.now())); renderDashboard(); });
    document.querySelectorAll("[data-reading-mode]").forEach(btn => btn.addEventListener("click", () => { localStorage.setItem(READ_KEY, btn.dataset.readingMode); document.documentElement.dataset.readingMode = btn.dataset.readingMode; document.querySelectorAll("[data-reading-mode]").forEach(x => x.classList.toggle("is-active", x === btn)); }));
    const savedMode = localStorage.getItem(READ_KEY) || "minute";
    document.documentElement.dataset.readingMode = savedMode;
    document.querySelector(`[data-reading-mode="${savedMode}"]`)?.classList.add("is-active");
    $("countryLensForm")?.addEventListener("submit", (e) => { e.preventDefault(); const country = $("countryLensCountry").value.trim(); const date = $("countryLensDate").value || "اليوم"; const region = $("countryLensRegion").value.trim() || "العالم"; $("countryLensResult").hidden = false; $("countryLensResult").innerHTML = `<strong>${esc(country || "الدولة المحددة")}</strong><p>نطاق الفهم: ${esc(region)} · التاريخ: ${esc(date)}.</p><small>سنربط لاحقاً القرارات الأمنية والاقتصادية والاجتماعية بالمصادر الرسمية والتغطية متعددة اللغات. هذه الواجهة لا تستنتج سياسة من خبر واحد.</small>`; });
  }
  document.addEventListener("wrldline:news", (e) => { articles = e.detail?.articles || []; renderDashboard(); });
  document.addEventListener("wrldline:article-opened", enhanceModal);
  document.addEventListener("DOMContentLoaded", renderDashboard);
  window.WRLDLINE_INTELLIGENCE = { enhanceModal };
})();
