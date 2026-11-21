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
  let rows = [];
  function freshness(value) {
    const age = Date.now() - Date.parse(value || "");
    if (!Number.isFinite(age)) return ["unknown", "لا توجد بيانات زمنية"];
    if (age <= 24 * 3600000) return ["fresh", "حديث خلال 24 ساعة"];
    if (age <= 72 * 3600000) return ["recent", "مرصود خلال 72 ساعة"];
    return ["stale", "متأخر عن نافذة الرصد"];
  }
  function render() {
    const q = $("sourceSearch").value.trim().toLowerCase();
    const scope = $("sourceScope").value;
    const data = rows.filter(x => (scope === "all" || x.scope === scope) && (!q || (x.name + " " + x.lang + " " + x.scope).toLowerCase().includes(q))).sort((a, b) => b.count - a.count);
    $("sourceStats").textContent = data.length + " ناشراً ظاهراً · " + rows.reduce((n, x) => n + x.count, 0) + " قصة في العينة · نافذة الرصد 72 ساعة. الأرقام تصف الحضور لا الجودة.";
    $("sourceGrid").innerHTML = data.length ? data.map(x => {
      const link = x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">افتح موقع المصدر ↗</a>' : '<span class="source-note">رابط المصدر غير متاح</span>';
      return '<article class="source-card"><div class="source-card-top"><span class="source-badge">' + esc(x.scopeLabel) + '</span><span>' + esc(x.langLabel) + '</span></div><h2>' + esc(x.name) + '</h2><div class="source-meta"><span>قصص مرصودة</span><strong class="source-stat">' + x.count + '</strong></div><p>آخر نشر مرصود: ' + esc(x.latest) + '<br>التغطية المنسوبة: ' + x.count + ' · التصحيحات المسجلة علناً: ' + x.corrections + '</p><p class="source-freshness source-freshness-' + esc(x.freshnessKey) + '">' + esc(x.freshnessLabel) + '</p>' + link + '</article>';
    }).join("") : "<div class=source-note>لا توجد مصادر مطابقة.</div>";
  }
  async function boot() {
    try {
      const response = await fetch(API + "/rest/v1/rpc/public_source_directory", {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ p_hours: 72, p_limit: 300 }),
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      const scope = { international: "دولي", regional: "إقليمي", national: "وطني", local: "محلي", unknown: "غير محدد" };
      const langs = { ar: "العربية", en: "الإنجليزية", fr: "الفرنسية", unknown: "غير محددة" };
      rows = (Array.isArray(data) ? data : []).map(item => {
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
          latest: latest ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(latest)) : "غير متوفر",
          scopeLabel: scope[itemScope] || itemScope,
          langLabel: langs[itemLang] || itemLang,
          freshnessKey,
          freshnessLabel
        };
      });
      render();
    } catch (error) {
      $("sourceStats").textContent = "تعذر بناء الدليل الآن؛ سيعمل عند توفر اتصال الأخبار.";
      $("sourceGrid").innerHTML = "<div class=source-note>لا نعرض بيانات ناقصة أو نخمن بصمة المصدر.</div>";
      console.warn("WRLDLINE public source directory unavailable:", error);
    }
  }
  $("sourceSearch").addEventListener("input", render);
  $("sourceScope").addEventListener("change", render);
  boot();
})();
