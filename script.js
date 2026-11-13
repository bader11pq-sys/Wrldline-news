/* WRLDLINE NEWS — editorial frontend */
const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
const PAGE_SIZE = 24;
const CATEGORY_NAMES = { ar:{politics:"سياسة",economy:"اقتصاد",security:"أمن ودفاع",tech:"تكنولوجيا",sports:"رياضة",culture:"ثقافة",health:"صحة",world:"حول العالم",uncategorized:"قيد التصنيف"}, en:{politics:"Politics",economy:"Economy",security:"Security & Defence",tech:"Technology",sports:"Sports",culture:"Culture",health:"Health",world:"Around the world",uncategorized:"Pending classification"} };
function categoryName(value){return CATEGORY_NAMES[state.lang]?.[value]||value||(state.lang==="ar"?"حول العالم":"Around the world");}
function ui(ar,en){return state.lang==="ar"?ar:en;}
function countryName(value,code){const iso3={SAU:"SA",EGY:"EG",CHN:"CN",ARE:"AE",QAT:"QA",KWT:"KW",BHR:"BH",OMN:"OM",YEM:"YE",JOR:"JO",LBN:"LB",PSE:"PS",SYR:"SY",IRQ:"IQ",MAR:"MA",DZA:"DZ",TUN:"TN",LBY:"LY",SDN:"SD",USA:"US",GBR:"GB",FRA:"FR",DEU:"DE",RUS:"RU",UKR:"UA",IRN:"IR",TUR:"TR",IND:"IN",JPN:"JP",KOR:"KR",PRK:"KP",PAK:"PK",AFG:"AF",ISR:"IL",ETH:"ET",SOM:"SO",KEN:"KE",NGA:"NG",ZAF:"ZA",CAN:"CA",MEX:"MX",BRA:"BR",ARG:"AR",AUS:"AU",NZL:"NZ",ESP:"ES",ITA:"IT",POL:"PL",NLD:"NL",SWE:"SE",NOR:"NO",FIN:"FI",GRC:"GR",CHE:"CH",AUT:"AT",BEL:"BE",CZE:"CZ",HUN:"HU",ROU:"RO",BGR:"BG",SRB:"RS",HRV:"HR",THA:"TH",VNM:"VN",IDN:"ID",MYS:"MY",SGP:"SG",PHL:"PH",TWN:"TW",HKG:"HK",MNG:"MN",KAZ:"KZ",UZB:"UZ",KHM:"KH",LAO:"LA",MMR:"MM",BGD:"BD",NPL:"NP",LKA:"LK",COL:"CO",CHL:"CL",PER:"PE",VEN:"VE",CUB:"CU",DOM:"DO",HTI:"HT",PAN:"PA",CRI:"CR",IRL:"IE",PRT:"PT",DNK:"DK",ISL:"IS",CYP:"CY"};if(state.lang!=="en")return value;if(code&&iso3[String(code).toUpperCase()]){try{return new Intl.DisplayNames(["en"],{type:"region"}).of(iso3[String(code).toUpperCase()]);}catch{}}const map={"دولي":"International","السعودية":"Saudi Arabia","المملكة العربية السعودية":"Saudi Arabia","الإمارات":"United Arab Emirates","الإمارات العربية المتحدة":"United Arab Emirates","قطر":"Qatar","الكويت":"Kuwait","البحرين":"Bahrain","عمان":"Oman","اليمن":"Yemen","مصر":"Egypt","الأردن":"Jordan","لبنان":"Lebanon","فلسطين":"Palestine","سوريا":"Syria","العراق":"Iraq","المغرب":"Morocco","الجزائر":"Algeria","تونس":"Tunisia","ليبيا":"Libya","السودان":"Sudan","الصين":"China","الولايات المتحدة":"United States","بريطانيا":"United Kingdom","فرنسا":"France","روسيا":"Russia","أوكرانيا":"Ukraine","إيران":"Iran","تركيا":"Türkiye","الهند":"India","اليابان":"Japan"};return map[value]||value;}
function riskLabel(value){const labels={ar:{critical:"حرج",high:"مرتفع",elevated:"متصاعد",guarded:"مراقبة",low:"منخفض",unknown:"غير محدد"},en:{critical:"Critical",high:"High",elevated:"Elevated",guarded:"Guarded",low:"Low",unknown:"Unknown"}};return labels[state.lang]?.[value]||labels[state.lang].unknown;}
function translationBadge(a){return ui("الترجمة قيد الإعداد","Translation being prepared");}
const state = { articles:[], filtered:[], category:"all", country:"all", lang:localStorage.getItem("wrldline:language")==="en"?"en":"ar", limit:PAGE_SIZE, saved:new Set(readSaved()), query:"", sort:"newest", loading:false, db:null, user:null, follows:{category:[],country:[]}, followOnly:false, realtime:null,  pendingLocalSaved:new Set(readSaved()), breakingTickerIndex:0, breakingTickerCurrentId:null, refetchAfterCurrent:false,lastFetchAt:0 };

document.addEventListener("DOMContentLoaded", () => {
  initPreferences(); bindEvents(); updateClock(); fetchNews(); initPersonalization(); setInterval(()=>{if(!document.hidden&&Date.now()-state.lastFetchAt>=90000)fetchNews();},30000); setInterval(updateBreaking, 15000);
  registerServiceWorker(); setupAppInstall();
});

async function registerServiceWorker(){
 if(!("serviceWorker" in navigator))return;
 const workerBuild="v27";
 navigator.serviceWorker.addEventListener("controllerchange",()=>{
  if(sessionStorage.getItem("wrldline:sw-build")!==workerBuild){
   sessionStorage.setItem("wrldline:sw-build",workerBuild);
   location.reload();
  }
 });
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
 const button=document.createElement("button");button.type="button";button.className="tool-button";button.textContent=ui("تثبيت التطبيق","Install app");button.hidden=true;button.setAttribute("aria-label",ui("تثبيت WRLDLINE NEWS على الجهاز","Install WRLDLINE NEWS on this device"));
 host.insertBefore(button,host.firstChild);
 window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;button.hidden=false;});
 button.addEventListener("click",async()=>{
  if(!installPrompt)return;
  button.disabled=true;
  try{await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;button.hidden=true;}
  catch(error){console.warn("WRLDLINE install prompt:",error);}
  finally{button.disabled=false;}
 });
 window.addEventListener("appinstalled",()=>{installPrompt=null;button.hidden=true;showToast(ui("تم تثبيت WRLDLINE NEWS على جهازك.","WRLDLINE NEWS has been installed."));});
}

function readSaved(){ try{return JSON.parse(localStorage.getItem("wrldline:saved")||"[]");}catch{return [];} }
function persistSaved(){ localStorage.setItem("wrldline:saved",JSON.stringify([...state.saved])); }
function escapeHTML(value=""){ return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function safeURL(value){ try{const u=new URL(value);return ["http:","https:"].includes(u.protocol)?u.href:"#";}catch{return "#";} }
function formatDate(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return ui("وقت غير محدد","Time unavailable");const locale=state.lang==="ar"?"ar-SA-u-ca-gregory":"en-US-u-ca-gregory";return new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",calendar:"gregory"}).format(d);}
function timeAgo(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return "";const mins=Math.max(0,Math.floor((Date.now()-d)/60000));if(mins<1)return ui("الآن","Just now");if(mins<60)return ui("قبل "+mins+" د",mins+"m ago");const h=Math.floor(mins/60);if(h<24)return ui("قبل "+h+" س",h+"h ago");return formatDate(value);}
function updateClock(){const now=new Date();const locale=state.lang==="ar"?"ar-SA-u-ca-gregory":"en-US-u-ca-gregory";const label=document.getElementById("todayLabel");if(label){label.textContent=new Intl.DateTimeFormat(locale,{weekday:"long",year:"numeric",month:"long",day:"numeric",calendar:"gregory"}).format(now);label.dateTime=now.toISOString().slice(0,10);}const edition=document.getElementById("editionDate");if(edition)edition.textContent=new Intl.DateTimeFormat(locale,{dateStyle:"medium",calendar:"gregory"}).format(now);const year=document.getElementById("year");if(year)year.textContent=now.getFullYear();}
function initPreferences(){const theme=localStorage.getItem("wrldline:theme")||"light";document.documentElement.dataset.theme=theme;document.getElementById("themeButton").textContent=theme==="dark"?"☀":"☾";}
function bindEvents(){
 document.getElementById("themeButton").addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;localStorage.setItem("wrldline:theme",next);document.getElementById("themeButton").textContent=next==="dark"?"☀":"☾";});
 document.getElementById("refreshButton").addEventListener("click",()=>fetchNews(true));
 document.getElementById("dockSaved").addEventListener("click",showSaved);
 document.getElementById("dockSearch").addEventListener("click",openSearch);
 document.getElementById("backToTop").addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));
 window.addEventListener("scroll",()=>document.getElementById("backToTop").classList.toggle("visible",window.scrollY>650),{passive:true});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&Date.now()-state.lastFetchAt>=90000)fetchNews();});

 document.addEventListener("wrldline:language",event=>{state.lang=event.detail.lang;updateClock();fetchNews();});
 document.getElementById("menuButton").addEventListener("click",()=>{const nav=document.getElementById("mainNav");const open=nav.classList.toggle("mobile-open");document.getElementById("menuButton").setAttribute("aria-expanded",String(open));if(open)nav.querySelector("a")?.focus();});
 document.getElementById("mainNav").addEventListener("click",e=>{if(!e.target.closest("a"))return;document.getElementById("mainNav").classList.remove("mobile-open");document.getElementById("menuButton").setAttribute("aria-expanded","false");});
 document.addEventListener("click",e=>{const nav=document.getElementById("mainNav"),menu=document.getElementById("menuButton");if(nav.classList.contains("mobile-open")&&!nav.contains(e.target)&&!menu.contains(e.target)){nav.classList.remove("mobile-open");menu.setAttribute("aria-expanded","false");}});
 document.getElementById("searchButton").addEventListener("click",openSearch);document.getElementById("closeSearch").addEventListener("click",closeSearch);
 document.getElementById("searchInput").addEventListener("input",e=>{state.query=e.target.value.trim().toLocaleLowerCase();renderSearch();});
 document.getElementById("countryFilter").addEventListener("change",e=>{state.country=e.target.value;state.limit=PAGE_SIZE;applyFilters();});
 document.getElementById("sortFilter").addEventListener("change",e=>{state.sort=e.target.value;applyFilters();});
 document.getElementById("loadMoreButton").addEventListener("click",()=>{state.limit+=PAGE_SIZE;renderFeed();});
 document.getElementById("followFeedButton").addEventListener("click",()=>{if(!state.user){showToast("سجّل الدخول أولاً لحفظ ومزامنة متابعاتك.");return;}state.followOnly=!state.followOnly;document.getElementById("followFeedButton").classList.toggle("active",state.followOnly);document.getElementById("followFeedButton").setAttribute("aria-pressed",String(state.followOnly));applyFilters();});
 document.getElementById("followOptions").addEventListener("click",e=>{const b=e.target.closest("[data-follow-type]");if(b)toggleFollow(b.dataset.followType,b.dataset.followValue);});
 document.getElementById("coveragePulseGrid").addEventListener("click",e=>{const b=e.target.closest("[data-pulse-category]");if(b)selectCategory(b.dataset.pulseCategory);});
 document.getElementById("savedButton").addEventListener("click",showSaved);document.getElementById("openSaved").addEventListener("click",showSaved);
 document.querySelectorAll("[data-category]").forEach(el=>el.addEventListener("click",e=>{e.preventDefault();selectCategory(el.dataset.category);}));
 document.getElementById("articleModal").addEventListener("click",e=>{if(e.target.id==="articleModal")closeArticle();});
 document.getElementById("searchOverlay").addEventListener("click",e=>{if(e.target.id==="searchOverlay")closeSearch();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeArticle();closeSearch();const nav=document.getElementById("mainNav");nav.classList.remove("mobile-open");document.getElementById("menuButton").setAttribute("aria-expanded","false");}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openSearch();}});
 document.addEventListener("keydown",e=>{if(e.key!=="Enter"&&e.key!==" ")return;const el=e.target.closest?.("[data-open][role=button]");if(!el)return;e.preventDefault();openArticle(el.dataset.open);});

 window.addEventListener("popstate",()=>{if(!new URLSearchParams(location.search).has("article"))closeArticle(false);});
}
async function fetchNews(manual=false){
 if(state.loading){state.refetchAfterCurrent=true;return;}state.loading=true;const refresh=document.getElementById("refreshButton");if(refresh){refresh.disabled=true;refresh.classList.add("is-loading");refresh.setAttribute("aria-busy","true");}document.getElementById("connectionLabel").textContent=ui("جارٍ تحديث الأخبار","Updating newsroom");document.getElementById("newsStatus")?.classList.add("is-updating");
 try{
  const headers={apikey:SUPABASE_ANON_KEY,Authorization:"Bearer "+SUPABASE_ANON_KEY};
  const res=await fetch(SUPABASE_URL+"/rest/v1/articles?select=id,title,summary,category,country,source_name,url,source_url,published_at,received_at,lang,media_type,image_url,is_breaking,editorial_status,ai_country_code,ai_summary,ai_risk_level,ai_risk_score,ai_confidence,article_translations(lang,title,summary,ai_summary)&editorial_status=eq.published&order=published_at.desc&limit=1000",{headers,signal:AbortSignal.timeout(18000)});
  if(!res.ok)throw new Error(ui("تعذر جلب الأخبار ("+res.status+")","Could not fetch stories ("+res.status+")"));
  const rows=await res.json();if(!Array.isArray(rows))throw new Error(ui("استجابة الأخبار غير صالحة","Invalid news response"));
  state.lastFetchAt=Date.now();state.articles=rows.map(normalizeArticle).filter(a=>a.title&&(!isTelegramArticle(a.raw)||(a.isBreaking===true&&isDedicatedBreakingSource(a.src)))).sort((a,b)=>new Date(b.published_at)-new Date(a.published_at));
  populateCountries();applyFilters();renderCoveragePulse();updateBreaking();if(state.user)syncLocalSavedToCloud();const linkedId=new URLSearchParams(location.search).get("article");if(linkedId)openArticle(linkedId,false);document.getElementById("lastUpdated").textContent=ui("آخر تحديث: ","Last updated: ")+formatDate(new Date());document.getElementById("connectionLabel").textContent=ui("الأخبار محدثة","News updated");document.getElementById("newsStatus")?.classList.remove("is-updating","is-error");if(manual)showToast(ui("تم تحديث الأخبار","News updated"));
 }catch(err){console.error("WRLDLINE fetch:",err);document.getElementById("connectionLabel").textContent=ui("تعذر الاتصال بمصدر الأخبار","News connection unavailable");document.getElementById("newsStatus")?.classList.remove("is-updating");document.getElementById("newsStatus")?.classList.add("is-error");if(manual)showToast(ui("تعذر تحديث الأخبار. تحقق من الاتصال وحاول مجددًا.","Could not refresh news. Check your connection and try again."));if(!state.articles.length){document.getElementById("heroLayout").innerHTML='<div class="empty-state"><strong>لم نتمكن من تحميل الأخبار</strong><p>تحقق من الاتصال وحاول التحديث بعد قليل.</p><button class="outline-button" onclick="fetchNews()">إعادة المحاولة</button></div>';document.getElementById("newsGrid").innerHTML="";}}
 finally{state.loading=false;if(refresh){refresh.disabled=false;refresh.classList.remove("is-loading");refresh.removeAttribute("aria-busy");}if(state.refetchAfterCurrent){state.refetchAfterCurrent=false;queueMicrotask(fetchNews);}}
}
function isTelegramArticle(a){return /t\.me|telegram\.me|telegram/i.test([a?.url,a?.source_url,a?.source_name].filter(Boolean).join(" "));}
function normalizeArticle(a){
 const sourceTitle=String(a.title||"");
 const titleIsArabic=/[\u0600-\u06FF]/.test(sourceTitle);
 const declaredLang=String(a.lang||"").toLowerCase();
 const sourceLang=declaredLang.startsWith("ar")?"ar":(declaredLang.startsWith("en")?"en":(titleIsArabic?"ar":"en"));
 const translation=(a.article_translations||[]).find(t=>t.lang===state.lang&&t.title&&t.summary);
 const translationPending=sourceLang!==state.lang&&!translation;
 const sameLanguage=sourceLang===state.lang;
 const title=translation?.title||sourceTitle;
 const summary=translation?.summary||(a.summary||ui("النص الأصلي متاح مؤقتاً إلى حين اكتمال الترجمة.","The original text is shown while translation is being prepared."));
 return {translationPending,id:String(a.id),title,summary,mediaType:a.media_type==="video"?"video":"image",img:safeURL(a.image_url||""),cat:CATEGORY_NAMES.ar[a.category]?a.category:"world",country:a.country||"دولي",aiCountryCode:a.ai_country_code||null,src:a.source_name||ui("مصدر إخباري","News source"),sourceURL:safeURL(a.url||a.source_url||""),published_at:a.published_at||a.received_at||"",lang:sourceLang,isBreaking:!!a.is_breaking,editorialStatus:a.editorial_status||"published",aiSummary:translation?.ai_summary||(sameLanguage?a.ai_summary||"":""),aiRiskLevel:a.ai_risk_level||"unknown",aiRiskScore:a.ai_risk_score||0,aiConfidence:a.ai_confidence||null,raw:a};
}
function populateCountries(){const select=document.getElementById("countryFilter"),previous=state.country;const countries=[...new Set([...state.articles.map(a=>a.country).filter(c=>c&&c!=="دولي"),...state.follows.country])].sort((a,b)=>a.localeCompare(b,state.lang));select.innerHTML='<option value="all">'+ui("كل الدول","All countries")+'</option>'+countries.map(c=>'<option value="'+escapeHTML(c)+'">'+escapeHTML(countryName(c,state.articles.find(a=>a.country===c)?.aiCountryCode))+'</option>').join("");select.value=countries.includes(previous)?previous:"all";if(select.value==="all")state.country="all";renderFollowPanel();}
function renderFollowPanel(){
 const host=document.getElementById("followOptions"),hint=document.getElementById("followHint");if(!host||!hint)return;
 if(!state.user){hint.textContent=ui("سجّل الدخول لتحفظ اختياراتك وتزامنها مع حسابك على كل أجهزتك.","Sign in to save your preferences and sync them across devices.");host.innerHTML='<a class="outline-button" href="account.html">'+ui("تسجيل الدخول أو إنشاء حساب","Sign in or create an account")+"</a>";return;}
 hint.textContent=ui("اختر ما تريد متابعته؛ ستظهر أخباره في موجز متابعاتي.","Choose what to follow; related stories will appear in your personal feed.");
 const cats=Object.keys(CATEGORY_NAMES.ar).map(value=>({type:"category",value,label:categoryName(value)}));
 const countries=[...new Set(state.articles.map(a=>a.country).filter(c=>c&&c!=="دولي"))].sort((a,b)=>a.localeCompare(b,"ar")).map(value=>({type:"country",value,label:countryName(value,state.articles.find(a=>a.country===value)?.aiCountryCode)}));
 const make=(item)=>'<button type="button" class="follow-chip '+(state.follows[item.type].includes(item.value)?"selected":"")+'" data-follow-type="'+item.type+'" data-follow-value="'+escapeHTML(item.value)+'" aria-pressed="'+String(state.follows[item.type].includes(item.value))+'">'+escapeHTML(item.label)+(state.follows[item.type].includes(item.value)?" ✓":" +")+'</button>';
 host.innerHTML='<div class="follow-group"><strong>'+ui("الأقسام","Sections")+'</strong><div class="follow-chip-list">'+cats.map(make).join("")+'</div></div><div class="follow-group"><strong>'+ui("الدول","Countries")+'</strong><div class="follow-chip-list">'+(countries.length?countries.map(make).join(""):'<span class="muted">تظهر الدول بعد وصول أخبارها.</span>')+'</div></div>';
}
async function initPersonalization(){
 if(!window.supabase?.createClient)return;
 state.db=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  initNewsRealtime();
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
 if(result.error){showToast(ui("تعذر حفظ المتابعة: ","Could not save follow: ")+result.error.message);return;}
 state.follows[type]=exists?state.follows[type].filter(x=>x!==value):[...state.follows[type],value];
 renderFollowPanel();if(state.followOnly)applyFilters();showToast(exists?ui("تم إلغاء المتابعة","Unfollowed"):ui("تمت إضافة المتابعة","Added to following"));
}
function selectCategory(cat){state.category=cat;state.limit=PAGE_SIZE;document.querySelectorAll(".nav-link,.chip").forEach(el=>el.classList.toggle("active",el.dataset.category===cat));document.getElementById("feedTitle").textContent=cat==="all"?ui("أحدث الأخبار","Latest news"):categoryName(cat);applyFilters();document.getElementById("mainNav").classList.remove("mobile-open");document.getElementById("menuButton").setAttribute("aria-expanded","false");}
function applyFilters(){state.filtered=state.articles.filter(a=>(state.category==="all"||a.cat===state.category)&&(state.country==="all"||a.country===state.country)&&(!state.followOnly||([...state.follows.category,...state.follows.country].length>0&&(state.follows.category.includes(a.cat)||state.follows.country.includes(a.country)))));state.filtered.sort((a,b)=>state.sort==="oldest"?new Date(a.published_at)-new Date(b.published_at):new Date(b.published_at)-new Date(a.published_at));renderHero();renderFeed();renderCoveragePulse();}
function renderCoveragePulse(){
 const host=document.getElementById("coveragePulseGrid");if(!host)return;
 const since=Date.now()-24*60*60*1000;
 const recent=state.articles.filter(a=>{const t=Date.parse(a.published_at||"");return Number.isFinite(t)&&t<=Date.now()&&t>=since;});
 const counts=new Map();recent.forEach(a=>counts.set(a.cat,(counts.get(a.cat)||0)+1));
 const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);
 const total=recent.length;
 if(!ranked.length){host.innerHTML='<div class="coverage-empty">'+ui("لا توجد بيانات كافية لعرض نبض التغطية بعد.","Not enough recent data to show coverage signals yet.")+'</div>';return;}
 host.innerHTML='<div class="coverage-total"><strong>'+total+'</strong><span>'+ui("خبرًا خلال 24 ساعة","stories in 24 hours")+'</span><small>'+ui("من الأخبار المنشورة في غرفة الأخبار","Published in the newsroom")+'</small></div>'+ranked.map(([cat,count],i)=>'<button type="button" class="coverage-topic" data-pulse-category="'+escapeHTML(cat)+'"><span class="coverage-rank">0'+(i+1)+'</span><span class="coverage-topic-name">'+escapeHTML(categoryName(cat))+'</span><strong>'+count+'</strong><small>'+ui("خبر","stories")+'</small><span class="coverage-bar"><i style="width:'+Math.max(8,Math.round(count/Math.max(1,ranked[0][1])*100))+'%"></i></span></button>').join("");
}

function imageMarkup(article,cls=""){
 if(!article.img||article.img==="#")return '<div class="image-placeholder '+cls+'">WRLDLINE</div>';
 if(article.mediaType==="video")return '<video class="'+cls+'" src="'+escapeHTML(article.img)+'" muted playsinline preload="metadata"></video>';
 return '<img class="'+cls+'" src="'+escapeHTML(article.img)+'" alt="" loading="lazy" referrerpolicy="no-referrer">';
}
function articleMediaMarkup(article){
 if(!article.img||article.img==="#")return "";
 if(article.mediaType==="video")return '<video class="modal-image" src="'+escapeHTML(article.img)+'" controls playsinline preload="metadata"></video>';
 return imageMarkup(article,"modal-image");
}
function renderHero(){const host=document.getElementById("heroLayout");if(!state.filtered.length){host.innerHTML='<div class="empty-state"><strong>'+ui("لا توجد نتائج في هذا القسم","No stories in this section")+'</strong><p>'+ui("جرّب تغيير الدولة أو اختيار قسم آخر.","Try changing the country or selecting another section.")+'</p></div>';return;}const lead=state.filtered[0],others=state.filtered.slice(1,4);host.innerHTML='<article class="lead-story" role="button" tabindex="0" data-open="'+escapeHTML(lead.id)+'">'+imageMarkup(lead,"lead-image")+'<div class="lead-overlay"><div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(lead.cat))+'</span>'+(lead.isBreaking?'<span class="breaking-badge">عاجل</span>':'')+''+(lead.translationPending?'<span class="translation-badge">'+escapeHTML(translationBadge(lead))+'</span>':'')+'<span>'+escapeHTML(countryName(lead.country,lead.aiCountryCode))+'</span></div><h2>'+escapeHTML(lead.title)+'</h2><p>'+escapeHTML(lead.summary)+'</p><div class="story-byline">'+escapeHTML(lead.src)+' · '+escapeHTML(timeAgo(lead.published_at))+'</div></div></article><div class="lead-rail">'+others.map(a=>'<article class="rail-story" role="button" tabindex="0" data-open="'+escapeHTML(a.id)+'">'+imageMarkup(a,"rail-image")+'<div><div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(a.cat))+'</span>'+(a.translationPending?'<span class="translation-badge">'+escapeHTML(translationBadge(a))+'</span>':'')+'<span>'+escapeHTML(timeAgo(a.published_at))+'</span></div><h3>'+escapeHTML(a.title)+'</h3><small>'+escapeHTML(a.src)+'</small></div></article>').join("")+'</div>';host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));}
function renderFeed(){const host=document.getElementById("newsGrid"),items=state.filtered.slice(0,state.limit);if(!items.length){host.innerHTML='<div class="empty-state">'+ui("لا توجد أخبار مطابقة حالياً.","No matching stories right now.")+'</div>';}else host.innerHTML=items.slice(4).map(a=>'<article class="news-card"><button class="save-button '+(state.saved.has(a.id)?"saved":"")+'" data-save="'+escapeHTML(a.id)+'" aria-label="'+(state.saved.has(a.id)?ui("إزالة من المحفوظات","Remove from saved"):ui("حفظ الخبر","Save story"))+'">'+(state.saved.has(a.id)?"★":"☆")+'</button><div class="card-open" role="button" tabindex="0" data-open="'+escapeHTML(a.id)+'">'+imageMarkup(a,"card-image")+'<div class="card-content"><div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(a.cat))+'</span>'+(a.isBreaking?'<span class="breaking-badge">'+ui("عاجل","Breaking")+'</span>':'')+''+(a.translationPending?'<span class="translation-badge">'+escapeHTML(translationBadge(a))+'</span>':'')+'<span>'+escapeHTML(countryName(a.country,a.aiCountryCode))+'</span></div><h3>'+escapeHTML(a.title)+'</h3><p>'+escapeHTML(a.summary)+'</p><div class="card-byline"><span>'+escapeHTML(a.src)+'</span><time>'+escapeHTML(timeAgo(a.published_at))+'</time></div></div></div></article>').join("");host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));host.querySelectorAll("[data-save]").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();toggleSaved(el.dataset.save);}));document.getElementById("loadMoreButton").hidden=state.limit>=state.filtered.length;}
function initNewsRealtime(){
  if(!state.db||state.newsChannel)return;
  let refreshTimer=null;
  state.newsChannel=state.db.channel("wrldline-public-news")
   .on("postgres_changes",{event:"INSERT",schema:"public",table:"articles",filter:"editorial_status=eq.published"},()=>{
    if(refreshTimer)clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>{refreshTimer=null;fetchNews();},1200);
   })
   .on("postgres_changes",{event:"*",schema:"public",table:"article_translations"},()=>{
    if(refreshTimer)clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>{refreshTimer=null;fetchNews();},1800);
   }).subscribe();
 }
function isDedicatedBreakingSource(name){
 const source=String(name||"").trim().toLocaleLowerCase();
 return /breaking desk|news alert|غرفة الأخبار العاجلة|مصادر العاجل/.test(source);
}
function breakingItems(){
 const now=Date.now(),maxAge=60*60*1000;
 return state.articles.filter(a=>{
  // is_breaking is the editorial signal; do not hide alerts merely because
  // their publisher label differs from the dedicated-ingestion naming scheme.
  if(a.isBreaking!==true)return false;
  const published=Date.parse(a.published_at||"");
  const age=now-published;
  return Number.isFinite(published)&&age>=-60*1000&&age<=maxAge;
 }).sort((a,b)=>new Date(a.published_at)-new Date(b.published_at));
}
function renderBreakingSection(){
 const host=document.getElementById("breakingNewsGrid");if(!host)return;
 const items=breakingItems();const count=document.getElementById("breakingCount");
 count.textContent=state.lang==="ar"?items.length+" أخبار عاجلة خلال آخر 60 دقيقة":items.length+" breaking stories in the last 60 minutes";
 if(!items.length){host.innerHTML='<div class="empty-state">'+ui("لا توجد أخبار عاجلة خلال آخر 60 دقيقة. ستظهر هنا التنبيهات الجديدة التي يحددها المحرر.","No breaking alerts in the last 60 minutes. New editor-selected alerts will appear here.")+'</div>';return;}
 host.innerHTML=items.slice(0,8).map(a=>'<article class="breaking-news-card" role="button" tabindex="0" data-open="'+escapeHTML(a.id)+'">'+imageMarkup(a,"breaking-news-image")+'<div class="breaking-news-copy"><div class="story-meta"><span class="breaking-badge">'+ui("عاجل","BREAKING")+'</span><span>'+escapeHTML(timeAgo(a.published_at))+'</span><span>'+escapeHTML(categoryName(a.cat))+'</span></div><h3>'+escapeHTML(a.title)+'</h3><p>'+escapeHTML(a.summary)+'</p><small>'+escapeHTML(a.src)+' · '+ui("اقرأ التفاصيل","Read story")+' ←</small></div></article>').join("");
 host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));
}
function rotateBreaking(){
 const items=breakingItems();
 if(!items.length){state.breakingTickerIndex=0;state.breakingTickerCurrentId=null;updateBreaking();return;}
 const currentIndex=items.findIndex(a=>a.id===state.breakingTickerCurrentId);
 state.breakingTickerIndex=currentIndex<0?0:(currentIndex+1)%items.length;
 state.breakingTickerCurrentId=items[state.breakingTickerIndex]?.id||items[0].id;
 updateBreaking();
}
function updateBreaking(){
 const items=breakingItems();renderBreakingSection();
 const strip=document.getElementById("breakingStrip"),title=document.getElementById("breakingText"),time=document.getElementById("breakingTime");
 const marquee=title.querySelector(".breaking-marquee")||title;
 if(!items.length){state.breakingTickerIndex=0;state.breakingTickerCurrentId=null;strip.hidden=true;marquee.textContent="";marquee.classList.remove("is-moving","is-ltr","is-rtl");delete marquee.dataset.articleId;delete marquee.dataset.articleTitle;title.removeAttribute("title");time.textContent="";return;}
 let item=items.find(a=>a.id===state.breakingTickerCurrentId);
 if(!item){state.breakingTickerIndex=0;item=items[0];state.breakingTickerCurrentId=item.id;}
 state.breakingTickerIndex=Math.max(0,items.findIndex(a=>a.id===item.id));strip.hidden=false;
 if(marquee.dataset.articleId!==item.id||marquee.dataset.articleTitle!==String(item.title||"")){
  const cleanTitle=String(item.title||"").replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,"").normalize("NFC").trim();
  const isRTL=/[\u0590-\u08FF]/.test(cleanTitle),direction=isRTL?"rtl":"ltr";
  marquee.textContent=cleanTitle;marquee.dataset.articleId=item.id;marquee.dataset.articleTitle=String(item.title||"");
  marquee.classList.remove("is-moving","is-ltr","is-rtl");title.setAttribute("dir",direction);title.style.direction=direction;title.style.textAlign="start";
  marquee.setAttribute("dir",direction);marquee.style.direction=direction;marquee.style.unicodeBidi="isolate";marquee.classList.add(isRTL?"is-rtl":"is-ltr");
  marquee.style.removeProperty("--breaking-duration");marquee.style.removeProperty("--breaking-start");
  requestAnimationFrame(()=>{const viewportWidth=title.clientWidth,distance=(viewportWidth*2)+marquee.scrollWidth;marquee.style.setProperty("--breaking-start",viewportWidth+"px");marquee.style.setProperty("--breaking-duration",Math.max(12,distance/55)+"s");marquee.classList.add("is-moving");});
  marquee.onanimationend=()=>{if(breakingItems().length>1)rotateBreaking();else{marquee.classList.remove("is-moving");requestAnimationFrame(()=>marquee.classList.add("is-moving"));}};
 }
 title.title=ui("تنبيه عاجل اختاره محرر WRLDLINE","Breaking alert selected by a WRLDLINE editor");time.textContent=ui("عاجل · ","Breaking · ")+timeAgo(item.published_at);
}
function openArticle(id,updateUrl=true){
 const a=state.articles.find(x=>x.id===id);if(!a)return;
 if(updateUrl){const url=new URL(location.href);url.searchParams.set("article",id);history.pushState({article:id},"",url);}
 const host=document.getElementById("modalContent");

 host.innerHTML='<button class="modal-close" id="modalClose" aria-label="'+ui("إغلاق","Close")+'">×</button>'+articleMediaMarkup(a)+'<div class="modal-article-body"><div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(a.cat))+'</span><span>'+escapeHTML(countryName(a.country,a.aiCountryCode))+'</span><time>'+escapeHTML(formatDate(a.published_at))+'</time></div><h1>'+escapeHTML(a.title)+'</h1><p class="modal-summary">'+escapeHTML(a.summary)+'</p>'+(a.aiSummary?'<section class="ai-insight"><strong>'+ui("تحليل WRLDLINE AI","WRLDLINE AI analysis")+'</strong><p>'+escapeHTML(a.aiSummary)+'</p><small>'+ui("مؤشر الحدث: ","Event risk: ")+escapeHTML(riskLabel(a.aiRiskLevel))+' · '+escapeHTML(a.aiRiskScore)+'/100</small></section>':'')+(a.src==="WRLDLINE NEWS"?'<div class="source-box"><span>'+ui("نوع المحتوى","Content type")+'</span><strong>WRLDLINE NEWS</strong><small>'+ui("مقال تحريري منشور من غرفة أخبار WRLDLINE.","Editorial article published by the WRLDLINE newsroom.")+'</small></div>':'<div class="source-box"><span>'+ui("المصدر الأصلي","Original source")+'</span><strong>'+escapeHTML(a.src)+'</strong><a href="'+escapeHTML(a.sourceURL)+'" target="_blank" rel="noopener noreferrer">'+ui("قراءة الخبر لدى المصدر الأصلي ↗","Read at original source ↗")+'</a></div>')+'<p class="disclaimer">'+ui("هذه ترجمة/خلاصة تحريرية للخبر وليست بديلاً عن النص الأصلي. قد تكون التفاصيل الكاملة أو التحديثات منشورة لدى المصدر.","This is an editorial translation/summary, not a replacement for the original report. Full details and updates may be available at the source.")+'</p><div class="article-actions"><button class="outline-button" id="modalListen" type="button">♫ '+ui("استمع للخبر","Listen to story")+'</button><button class="outline-button" id="modalShare" type="button">↗ '+ui("مشاركة الخبر","Share story")+'</button><button class="outline-button" id="modalSave">'+(state.saved.has(a.id)?ui("★ إزالة من المحفوظات","★ Remove saved"):ui("☆ حفظ الخبر","☆ Save story"))+'</button></div></div>';
 document.getElementById("modalClose").addEventListener("click",closeArticle);
 document.getElementById("modalSave").addEventListener("click",()=>{toggleSaved(a.id);document.getElementById("modalSave").textContent=state.saved.has(a.id)?ui("★ إزالة من المحفوظات","★ Remove saved"):ui("☆ حفظ الخبر","☆ Save story");});
 document.getElementById("modalShare").addEventListener("click",()=>shareArticle(a));
 document.getElementById("modalListen").addEventListener("click",()=>playArticleAudio(a));
showModal("articleModal");
}
let currentArticleAudioUrl = null;
async function playArticleAudio(article){
 const button=document.getElementById("modalListen");if(!button)return;
 if(!state.db){showToast(ui("خدمة الصوت تتطلب تسجيل الدخول أولاً.","Sign in to use article audio."));return;}
 const {data:{session}}=await state.db.auth.getSession();
 if(!session?.access_token){showToast(ui("سجّل الدخول للاستماع إلى الأخبار بصوت ElevenLabs.","Sign in to listen with ElevenLabs."));return;}
 const text=[article.title,article.summary,article.aiSummary].filter(Boolean).join(". ").slice(0,3200);
 const original=ui("♫ استمع للخبر","♫ Listen to story");
 button.disabled=true;button.textContent=ui("جارٍ إنشاء الصوت...","Generating audio...");
 const previous=button.parentElement.querySelector(".article-audio-player");if(previous)previous.remove();
 try{
  const response=await fetch(SUPABASE_URL+"/functions/v1/elevenlabs-tts",{
   method:"POST",
   headers:{apikey:SUPABASE_ANON_KEY,Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
   body:JSON.stringify({text,language:state.lang}),
   signal:AbortSignal.timeout(50000)
  });
  if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||("HTTP "+response.status));}
  const blob=await response.blob();if(!blob.type.includes("audio"))throw new Error(ui("استجابة الصوت غير صالحة.","Invalid audio response."));
  if(currentArticleAudioUrl)URL.revokeObjectURL(currentArticleAudioUrl);
  currentArticleAudioUrl=URL.createObjectURL(blob);
  const audio=document.createElement("audio");audio.className="article-audio-player";audio.controls=true;audio.preload="metadata";audio.src=currentArticleAudioUrl;
  button.insertAdjacentElement("afterend",audio);
  await audio.play().catch(()=>{});
 }catch(error){showToast(ui("تعذر إنشاء الصوت: ","Could not generate audio: ")+String(error.message||error));}
 finally{if(button.isConnected){button.disabled=false;button.textContent=original;}}
}
function closeArticle(updateUrl=true){hideModal("articleModal");if(updateUrl&&new URLSearchParams(location.search).has("article")){const url=new URL(location.href);url.searchParams.delete("article");history.replaceState(null,"",url);}}
async function shareArticle(article){if(window.WRLDLINE_SHARE){return window.WRLDLINE_SHARE.share({title:article.title,description:article.summary||article.aiSummary||"",category:categoryName(article.cat)+" · "+countryName(article.country,article.aiCountryCode),source:article.src,image:article.img||""});}showToast(ui("أداة المشاركة لم تجهز بعد. أعد المحاولة بعد لحظة.","Sharing is still loading. Please try again."));}
async function toggleSaved(id){
 const wasSaved=state.saved.has(id);
 if(state.user&&state.db){
  const result=wasSaved?await state.db.from("user_saved_articles").delete().eq("user_id",state.user.id).eq("article_id",id):await state.db.from("user_saved_articles").upsert({user_id:state.user.id,article_id:id},{onConflict:"user_id,article_id"});
  if(result.error){showToast("تعذر مزامنة المكتبة: "+result.error.message);return;}
 }
 wasSaved?state.saved.delete(id):state.saved.add(id);if(!state.user){wasSaved?state.pendingLocalSaved.delete(id):state.pendingLocalSaved.add(id);}persistSaved();renderFeed();
 showToast(wasSaved?"أُزيل الخبر من مكتبتك":"أُضيف الخبر إلى مكتبتك");
}
async function showSaved(){
 let list=state.articles.filter(a=>state.saved.has(a.id));
 if(state.user&&state.db){
  const {data,error}=await state.db.from("user_saved_articles").select("article_id, article:articles(id,title,summary,category,country,source_name,url,source_url,published_at,received_at,lang,media_type,image_url,is_breaking,editorial_status,ai_country_code,ai_summary,ai_risk_level,ai_risk_score,ai_confidence,article_translations(lang,title,summary,ai_summary))").eq("user_id",state.user.id).order("created_at",{ascending:false});
  if(!error){list=(data||[]).map(row=>row.article).filter(row=>row&&!isTelegramArticle(row)).map(normalizeArticle);for(const a of list)if(!state.articles.some(x=>x.id===a.id))state.articles.push(a);}
  else showToast("تعذر تحميل المكتبة المتزامنة حالياً");
 }
 const host=document.getElementById("modalContent");host.innerHTML='<button class="modal-close" id="modalClose" aria-label="إغلاق">×</button><div class="modal-article-body saved-view"><span class="section-kicker">مكتبتك الشخصية</span><h2>الأخبار المحفوظة</h2><p class="muted">'+(state.user?"مزامنة مع حسابك على جميع أجهزتك":"محفوظات هذا الجهاز فقط — سجّل الدخول للمزامنة")+'</p>'+(list.length?list.map(a=>'<div class="saved-row-wrap"><button class="saved-row" data-open="'+escapeHTML(a.id)+'"><strong>'+escapeHTML(a.title)+'</strong><small>'+escapeHTML(a.src)+' · '+escapeHTML(timeAgo(a.published_at))+'</small></button><button class="saved-remove" type="button" data-remove-saved="'+escapeHTML(a.id)+'">'+ui("إزالة","Remove")+'</button></div>').join(""):'<p class="muted">لم تحفظ أي خبر بعد.</p>')+'</div>';document.getElementById("modalClose").addEventListener("click",closeArticle);host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));host.querySelectorAll("[data-remove-saved]").forEach(el=>el.addEventListener("click",async()=>{await toggleSaved(el.dataset.removeSaved);await showSaved();}));showModal("articleModal");}
function showModal(id){const el=document.getElementById(id);el.classList.add("visible");el.setAttribute("aria-hidden","false");document.body.classList.add("modal-open");}
function hideModal(id){const el=document.getElementById(id);el.classList.remove("visible");el.setAttribute("aria-hidden","true");document.body.classList.remove("modal-open");}
function openSearch(){showModal("searchOverlay");document.getElementById("searchInput").focus();}
function closeSearch(){hideModal("searchOverlay");}
function renderSearch(){const q=state.query,host=document.getElementById("searchResults");if(!q){host.innerHTML='<p class="muted">'+ui("اكتب كلمة للبدء.","Type to begin.")+'</p>';return;}const results=state.articles.filter(a=>(a.title+" "+a.summary+" "+a.country+" "+a.src).toLocaleLowerCase().includes(q)).slice(0,30);host.innerHTML=results.length?results.map(a=>'<button class="search-result" data-open="'+escapeHTML(a.id)+'"><strong>'+escapeHTML(a.title)+'</strong><small>'+escapeHTML(a.src)+' · '+escapeHTML(a.country)+'</small></button>').join(""):'<p class="muted">'+ui("لا توجد نتائج مطابقة.","No matching results.")+'</p>';host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>{closeSearch();openArticle(el.dataset.open);}));}
function showToast(message){const el=document.getElementById("toast");el.textContent=message;el.classList.add("visible");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.classList.remove("visible"),2300);}
