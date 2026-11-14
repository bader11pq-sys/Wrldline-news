/* Coverage gap index: transparent heuristic, never presented as an objective ranking. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const topics = [
    {name:"أزمات إنسانية", keys:/نزوح|لاجئ|مجاعة|مخيم|مدني|مساعدات|وباء|زلزال|فيضانات/, importance:1.35},
    {name:"أمن إقليمي", keys:/حرب|هجوم|صاروخ|حدود|جيش|أمن|اشتباك|هدنة/, importance:1.15},
    {name:"اقتصاد الحياة اليومية", keys:/تضخم|أسعار|وقود|غذاء|فائدة|عملة|وظائف|سكن|كهرباء/, importance:1.2},
    {name:"مناخ وعلوم", keys:/مناخ|حرارة|جفاف|طقس|زلزال|علوم|صحة|طاقة/, importance:1.1},
    {name:"حوكمة وتقنية", keys:/انتخاب|حكومة|برلمان|قانون|ذكاء اصطناعي|رقائق|خصوصية|بيانات/, importance:1.05}
  ];
  function render(articles=[]) {
    const host = $("coverageGapGrid"); if (!host) return;
    const rows = topics.map(t => {
      const matches = articles.filter(a => t.keys.test(`${a.title||""} ${a.summary||""}`));
      const sources = new Set(matches.map(a => a.src || a.source_name).filter(Boolean)).size;
      const recent = matches.filter(a => Date.now() - Date.parse(a.published_at||0) < 24*3600000).length;
      const coverage = Math.max(1, matches.length + sources * .6);
      const gap = Math.round(Math.min(99, (t.importance * 100) / (coverage + 2)));
      return {...t, matches:matches.length, sources, recent, gap};
    }).sort((a,b)=>b.gap-a.gap).slice(0,5);
    const top = rows[0];
    if ($("coverageGapSummary")) $("coverageGapSummary").textContent = top ? `أكبر فجوة تقديرية الآن: ${top.name} · ${top.gap}/100` : "بانتظار بيانات كافية";
    host.innerHTML = rows.map((r,i) => `<article class="gap-card"><div class="gap-card-top"><span>#${i+1} · ${esc(r.name)}</span><strong>${r.gap}</strong></div><div class="gap-bar"><i style="width:${r.gap}%"></i></div><p>${r.matches ? `${r.matches} عناوين من ${r.sources || 1} مصادر · ${r.recent} خلال 24 ساعة` : "لا توجد تغطية كافية في العينة الحالية"}</p><small>إشارة تحريرية: الأهمية التقريبية ÷ حجم التغطية، وليست حكماً على أهمية حياة الناس.</small></article>`).join("");
  }
  document.addEventListener("wrldline:news", e => render(e.detail?.articles || []));
  document.addEventListener("DOMContentLoaded", () => render([]));
})();
