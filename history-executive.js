(() => {
"use strict";
const mount=document.querySelector("main.container");
if(!mount||document.getElementById("historyExecutiveSummary"))return;
const section=document.createElement("section");
section.id="historyExecutiveSummary";
section.setAttribute("aria-labelledby","historyExecutiveTitle");
section.innerHTML=\`
<style>
#historyExecutiveSummary{margin:0 0 30px;padding:clamp(17px,3vw,28px);border:1px solid var(--line);border-radius:19px;background:linear-gradient(145deg,#1a3049,#102035 78%);box-shadow:0 16px 42px #0002}
#historyExecutiveSummary .hx-kicker{font:700 10px Manrope,sans-serif;letter-spacing:.14em;color:var(--gold)}
#historyExecutiveSummary h2{font-size:clamp(22px,3.2vw,32px);line-height:1.4;margin:7px 0}
#historyExecutiveSummary .hx-lead{max-width:850px;color:#c3d0df;font-size:12px;line-height:2;margin:7px 0 18px}
#historyExecutiveSummary .hx-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:18px 0}
#historyExecutiveSummary .hx-metric{padding:12px;border:1px solid #3a506a;border-radius:12px;background:#0d1c2e}
#historyExecutiveSummary .hx-metric b{display:block;color:var(--gold);font:800 24px Manrope,sans-serif}
#historyExecutiveSummary .hx-metric span{font-size:10px;color:#b9c7d7}
#historyExecutiveSummary .hx-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:12px;margin-top:14px}
#historyExecutiveSummary .hx-panel{min-width:0;padding:15px;border:1px solid #344b65;border-radius:13px;background:#102238}
#historyExecutiveSummary h3{font-size:14px;margin:0 0 10px;color:#f1f4f8}
#historyExecutiveSummary p,#historyExecutiveSummary li{font-size:11px;line-height:1.9;color:#c0ccda}
#historyExecutiveSummary ul{padding-inline-start:18px;margin:6px 0}
#historyExecutiveSummary .hx-paths{display:grid;gap:7px}
#historyExecutiveSummary .hx-path{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 11px;border:1px solid #344b65;border-radius:9px;background:#142941;color:#e8eef5;text-align:start;font:inherit;font-size:11px;cursor:pointer}
#historyExecutiveSummary .hx-path:hover{border-color:var(--gold)}
#historyExecutiveSummary .hx-path span{color:var(--gold);white-space:nowrap;font-size:10px}
#historyExecutiveSummary .hx-regions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
#historyExecutiveSummary .hx-region{padding:9px;border:1px solid #344b65;border-radius:9px}
#historyExecutiveSummary .hx-region b{display:block;color:var(--gold);font-size:12px}
#historyExecutiveSummary .hx-region small{font-size:9px;color:#b7c5d5}
#historyExecutiveSummary .hx-principles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}
#historyExecutiveSummary .hx-principle{padding:11px;border:1px solid #344b65;border-radius:10px}
#historyExecutiveSummary .hx-principle b{display:block;font-size:11px;color:var(--gold);margin-bottom:4px}
#historyExecutiveSummary .hx-principle span{font-size:10px;color:#bfccda;line-height:1.8}
#historyExecutiveSummary .hx-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px}
#historyExecutiveSummary .hx-actions a{display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border:1px solid var(--gold);border-radius:9px;color:var(--gold);font-size:10px}
#historyExecutiveSummary .hx-actions a:first-child{background:var(--gold);color:#172437;font-weight:700}
#historyExecutiveSummary .hx-note{font-size:9px;color:#93a7bb;margin:12px 0 0}
@media(max-width:720px){#historyExecutiveSummary .hx-grid{grid-template-columns:1fr}#historyExecutiveSummary .hx-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}#historyExecutiveSummary .hx-principles{grid-template-columns:1fr 1fr}}
@media(max-width:460px){#historyExecutiveSummary .hx-principles{grid-template-columns:1fr}#historyExecutiveSummary .hx-path{align-items:flex-start;flex-direction:column}}
</style>
<div class="hx-kicker">WRLDLINE HISTORY · EXECUTIVE OVERVIEW</div>
<h2 id="historyExecutiveTitle">ملخص تنفيذي: صورة مترابطة لتاريخ العالم</h2>
<p class="hx-lead">تجمع الموسوعة بين تاريخ الدول والحضارات والتحولات الكبرى التي صنعت العالم؛ من نشوء المدن والزراعة وشبكات التجارة، إلى الإمبراطوريات والأديان والعلوم والاستعمار وبناء الدول الحديثة. الهدف ليس سرد الأحداث فقط، بل تفسير أسباب التحول، ومقارنة التجارب، وقراءة الأدلة من مصادر متعددة.</p>
<div class="hx-metrics" aria-live="polite">
 <div class="hx-metric"><b id="hxCountryCount">—</b><span>ملفات الدول والحضارات</span></div>
 <div class="hx-metric"><b>7</b><span>ملفات دول جديدة ضمن التوسعة</span></div>
 <div class="hx-metric"><b>4</b><span>مسارات زمنية في كل ملف جديد</span></div>
 <div class="hx-metric"><b>6</b><span>محاور تحريرية ومنهجية</span></div>
</div>
<div class="hx-grid">
 <article class="hx-panel">
  <h3>ما الذي تغطيه الموسوعة؟</h3>
  <ul><li>الدول والحضارات: النشأة، التحول السياسي، المؤسسات، والتاريخ المعاصر.</li><li>المجتمع والاقتصاد: التجارة، المدن، الهجرة، العمل، البيئة، والموارد.</li><li>المعرفة والثقافة: العلوم، الأديان، اللغات، الفنون، والكتابة.</li><li>التاريخ المقارن: أوجه التشابه والاختلاف دون افتراض مسار حضاري واحد.</li></ul>
  <h3 style="margin-top:14px">مسارات قراءة مقترحة</h3>
  <div class="hx-paths">
   <button class="hx-path" type="button" data-target="historyDeepArchive">من الزراعة إلى نشوء المدن <span>تاريخ طويل ↗</span></button>
   <button class="hx-path" type="button" data-target="historyWorldLab">آسيا وأفريقيا والأمريكتان <span>ملفات الدول ↗</span></button>
   <button class="hx-path" type="button" data-target="historyLab">الأفكار والعلوم والمؤسسات <span>مختبر التاريخ ↗</span></button>
   <button class="hx-path" type="button" data-target="europeanaArchive">الوثائق والقطع المتحفية <span>الأرشيف الرقمي ↗</span></button>
  </div>
 </article>
 <article class="hx-panel">
  <h3>توسيع التغطية الجغرافية</h3>
  <p>تضيف التوسعة ملفات أكثر تفصيلاً لمناطق لا ينبغي أن تبقى على هامش السرد التاريخي العالمي.</p>
  <div class="hx-regions">
   <div class="hx-region"><b>آسيا</b><small>الهند · اليابان · إيران</small></div><div class="hx-region"><b>الأناضول</b><small>تركيا وتاريخ العوالم البيزنطية والعثمانية</small></div><div class="hx-region"><b>أفريقيا</b><small>إثيوبيا · مالي وإمبراطوريات غرب أفريقيا</small></div><div class="hx-region"><b>الأمريكتان</b><small>المكسيك وحضارات أمريكا الوسطى</small></div>
  </div>
  <h3 style="margin-top:15px">مخرجات كل ملف جديد</h3>
  <ul><li>خط زمني من أربع مراحل تاريخية مع فصول تفسيرية.</li><li>سياق اجتماعي وثقافي وجغرافي، لا قائمة حكام فقط.</li><li>روابط إلى أرشيفات ومتاحف ومؤسسات مرجعية.</li><li>تنبيهات على التواريخ التقريبية والمسائل التي لا تزال محل نقاش.</li></ul>
 </article>
</div>
<div class="hx-principles">
 <div class="hx-principle"><b>تعدد المصادر</b><span>مقارنة الأدلة الأثرية والنصية والمؤسسات الأكاديمية، وعدم الاكتفاء بمصدر واحد.</span></div>
 <div class="hx-principle"><b>تمييز اليقين</b><span>الفصل بين التاريخ المؤكد والتقدير الزمني والرواية التقليدية والفرضية البحثية.</span></div>
 <div class="hx-principle"><b>سياق متوازن</b><span>إظهار تجارب المجتمعات المحلية والنساء والعمال والشعوب الأصلية إلى جانب الدول والنخب.</span></div>
 <div class="hx-principle"><b>مقارنة مسؤولة</b><span>تجنب التصنيفات التراتبية والتفسيرات التي تختزل التاريخ في سبب واحد.</span></div>
 <div class="hx-principle"><b>شفافية التحرير</b><span>إظهار المصدر ونطاقه وتاريخه، والتنبيه إلى اختلاف وجهات النظر عند وجوده.</span></div>
 <div class="hx-principle"><b>تطوير تدريجي</b><span>إضافة خرائط زمنية ومواد أولية وأسئلة تعلم مع مراجعة المحتوى قبل توسيعه.</span></div>
</div>
<div class="hx-actions"><a href="#grid">استكشف ملفات الدول</a><a href="#historyDeepArchive">افتح الأطلس الزمني</a><a href="#historyLab">ابدأ مسار التعلم</a></div>
<p class="hx-note">الأرقام المتغيرة تُقرأ من بيانات الصفحة عند التحميل. عدد الملفات الجديدة ثابت لهذه الدفعة، ولا يعني اكتمال التغطية التاريخية لكل دولة.</p>
\`;
const hero=mount.querySelector(".hero");
if(hero)hero.insertAdjacentElement("afterend",section);else mount.prepend(section);
const count=section.querySelector("#hxCountryCount");
try{count.textContent=String(Array.isArray(countries)?countries.length:"—");}catch(_){count.textContent="—";}
section.addEventListener("click",e=>{const btn=e.target.closest("[data-target]");if(!btn)return;const target=document.getElementById(btn.dataset.target);if(target)target.scrollIntoView({behavior:"smooth",block:"start"});});
})();