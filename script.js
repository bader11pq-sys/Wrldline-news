/* WRLDLINE NEWS — editorial frontend */
const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
const PAGE_SIZE = 24;
const CATEGORY_NAMES = { politics:"سياسة", economy:"اقتصاد", security:"أمن ودفاع", tech:"تكنولوجيا", sports:"رياضة", culture:"ثقافة", health:"صحة", world:"حول العالم" };
const state = { articles:[], filtered:[], category:"all", country:"all", lang:"ar", limit:PAGE_SIZE, saved:new Set(readSaved()), query:"", sort:"newest", loading:false, db:null, user:null, follows:{category:[],country:[]}, followOnly:false, realtime:null, pendingLocalSaved:new Set(readSaved()), telegramTicker:[] };

document.addEventListener("DOMContentLoaded", () => {
  initPreferences(); bindEvents(); updateClock(); fetchNews(); initPersonalization(); setInterval(fetchNews, 180000);
  registerServiceWorker(); setupAppInstall();
});

async function registerServiceWorker(){
 if(!("serviceWorker" in navigator))return;
 try{
  const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
  registration.update().catch(()=>{});
  registration.addEventListener("updatefound",()=>{
   const worker=registration.installing;if(!worker)return;
   worker.addEventListener("statechange",()=>{
    if(worker.state==="installed"&&navigator.serviceWorker.controller)showToast("يتوفر تحديث جديد؛ أعد تحميل الصفحة لتطبيقه.");
   });
  });
 }catch(error){console.warn("WRLDLINE PWA registration:",error);}
}

function setupAppInstall(){
 let installPrompt=null;
 const host=document.querySelector(".header-tools");if(!host)return;
 const button=document.createElement("button");button.type="button";button.className="tool-button";button.textContent="تثبيت التطبيق";button.hidden=true;button.setAttribute("aria-label","تثبيت WRLDLINE NEWS على الجهاز");
 host.insertBefore(button,host.firstChild);
 window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;button.hidden=false;});
 button.addEventListener("click",async()=>{
  if(!installPrompt)return;
  button.disabled=true;
  try{await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;button.hidden=true;}
  catch(error){console.warn("WRLDLINE install prompt:",error);}
  finally{button.disabled=false;}
 });
 window.addEventListener("appinstalled",()=>{installPrompt=null;button.hidden=true;showToast("تم تثبيت WRLDLINE NEWS على جهازك.");});
}

function readSaved(){ try{return JSON.parse(localStorage.getItem("wrldline:saved")||"[]");}catch{return [];} }
function persistSaved(){ localStorage.setItem("wrldline:saved",JSON.stringify([...state.saved])); }
function escapeHTML(value=""){ return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function safeURL(value){ try{const u=new URL(value);return ["http:","https:"].includes(u.protocol)?u.href:"#";}catch{return "#";} }
function formatDate(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return "وقت غير محدد";return new Intl.DateTimeFormat(state.lang==="ar"?"ar-SA":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(d);}
function timeAgo(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return "";const mins=Math.max(0,Math.floor((Date.now()-d)/60000));if(mins<1)return "الآن";if(mins<60)return "قبل "+mins+" د";const h=Math.floor(mins/60);if(h<24)return "قبل "+h+" س";return formatDate(value);}
function updateClock(){const now=new Date();document.getElementById("todayLabel").textContent=new Intl.DateTimeFormat("ar-SA",{weekday:"long",year:"numeric",month:"long",day:"numeric"}).format(now);document.getElementById("editionDate").textContent=formatDate(now);document.getElementById("year").textContent=now.getFullYear();}
function initPreferences(){const theme=localStorage.getItem("wrldline:theme")||"light";document.documentElement.dataset.theme=theme;document.getElementById("themeButton").textContent=theme==="dark"?"☀":"☾";}
function bindEvents(){
 document.getElementById("themeButton").addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;localStorage.setItem("wrldline:theme",next);document.getElementById("themeButton").textContent=next==="dark"?"☀":"☾";});
 document.getElementById("languageButton").addEventListener("click",()=>{state.lang=state.lang==="ar"?"en":"ar";document.documentElement.lang=state.lang;document.documentElement.dir=state.lang==="ar"?"rtl":"ltr";document.getElementById("languageButton").textContent=state.lang==="ar"?"English":"العربية";fetchNews();});
 document.getElementById("menuButton").addEventListener("click",()=>{const nav=document.getElementById("mainNav");const open=nav.classList.toggle("mobile-open");document.getElementById("menuButton").setAttribute("aria-expanded",String(open));});
 document.getElementById("searchButton").addEventListener("click",openSearch);document.getElementById("closeSearch").addEventListener("click",closeSearch);
 document.getElementById("searchInput").addEventListener("input",e=>{state.query=e.target.value.trim().toLocaleLowerCase();renderSearch();});
 document.getElementById("countryFilter").addEventListener("change",e=>{state.country=e.target.value;state.limit=PAGE_SIZE;applyFilters();});
 document.getElementById("sortFilter").addEventListener("change",e=>{state.sort=e.target.value;applyFilters();});
 document.getElementById("loadMoreButton").addEventListener("click",()=>{state.limit+=PAGE_SIZE;renderFeed();});
 document.getElementById("followFeedButton").addEventListener("click",()=>{if(!state.user){showToast("سجّل الدخول أولاً لحفظ ومزامنة متابعاتك.");return;}state.followOnly=!state.followOnly;document.getElementById("followFeedButton").classList.toggle("active",state.followOnly);document.getElementById("followFeedButton").setAttribute("aria-pressed",String(state.followOnly));applyFilters();});
 document.getElementById("followOptions").addEventListener("click",e=>{const b=e.target.closest("[data-follow-type]");if(b)toggleFollow(b.dataset.followType,b.dataset.followValue);});
 document.getElementById("savedButton").addEventListener("click",showSaved);document.getElementById("openSaved").addEventListener("click",showSaved);
 document.querySelectorAll("[data-category]").forEach(el=>el.addEventListener("click",e=>{e.preventDefault();selectCategory(el.dataset.category);}));
 document.getElementById("articleModal").addEventListener("click",e=>{if(e.target.id==="articleModal")closeArticle();});
 document.getElementById("searchOverlay").addEventListener("click",e=>{if(e.target.id==="searchOverlay")closeSearch();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeArticle();closeSearch();}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openSearch();}});
 window.addEventListener("popstate",()=>{if(!new URLSearchParams(location.search).has("article"))closeArticle(false);});
}
async function fetchNews(){
 if(state.loading)return;state.loading=true;document.getElementById("connectionLabel").textContent="جارٍ تحديث الأخبار";
 try{
  const headers={apikey:SUPABASE_ANON_KEY,Authorization:"Bearer "+SUPABASE_ANON_KEY};
  const [res,tickerRes]=await Promise.all([
   fetch(SUPABASE_URL+"/rest/v1/articles?select=*,article_translations(*)&editorial_status=eq.published&order=published_at.desc&limit=300",{headers,signal:AbortSignal.timeout(18000)}),
   fetch(SUPABASE_URL+"/rest/v1/telegram_breaking_items?select=article_id,title,summary,source_name,source_url,article_url,published_at,received_at&order=received_at.desc&limit=20",{headers,signal:AbortSignal.timeout(12000)}).catch(()=>null)
  ]);
  if(!res.ok)throw new Error("تعذر جلب الأخبار ("+res.status+")");
  const rows=await res.json();if(!Array.isArray(rows))throw new Error("استجابة الأخبار غير صالحة");
  if(tickerRes?.ok){const tickerRows=await tickerRes.json();state.telegramTicker=Array.isArray(tickerRows)?tickerRows:[];}else state.telegramTicker=[];
  state.articles=rows.map(normalizeArticle).filter(a=>a.title).sort((a,b)=>new Date(b.published_at)-new Date(a.published_at));
  populateCountries();applyFilters();updateBreaking();if(state.user)syncLocalSavedToCloud();const linkedId=new URLSearchParams(location.search).get("article");if(linkedId)openArticle(linkedId,false);document.getElementById("lastUpdated").textContent="آخر تحديث: "+formatDate(new Date());document.getElementById("connectionLabel").textContent="تم تحديث غرفة الأخبار";
 }catch(err){console.error("WRLDLINE fetch:",err);document.getElementById("connectionLabel").textContent="تعذر الاتصال بمصدر الأخبار";if(!state.articles.length){document.getElementById("heroLayout").innerHTML='<div class="empty-state"><strong>لم نتمكن من تحميل الأخبار</strong><p>تحقق من الاتصال وحاول التحديث بعد قليل.</p><button class="outline-button" onclick="fetchNews()">إعادة المحاولة</button></div>';document.getElementById("newsGrid").innerHTML="";}}
 finally{state.loading=false;}
}
function normalizeArticle(a){
 const translation=(a.article_translations||[]).find(t=>t.lang===state.lang);
 const title=translation?.title||a.title||"";const summary=translation?.summary||a.summary||"";
 return {id:String(a.id),title,summary,img:safeURL(a.image_url||""),cat:CATEGORY_NAMES[a.category]?a.category:"world",country:a.country||"دولي",src:a.source_name||"مصدر إخباري",sourceURL:safeURL(a.url||a.source_url||""),published_at:a.published_at||a.created_at||"",lang:a.lang||"ar",verification:a.verification||"preliminary",isBreaking:!!a.is_breaking,editorialStatus:a.editorial_status||"published",raw:a};
}
function populateCountries(){const select=document.getElementById("countryFilter"),previous=state.country;const countries=[...new Set([...state.articles.map(a=>a.country).filter(c=>c&&c!=="دولي"),...state.follows.country])].sort((a,b)=>a.localeCompare(b,"ar"));select.innerHTML='<option value="all">كل الدول</option>'+countries.map(c=>'<option value="'+escapeHTML(c)+'">'+escapeHTML(c)+'</option>').join("");select.value=countries.includes(previous)?previous:"all";if(select.value==="all")state.country="all";renderFollowPanel();}
function renderFollowPanel(){
 const host=document.getElementById("followOptions"),hint=document.getElementById("followHint");if(!host||!hint)return;
 if(!state.user){hint.textContent="سجّل الدخول لتحفظ اختياراتك وتزامنها مع حسابك على كل أجهزتك.";host.innerHTML='<a class="outline-button" href="account.html">تسجيل الدخول أو إنشاء حساب</a>';return;}
 hint.textContent="اختر ما تريد متابعته؛ ستظهر أخباره في موجز متابعاتي.";
 const cats=Object.entries(CATEGORY_NAMES).map(([value,label])=>({type:"category",value,label}));
 const countries=[...new Set(state.articles.map(a=>a.country).filter(c=>c&&c!=="دولي"))].sort((a,b)=>a.localeCompare(b,"ar")).map(value=>({type:"country",value,label:value}));
 const make=(item)=>'<button type="button" class="follow-chip '+(state.follows[item.type].includes(item.value)?"selected":"")+'" data-follow-type="'+item.type+'" data-follow-value="'+escapeHTML(item.value)+'" aria-pressed="'+String(state.follows[item.type].includes(item.value))+'">'+escapeHTML(item.label)+(state.follows[item.type].includes(item.value)?" ✓":" +")+'</button>';
 host.innerHTML='<div class="follow-group"><strong>الأقسام</strong><div class="follow-chip-list">'+cats.map(make).join("")+'</div></div><div class="follow-group"><strong>الدول</strong><div class="follow-chip-list">'+(countries.length?countries.map(make).join(""):'<span class="muted">تظهر الدول بعد وصول أخبارها.</span>')+'</div></div>';
}
async function initPersonalization(){
 if(!window.supabase?.createClient)return;
 state.db=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const {data:{session}}=await state.db.auth.getSession();await handlePersonalSession(session);
 state.db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>handlePersonalSession(session),0);});
}
async function handlePersonalSession(session){
 const next=session?.user||null,changed=state.user?.id!==next?.id;state.user=next;
 if(changed&&state.realtime){await state.db.removeChannel(state.realtime);state.realtime=null;}
 if(!next){state.follows={category:[],country:[]};state.followOnly=false;document.getElementById("followFeedButton").classList.remove("active");renderFollowPanel();return;}
 await loadCloudSaved(false);await loadFollows();renderFollowPanel();
 state.realtime=state.db.channel("wrldline-personal-"+next.id)
  .on("postgres_changes",{event:"*",schema:"public",table:"user_saved_articles",filter:"user_id=eq."+next.id},()=>loadCloudSaved(false))
  .on("postgres_changes",{event:"*",schema:"public",table:"user_follows",filter:"user_id=eq."+next.id},()=>loadFollows())
  .subscribe();
 if(state.articles.length)await syncLocalSavedToCloud();
}
async function loadCloudSaved(syncLocal=false){
 if(!state.db||!state.user)return;
 if(syncLocal&&state.articles.length)await syncLocalSavedToCloud();
 const {data,error}=await state.db.from("user_saved_articles").select("article_id").eq("user_id",state.user.id);
 if(error){console.warn("WRLDLINE saved library:",error.message);return;}
 state.saved=new Set((data||[]).map(x=>String(x.article_id)));persistSaved();renderFeed();
}
async function syncLocalSavedToCloud(){
 if(!state.db||!state.user||!state.articles.length)return;
 const valid=new Set(state.articles.map(a=>a.id));const rows=[...state.pendingLocalSaved].filter(id=>valid.has(id)).map(article_id=>({user_id:state.user.id,article_id}));
 if(rows.length){const {error}=await state.db.from("user_saved_articles").upsert(rows,{onConflict:"user_id,article_id",ignoreDuplicates:true});if(error)console.warn("WRLDLINE library sync:",error.message);else rows.forEach(row=>state.pendingLocalSaved.delete(row.article_id));}
 await loadCloudSaved(false);
}
async function loadFollows(){
 if(!state.db||!state.user)return;
 const {data,error}=await state.db.from("user_follows").select("target_type,target_value").eq("user_id",state.user.id);
 if(error){console.warn("WRLDLINE follows:",error.message);return;}
 state.follows={category:(data||[]).filter(x=>x.target_type==="category").map(x=>x.target_value),country:(data||[]).filter(x=>x.target_type==="country").map(x=>x.target_value)};
 renderFollowPanel();if(state.followOnly)applyFilters();
}
async function toggleFollow(type,value){
 if(!state.user||!["category","country"].includes(type))return;
 const exists=state.follows[type].includes(value);
 const result=exists?await state.db.from("user_follows").delete().eq("user_id",state.user.id).eq("target_type",type).eq("target_value",value):await state.db.from("user_follows").insert({user_id:state.user.id,target_type:type,target_value:value});
 if(result.error){showToast("تعذر حفظ المتابعة: "+result.error.message);return;}
 state.follows[type]=exists?state.follows[type].filter(x=>x!==value):[...state.follows[type],value];
 renderFollowPanel();if(state.followOnly)applyFilters();showToast(exists?"تم إلغاء المتابعة":"تمت إضافة المتابعة");
}
function selectCategory(cat){state.category=cat;state.limit=PAGE_SIZE;document.querySelectorAll(".nav-link,.chip").forEach(el=>el.classList.toggle("active",el.dataset.category===cat));document.getElementById("feedTitle").textContent=cat==="all"?"أحدث الأخبار":CATEGORY_NAMES[cat]||"أحدث الأخبار";applyFilters();document.getElementById("mainNav").classList.remove("mobile-open");}
function applyFilters(){state.filtered=state.articles.filter(a=>(state.category==="all"||a.cat===state.category)&&(state.country==="all"||a.country===state.country)&&(!state.followOnly||([...state.follows.category,...state.follows.country].length>0&&(state.follows.category.includes(a.cat)||state.follows.country.includes(a.country)))));state.filtered.sort((a,b)=>state.sort==="oldest"?new Date(a.published_at)-new Date(b.published_at):new Date(b.published_at)-new Date(a.published_at));renderHero();renderFeed();}
function imageMarkup(article,cls=""){return article.img&&article.img!=="#" ? '<img class="'+cls+'" src="'+escapeHTML(article.img)+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">':'<div class="image-placeholder '+cls+'">WRLDLINE</div>';}
function renderHero(){const host=document.getElementById("heroLayout");if(!state.filtered.length){host.innerHTML='<div class="empty-state"><strong>لا توجد نتائج في هذا القسم</strong><p>جرّب تغيير الدولة أو اختيار قسم آخر.</p></div>';return;}const lead=state.filtered[0],others=state.filtered.slice(1,4);host.innerHTML='<article class="lead-story" data-open="'+escapeHTML(lead.id)+'">'+imageMarkup(lead,"lead-image")+'<div class="lead-overlay"><div class="story-meta"><span class="category-label">'+escapeHTML(CATEGORY_NAMES[lead.cat]||"عالم")+'</span>'+(lead.isBreaking?'<span class="breaking-badge">عاجل</span>':'')+'<span class="verification-badge">'+escapeHTML(verificationLabel(lead.verification))+'</span><span>'+escapeHTML(lead.country)+'</span></div><h2>'+escapeHTML(lead.title)+'</h2><p>'+escapeHTML(lead.summary)+'</p><div class="story-byline">'+escapeHTML(lead.src)+' · '+escapeHTML(timeAgo(lead.published_at))+'</div></div></article><div class="lead-rail">'+others.map(a=>'<article class="rail-story" data-open="'+escapeHTML(a.id)+'">'+imageMarkup(a,"rail-image")+'<div><div class="story-meta"><span class="category-label">'+escapeHTML(CATEGORY_NAMES[a.cat]||"عالم")+'</span><span>'+escapeHTML(timeAgo(a.published_at))+'</span></div><h3>'+escapeHTML(a.title)+'</h3><small>'+escapeHTML(a.src)+'</small></div></article>').join("")+'</div>';host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));}
function renderFeed(){const host=document.getElementById("newsGrid"),items=state.filtered.slice(0,state.limit);if(!items.length){host.innerHTML='<div class="empty-state">لا توجد أخبار مطابقة حالياً.</div>';}else host.innerHTML=items.slice(4).map(a=>'<article class="news-card"><button class="save-button '+(state.saved.has(a.id)?"saved":"")+'" data-save="'+escapeHTML(a.id)+'" aria-label="حفظ الخبر">'+(state.saved.has(a.id)?"★":"☆")+'</button><div class="card-open" data-open="'+escapeHTML(a.id)+'">'+imageMarkup(a,"card-image")+'<div class="card-content"><div class="story-meta"><span class="category-label">'+escapeHTML(CATEGORY_NAMES[a.cat]||"عالم")+'</span>'+(a.isBreaking?'<span class="breaking-badge">عاجل</span>':'')+'<span>'+escapeHTML(a.country)+'</span></div><h3>'+escapeHTML(a.title)+'</h3><p>'+escapeHTML(a.summary)+'</p><div class="card-byline"><span>'+escapeHTML(a.src)+'</span><time>'+escapeHTML(timeAgo(a.published_at))+'</time></div></div></div></article>').join("");host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));host.querySelectorAll("[data-save]").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();toggleSaved(el.dataset.save);}));document.getElementById("loadMoreButton").hidden=state.limit>=state.filtered.length;}
function verificationLabel(value){return ({confirmed:"مؤكد",multi:"متعدد المصادر",preliminary:"أولي",unconfirmed:"غير مؤكد"})[value]||"أولي";}
function updateBreaking(){
 const telegram=state.telegramTicker[0];
 const item=telegram||state.articles.find(a=>a.isBreaking)||state.articles[0];
 const title=document.getElementById("breakingText");
 title.textContent=item?item.title:"لا توجد أخبار عاجلة متاحة حالياً";
 title.title=telegram?"مصدر تيليجرام · شريط العاجل فقط":"آخر تحديث إخباري";
 document.getElementById("breakingTime").textContent=item?(telegram?"تيليجرام · "+timeAgo(item.received_at||item.published_at):(item.isBreaking?"عاجل · ":"")+timeAgo(item.published_at)):"LIVE";
}
function openArticle(id,updateUrl=true){const a=state.articles.find(x=>x.id===id);if(!a)return;if(updateUrl){const url=new URL(location.href);url.searchParams.set("article",id);history.pushState({article:id},"",url);}const host=document.getElementById("modalContent");host.innerHTML='<button class="modal-close" id="modalClose" aria-label="إغلاق">×</button>'+imageMarkup(a,"modal-image")+'<div class="modal-article-body"><div class="story-meta"><span class="category-label">'+escapeHTML(CATEGORY_NAMES[a.cat]||"عالم")+'</span><span class="verification-badge">'+escapeHTML(verificationLabel(a.verification))+'</span><span>'+escapeHTML(a.country)+'</span><time>'+escapeHTML(formatDate(a.published_at))+'</time></div><h1>'+escapeHTML(a.title)+'</h1><p class="modal-summary">'+escapeHTML(a.summary)+'</p><div class="source-box"><span>المصدر</span><strong>'+escapeHTML(a.src)+'</strong><a href="'+escapeHTML(a.sourceURL)+'" target="_blank" rel="noopener noreferrer">قراءة الخبر لدى المصدر الأصلي ↗</a></div><p class="disclaimer">يعرض ورلدلاين البيانات المتاحة من المصدر. قد تكون تفاصيل الخبر الكاملة أو تحديثاته منشورة في الموقع الأصلي.</p><div class="article-actions"><button class="outline-button" id="modalSave">'+(state.saved.has(a.id)?"★ إزالة من المحفوظات":"☆ حفظ الخبر")+'</button><button class="outline-button" id="modalShare" type="button">مشاركة الخبر ↗</button></div></div>';document.getElementById("modalClose").addEventListener("click",closeArticle);document.getElementById("modalSave").addEventListener("click",()=>{toggleSaved(a.id);document.getElementById("modalSave").textContent=state.saved.has(a.id)?"★ إزالة من المحفوظات":"☆ حفظ الخبر";});document.getElementById("modalShare").addEventListener("click",()=>shareArticle(a));showModal("articleModal");}
function closeArticle(updateUrl=true){hideModal("articleModal");if(updateUrl&&new URLSearchParams(location.search).has("article")){const url=new URL(location.href);url.searchParams.delete("article");history.replaceState(null,"",url);}}
async function shareArticle(article){const url=new URL("/",location.origin);url.searchParams.set("article",article.id);const data={title:article.title,text:article.summary||"خبر من WRLDLINE NEWS",url:url.href};try{if(navigator.share){await navigator.share(data);return;}if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url.href);showToast("تم نسخ رابط الخبر");return;}showToast("المشاركة غير مدعومة في هذا المتصفح");}catch(error){if(error?.name!=="AbortError")showToast("تعذرت مشاركة الخبر حالياً");}}
async function toggleSaved(id){
 const wasSaved=state.saved.has(id);
 if(state.user&&state.db){
  const result=wasSaved?await state.db.from("user_saved_articles").delete().eq("user_id",state.user.id).eq("article_id",id):await state.db.from("user_saved_articles").upsert({user_id:state.user.id,article_id:id},{onConflict:"user_id,article_id"});
  if(result.error){showToast("تعذر مزامنة المكتبة: "+result.error.message);return;}
 }
 wasSaved?state.saved.delete(id):state.saved.add(id);if(!state.user){wasSaved?state.pendingLocalSaved.delete(id):state.pendingLocalSaved.add(id);}persistSaved();renderFeed();
 showToast(wasSaved?"أُزيل الخبر من مكتبتك":"أُضيف الخبر إلى مكتبتك");
}
async async function showSaved(){
 let list=state.articles.filter(a=>state.saved.has(a.id));
 if(state.user&&state.db){
  const {data,error}=await state.db.from("user_saved_articles").select("article_id, article:articles(*, article_translations(*))").eq("user_id",state.user.id).order("created_at",{ascending:false});
  if(!error){list=(data||[]).map(row=>row.article).filter(Boolean).map(normalizeArticle);for(const a of list)if(!state.articles.some(x=>x.id===a.id))state.articles.push(a);}
  else showToast("تعذر تحميل المكتبة المتزامنة حالياً");
 }
 const host=document.getElementById("modalContent");host.innerHTML='<button class="modal-close" id="modalClose" aria-label="إغلاق">×</button><div class="modal-article-body saved-view"><span class="section-kicker">مكتبتك الشخصية</span><h2>الأخبار المحفوظة</h2><p class="muted">'+(state.user?"مزامنة مع حسابك على جميع أجهزتك":"محفوظات هذا الجهاز فقط — سجّل الدخول للمزامنة")+'</p>'+(list.length?list.map(a=>'<button class="saved-row" data-open="'+escapeHTML(a.id)+'"><strong>'+escapeHTML(a.title)+'</strong><small>'+escapeHTML(a.src)+' · '+escapeHTML(timeAgo(a.published_at))+'</small></button>').join(""):'<p class="muted">لم تحفظ أي خبر بعد.</p>')+'</div>';document.getElementById("modalClose").addEventListener("click",closeArticle);host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));showModal("articleModal");}
function showModal(id){const el=document.getElementById(id);el.classList.add("visible");el.setAttribute("aria-hidden","false");document.body.classList.add("modal-open");}
function hideModal(id){const el=document.getElementById(id);el.classList.remove("visible");el.setAttribute("aria-hidden","true");document.body.classList.remove("modal-open");}
function openSearch(){showModal("searchOverlay");document.getElementById("searchInput").focus();}
function closeSearch(){hideModal("searchOverlay");}
function renderSearch(){const q=state.query,host=document.getElementById("searchResults");if(!q){host.innerHTML='<p class="muted">اكتب كلمة للبدء.</p>';return;}const results=state.articles.filter(a=>(a.title+" "+a.summary+" "+a.country+" "+a.src).toLocaleLowerCase().includes(q)).slice(0,30);host.innerHTML=results.length?results.map(a=>'<button class="search-result" data-open="'+escapeHTML(a.id)+'"><strong>'+escapeHTML(a.title)+'</strong><small>'+escapeHTML(a.src)+' · '+escapeHTML(a.country)+'</small></button>').join(""):'<p class="muted">لا توجد نتائج مطابقة.</p>';host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>{closeSearch();openArticle(el.dataset.open);}));}
function showToast(message){const el=document.getElementById("toast");el.textContent=message;el.classList.add("visible");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.classList.remove("visible"),2300);}
