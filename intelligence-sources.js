(() => {
  "use strict";
  const API = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safeUrl = value => {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  };
  let rows = [], checkedAt = 0, phase = "idle";
  const dates = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const numbers = new Intl.NumberFormat("ar-SA");
  const normalize = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, "").replace(/[آأإٱ]/g, "ا").trim();
  function freshness(value) {
    const age = Date.now() - Date.parse(value || "");
    if (!Number.isFinite(age) || age < 0) return ["unknown", "وقت الرصد غير متاح"];
    if (age <= 24 * 3600000) return ["fresh", "حديث خلال 24 ساعة"];
    if (age <= 72 * 3600000) return ["recent", "مرصود خلال 72 ساعة"];
    return ["stale", "متأخر عن نافذة الرصد"];
  }
  function render() {
    const q = normalize($("sourceSearch").value);
    const scope = $("sourceScope").value;
    const data = rows.filter(x => (scope === "all" || x.scope === scope) && normalize([x.name,x.lang,x.langLabel,x.scopeLabel].join(" ")).includes(q)).sort((a, b) => b.count - a.count);
    const status = $("sourceStats"), retry = $("sourceRetry");
    const sample = checkedAt ? " آخر فحص للعينة (الرياض): " + dates.format(checkedAt) + "." : "";
    const count = data.length
      ? numbers.format(data.length) + " ناشرًا مطابقًا؛ " + numbers.format(rows.reduce((n, x) => n + x.count, 0)) + " قصة في العينة الكاملة لآخر 72 ساعة."
      : rows.length ? "لا توجد مصادر تطابق التصفية." : "لا توجد مصادر مرصودة في عينة آخر 72 ساعة.";
    status.textContent = phase === "loading" ? (checkedAt ? "جارٍ تحديث العينة؛ نعرض القراءة السابقة." + sample : "جارٍ بناء دليل المصادر من الأخبار المنشورة…")
      : phase === "error" ? (checkedAt ? "تعذر تحديث الدليل؛ نعرض العينة السابقة." + sample : "تعذر تحميل دليل المصادر. أعد المحاولة أو تصفّح الأرشيف.")
      : count + sample;
    retry.hidden = phase !== "error" && !(phase === "loading" && document.activeElement === retry);
    retry.setAttribute("aria-disabled", String(phase === "loading"));
    $("sourceSearch").disabled = !checkedAt;
    $("sourceScope").disabled = !checkedAt;
    $("sourceGrid").innerHTML = data.length ? data.map(x => {
      const link = x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">رابط المصدر <span aria-hidden="true">↗</span></a>' : '<span>رابط المصدر غير متاح</span>';
      const latest = x.latest ? '<time datetime="' + esc(x.latest) + '">' + esc(dates.format(Date.parse(x.latest))) + '</time>' : "غير متوفر";
      return '<article class="source-card"><div class="source-card-top"><span class="source-badge">' + esc(x.scopeLabel) + '</span><span>' + esc(x.langLabel) + '</span></div><h2 dir="auto">' + esc(x.name) + '</h2><div class="source-meta"><span>قصص مرصودة</span><strong class="source-stat">' + numbers.format(x.count) + '</strong></div><p>آخر نشر مرصود: ' + latest + '<br>التصحيحات المسجلة علنًا: ' + numbers.format(x.corrections) + '</p><p class="source-freshness">' + esc(x.freshnessLabel) + '</p>' + link + '</article>';
    }).join("") : phase === "error" && !checkedAt ? '<a href="/news/">تصفّح الأخبار المنشورة ومصادرها</a>' : "";
  }
  async function boot() {
    if (phase === "loading") return;
    phase = "loading";
    render();
    try {
      const response = await fetch(API + "/rest/v1/rpc/public_source_directory", {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ p_hours: 72, p_limit: 300 }),
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (!Array.isArray(data) || data.length > 300) throw new Error("Invalid directory response");
      const scope = { international: "دولي", regional: "إقليمي", national: "وطني", local: "محلي", unknown: "غير محدد" };
      const langs = { ar: "العربية", en: "الإنجليزية", fr: "الفرنسية", unknown: "غير محددة" };
      rows = data.filter(item => item && typeof item === "object").map(item => {
        const count = Number(item.article_count || 0);
        const corrections = Number(item.correction_count || 0);
        const latest = item.latest_published_at || null;
        const [freshnessKey, freshnessLabel] = freshness(latest);
        const itemScope = String(item.source_scope || "unknown");
        const itemLang = String(item.source_language || "unknown");
        return {
          name: String(item.source_name || "المصدر غير متاح"),
          url: safeUrl(item.source_url),
          scope: itemScope,
          lang: itemLang,
          count: Number.isSafeInteger(count) && count >= 0 ? count : 0,
          corrections: Number.isSafeInteger(corrections) && corrections >= 0 ? corrections : 0,
          latest: freshnessKey === "unknown" ? null : new Date(latest).toISOString(),
          scopeLabel: scope[itemScope] || itemScope,
          langLabel: langs[itemLang] || itemLang,
          freshnessLabel
        };
      });
      checkedAt = Date.now();
      phase = "ready";
    } catch (error) {
      phase = "error";
      console.warn("WRLDLINE public source directory unavailable:", error.message);
    }
    const restore = phase === "ready" && document.activeElement === $("sourceRetry");
    render();
    if (restore) $("sourceSearch").focus({preventScroll:true});
  }
  $("sourceSearch").addEventListener("input", render);
  $("sourceScope").addEventListener("change", render);
  $("sourceRetry").addEventListener("click", boot);
  boot();
})();
