/* WRLDLINE Intelligence layer — client-only, source-attributed and privacy-light. */
(() => {
  "use strict";
  const VISIT_KEY = "wrldline:last-visit:v1";
  const READ_KEY = "wrldline:reading-mode:v1";
  const $ = (id) => document.getElementById(id);
  let articles = [];
  const esc = (v) => window.WRLDLINE_UI?.escapeHTML?.(v) || String(v ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const fmt = (v) => { try { return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {dateStyle:"medium", timeStyle:"short"}).format(new Date(v)); } catch { return "غير متوفر"; } };
  const reliability = (a) => {
    return String(a?.verification || "unconfirmed").toLowerCase() === "disputed"
      ? ["محل خلاف", "disputed"]
      : ["لم يُسجل تحقق بشري", "unconfirmed"];
  };
  function renderIntelligenceNotice(a) {
    const id = String(a?.id || "");
    const canonical = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      ? "https://al-ghaib.us.ci/news/" + id.toLowerCase()
      : "";
    const link = canonical
      ? `<a href="${esc(canonical)}" rel="noopener noreferrer">افتح صفحة الخبر وسجل التحقق العام</a>`
      : "";
    return `<section class="intel-change-log" role="note">
      <div class="intel-analysis-head"><strong>حدود التحليل والإجابة</strong><span>إفصاح تحريري</span></div>
      <p>ميزة «اسأل الخبر» والإجابة الآلية الموثقة غير مفعّلتين في هذه النافذة حالياً. لا نعرض إجابة قالبية من عنوان الخبر على أنها تحليل ذكاء اصطناعي، ولا نستنتج صحة الخبر من عدد العناوين.</p>
      <p>سجل التحقق والأدلة المنشورة — إن توفرت — موجود في صفحة الخبر المستقلة.</p>
      ${link}
    </section>`;
  }
  function enhanceModal(e) {
    const a = e.detail?.article;
    if (!a) return;
    const body = document.querySelector(".modal-article-body");
    if (!body || body.querySelector(".intel-change-log")) return;
    body.insertAdjacentHTML("beforeend", renderIntelligenceNotice(a));
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
