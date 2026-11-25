/* Admin-only aggregate freshness UI. The server independently validates Auth. */
(() => {
  "use strict";
  const button = document.getElementById("sourceFreshnessRefresh");
  const status = document.getElementById("sourceFreshnessStatus");
  const values = document.getElementById("sourceFreshnessCounts");
  const panel = document.getElementById("editorPanel");
  if (!button || !status || !values || !panel) return;
  let busy = false, loaded = false;
  const number = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 10000000) : 0;
  async function refresh() {
    if (busy) return;
    const client = window.WRLDLINE_ADMIN_DB;
    if (!client) { status.textContent = "سجل دخول المدير أولًا."; return; }
    let data;
    try { ({ data } = await client.auth.getSession()); }
    catch { status.textContent = "تعذر التحقق من جلسة المدير. أعد تسجيل الدخول ثم حاول."; return; }
    if (data?.session?.user?.app_metadata?.role !== "admin") {
      status.textContent = "تحديث حداثة المصادر يتطلب حساب مدير موثوقًا؛ تبقى المراقبة المجدولة مستقلة.";
      return;
    }
    busy = true; button.disabled = true; status.textContent = "جارٍ فحص المصادر الفعلية...";
    try {
      const { data: report, error } = await client.functions.invoke("source-freshness", { body: {} });
      if (error || report?.ok !== true || !report.counts) throw new Error("unavailable");
      values.replaceChildren();
      const labels = { healthy: "سليم", no_new_news: "فحص ناجح دون خبر جديد", stale: "متأخر", error: "خطأ مصدر", not_initialized: "غير مهيأ", configuration_required: "يحتاج إعدادًا" };
      for (const [key, label] of Object.entries(labels)) {
        const item = document.createElement("p");
        item.textContent = label + ": " + number(report.counts[key]); values.appendChild(item);
      }
      if (report.diagnosis && report.diagnosis.counts) {
        const dlabels = { never_succeeded: "عطل: لم ينجح قط", last_attempt_failed: "عطل: آخر محاولة فشلت", stale_source: "عطل: مصدر راكد", paused_expected: "متوقع بسبب إيقاف الجلب", never_polled: "لم يُفحص بعد", misconfigured: "يحتاج إعداد وتيرة" };
        for (const [key, label] of Object.entries(dlabels)) {
          const item = document.createElement("p"); item.dataset.diagnosis = key;
          item.textContent = label + ": " + number(report.diagnosis.counts[key]); values.appendChild(item);
        }
        const note = document.createElement("p"); note.className = "muted";
        note.textContent = report.ingestion_paused ? "الجلب موقوف عمدًا؛ تأخر المصادر الناتج عن الإيقاف لا يُعد عطلًا في المصدر." : "الجلب مفعّل؛ كل تأخر يُعد عطلًا.";
        values.appendChild(note);
      }
      status.textContent = "فُحص " + number(report.checked_sources) + " مصدرًا؛ يحتاج " + number(report.actionable_sources) + " إلى متابعة. آخر تحديث: " + new Date().toLocaleString("ar-SA") + ". التنبيهات الخارجية غير مهيأة.";
    } catch { status.textContent = "تعذر فحص المصادر. حاول لاحقًا؛ لا يُعامل فشل الفحص على أنه نجاح أو مصدر سليم."; }
    finally { busy = false; button.disabled = false; }
  }
  button.addEventListener("click", refresh);
  const observer = new MutationObserver(() => {
    if (panel.classList.contains("hidden")) { loaded = false; values.replaceChildren(); return; }
    if (!loaded) { loaded = true; void refresh(); }
  });
  observer.observe(panel, { attributes: true, attributeFilter: ["class"] });
})();
