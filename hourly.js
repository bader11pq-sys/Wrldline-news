(() => {
  "use strict";
  const API = "https://vmaxbnogmmfyrcucapnq.supabase.co/rest/v1/editorial_publications";
  const KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const $ = (id) => document.getElementById(id);
  const labels = { politics:"سياسة ودبلوماسية", economy:"اقتصاد وأسواق", security:"أمن ودفاع", world:"حول العالم", tech:"تقنية" };
  const confidence = { confirmed:"تأكيد متعدد المصادر", reported:"تقرير مدعوم بمصادر مستقلة", developing:"تطور مستمر" };
  const safeUrl = (value) => { try { const u = new URL(String(value || "")); return ["https:","http:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
  const node = (tag, value, cls) => { const n=document.createElement(tag); if(value!==undefined)n.textContent=String(value); if(cls)n.className=cls; return n; };
  const time = (value) => { const d=new Date(value); return Number.isNaN(d.getTime()) ? "وقت النشر غير متاح" : new Intl.DateTimeFormat("ar-SA-u-ca-gregory",{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short"}).format(d)+" بتوقيت الرياض"; };
  function renderStory(item) {
    const card=node("article",undefined,"hourly-story");
    const head=node("div",undefined,"hourly-story-head");
    head.append(node("span",labels[item.category]||"حول العالم","hourly-tag"));
    head.append(node("span",confidence[item.confidence]||confidence.reported,"hourly-confidence"));
    if(item.region)head.append(node("span",item.region,"hourly-confidence"));
    card.append(head);
    card.append(node("h3",item.headline||""));
    card.append(node("p",item.summary||""));
    if(item.context){card.append(node("h4","السياق"));card.append(node("p",item.context));}
    if(item.significance){card.append(node("h4","لماذا يهم؟"));card.append(node("p",item.significance));}
    if(item.watch_next){card.append(node("h4","ما الذي نراقبه تالياً؟"));card.append(node("p",item.watch_next));}
    const sources=Array.isArray(item.sources)?item.sources:[];
    if(sources.length){
      const box=node("div",undefined,"hourly-sources");
      sources.forEach(s=>{const url=safeUrl(s.url);if(!url)return;const a=node("a",(s.publisher||s.title||"المصدر")+(s.published_at?" · "+time(s.published_at):""));a.href=url;a.target="_blank";a.rel="noopener noreferrer";box.append(a);});
      card.append(box);
    }
    return card;
  }
  async function load(){
    const status=$("hourlyStatus");
    try{
      const q=new URLSearchParams({select:"section,slug,title,content,sources,published_at,updated_at",section:"eq.hourly",status:"eq.published",order:"published_at.desc",limit:"12"});
      const response=await fetch(API+"?"+q.toString(),{headers:{apikey:KEY,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error("HTTP "+response.status);
      const rows=await response.json();
      if(!Array.isArray(rows)||!rows.length){status.textContent="لم تُنشر نشرة جديدة بعد. سيظهر المحتوى هنا بعد أول تشغيل ناجح يجتاز معايير التحقق.";return;}
      const row=rows[0],content=row.content||{};
      $("hourlyTitle").textContent=row.title||"نشرة وردلاين التحريرية";
      $("hourlyTime").textContent="آخر تحديث: "+time(row.published_at);
      if(content.executive_summary){$("hourlySummary").textContent=content.executive_summary;$("hourlySummary").hidden=false;}
      const host=$("hourlyStories");host.replaceChildren();
      (Array.isArray(content.items)?content.items:[]).forEach(item=>host.append(renderStory(item)));
      if(!host.childElementCount)throw new Error("لا تحتوي النشرة المنشورة على قصص قابلة للعرض");
      $("hourlyEdition").hidden=false;
      status.textContent="تم تحميل آخر نشرة منشورة · "+(content.items.length)+" مواد تحريرية.";
    }catch(error){status.textContent="تعذر تحميل النشرة حالياً. أعد المحاولة بعد قليل." ;console.error("WRLDLINE hourly desk",error);}
  }
  load();
  setInterval(load,5*60*1000);
})();