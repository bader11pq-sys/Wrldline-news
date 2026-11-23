/* WRLDLINE NEWS — editorial frontend */
const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
// The custom API proxy currently rejects the POST used by the public RPC.
// Use Supabase directly so the homepage remains available while that proxy is repaired.
const WRLDLINE_PUBLIC_NEWS_API = SUPABASE_URL;
const PAGE_SIZE = 24;
// Keep public reads small: the RPC also builds published-translation JSON per row.
// Large parallel projections were saturating the Data API and leaving the homepage loading.
const MAIN_FEED_LIMIT = 24;
const SUPPLEMENTAL_FEED_LIMIT = 8;
const MAX_FEED_OFFSET = 240;
const PUBLIC_NEWS_RPC = WRLDLINE_PUBLIC_NEWS_API+"/rest/v1/rpc/public_home_news_recent_v3";
// Dedicated, index-backed feeds: asking the main RPC for breaking/exclusive-only
// rows forced a scan and intermittently hit the database statement timeout.
const BREAKING_FEED_RPC = WRLDLINE_PUBLIC_NEWS_API+"/rest/v1/rpc/public_breaking_feed";
const EXCLUSIVE_FEED_RPC = WRLDLINE_PUBLIC_NEWS_API+"/rest/v1/rpc/public_exclusive_feed";
const WRLDLINE_TAXONOMY = window.WRLDLINE_TAXONOMY || null;
const eventDesk = window.WLEventDesk;
const eventCatalog = eventDesk?.fromPage(document) || [];
const CATEGORY_NAMES = WRLDLINE_TAXONOMY?.CATEGORY_NAMES || { ar:{politics:"سياسة",economy:"اقتصاد",security:"أمن ودفاع",tech:"تكنولوجيا",sports:"رياضة",culture:"ثقافة",health:"صحة",science:"علوم",environment:"بيئة",society:"مجتمع",world:"حول العالم",uncategorized:"غير مصنف"}, en:{politics:"Politics",economy:"Economy",security:"Security & Defence",tech:"Technology",sports:"Sports",culture:"Culture",health:"Health",science:"Science",environment:"Environment",society:"Society",world:"Around the world",uncategorized:"Uncategorized"} };
function normalizeCategory(value){if(WRLDLINE_TAXONOMY?.normalizeCategory)return WRLDLINE_TAXONOMY.normalizeCategory(value);const key=String(value||"").trim().toLowerCase();return CATEGORY_NAMES.ar[key]?key:"uncategorized";}
function categoryName(value){if(WRLDLINE_TAXONOMY?.categoryName)return WRLDLINE_TAXONOMY.categoryName(value,state.lang);return CATEGORY_NAMES[state.lang]?.[normalizeCategory(value)]||(state.lang==="ar"?"غير مصنف":"Uncategorized");}
function ui(ar,en){return state.lang==="ar"?ar:en;}
function countryName(value,code){
 if(!value||value==="دولي")return ui("غير محدد","Unknown");
 const localized=window.WLEditorial.countryName(code,state.lang);
 if(localized)return localized;
 if(state.lang!=="en")return value;
 const map={"دولي":"International","السعودية":"Saudi Arabia","المملكة العربية السعودية":"Saudi Arabia","الإمارات":"United Arab Emirates","الإمارات العربية المتحدة":"United Arab Emirates","قطر":"Qatar","الكويت":"Kuwait","البحرين":"Bahrain","عمان":"Oman","اليمن":"Yemen","مصر":"Egypt","الأردن":"Jordan","لبنان":"Lebanon","فلسطين":"Palestine","سوريا":"Syria","العراق":"Iraq","المغرب":"Morocco","الجزائر":"Algeria","تونس":"Tunisia","ليبيا":"Libya","السودان":"Sudan","الصين":"China","الولايات المتحدة":"United States","بريطانيا":"United Kingdom","فرنسا":"France","روسيا":"Russia","أوكرانيا":"Ukraine","إيران":"Iran","تركيا":"Türkiye","الهند":"India","اليابان":"Japan"};return map[value]||value;
}
function riskLabel(value){const labels={ar:{critical:"حرج",high:"مرتفع",elevated:"متصاعد",guarded:"مراقبة",low:"منخفض",unknown:"غير محدد"},en:{critical:"Critical",high:"High",elevated:"Elevated",guarded:"Guarded",low:"Low",unknown:"Unknown"}};return labels[state.lang]?.[value]||labels[state.lang].unknown;}
function sourceLanguageLabel(lang){
 const name=window.WLArticleEditions?.languages[window.WLArticleEditions.locale(lang)]?.name||lang;
 return ui("النص الأصلي","Original text")+(name?" · "+name:"");
}
function translationBadge(a){
 if(a.translationStatus&&a.translationStatus!=="none"){
  const label=WRLDLINE_TAXONOMY?.translationStatusLabel?.(a.translationStatus,a.translationSource,state.lang);
  if(label)return label;
 }
 return sourceLanguageLabel(a.lang);
}
function provenanceNote(a){
 if(a.hasTranslation&&a.translationStatus==="published"){
  if(a.translationSource==="editorial")return ui("هذه ترجمة تحريرية معتمدة للخبر، مع الحفاظ على النص الأصلي لدى المصدر.","This is a verified editorial translation. The original text remains available at the source.");
  return ui("هذه ترجمة آلية منشورة وليست ترجمة تحريرية معتمدة؛ النص الأصلي هو المرجع.","This is a published machine translation, not a verified editorial translation. The original text is authoritative.");
 }
 return ui("هذا نص الخبر بلغته الأصلية وليس ترجمة. قد تكون التفاصيل الكاملة أو التحديثات منشورة لدى المصدر.","This is the story in its original language, not a translation. Full details and updates may be available at the source.");
}

const BLOCKED_EDITORIAL_STATUSES = new Set(["rejected","removed","misleading","duplicate","retracted"]);
const CONTENT_TYPES = new Set(["news","analysis","opinion","sponsored"]);
const GENERIC_SOURCE_NAMES = /^(?:عاجل|news alert|breaking news|breaking desk|غرفة الأخبار العاجلة|مصادر العاجل)$/i;
const LOW_QUALITY_TITLE = /^(?:- )?(?:reuters|cnn|cna|al jazeera|kuna(?: news agency)?|business|politics|tech now|tech life|quickreads:.*|who am i|quiz(?:zes)?|horoscope|crossword|wordle|الوسائط|أرشيف|الهاشتاجات|أقلام|رام الله|سلفيت|بيت لحم)\b/i;
function track(name,params={}){try{window.WRLDLINE_ANALYTICS?.track?.(name,params);}catch(error){console.warn("WRLDLINE analytics:",error);}}
function normalizeText(value=""){return String(value||"").normalize("NFC").replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,"").replace(/\s+/g," ").trim();}
function sourceDomain(value=""){try{return new URL(value).hostname.replace(/^www\./i,"").toLowerCase();}catch{return "";}}
function publicationISO(a){const t=Date.parse(a?.published_at||"");return Number.isFinite(t)?new Date(t).toISOString():"";}
function displaySourceName(a){
 const raw=normalizeText(a?.source_name||a?.src||a?.source||"");
 const domain=sourceDomain(a?.url||a?.source_url||a?.sourceURL||"");
 if(raw&&!GENERIC_SOURCE_NAMES.test(raw))return raw;
 if(domain)return domain;
 return ui("المصدر غير متاح","Source unavailable");
}
function contentTypeOf(a){const value=String(a?.content_type??a?.contentType??"").trim().toLowerCase();return CONTENT_TYPES.has(value)?value:"news";}
function contentKindLabel(value){return {news:ui("خبر","News"),analysis:ui("تحليل","Analysis"),opinion:ui("رأي","Opinion"),sponsored:ui("محتوى مدعوم","Sponsored")}[value]||ui("خبر","News");}
function contentBadgeMarkup(a){
 const kind=eventDesk?.kind(a)||contentTypeOf(a);
 return '<span class="content-badge content-'+kind+'">'+escapeHTML(eventDesk?.label(kind,state.lang)||contentKindLabel(kind))+'</span>';
}
function typeBadgesMarkup(a){
 let html="";
 if(a.isBreaking)html+='<span class="breaking-badge">'+ui("عاجل","Breaking")+'</span>';
 html+=contentBadgeMarkup(a);
 if(String(a.src||"").toUpperCase().includes("WRLDLINE")){
  const count=Number(a.verification_independent_count)||Number(a.verification_source_count)||0;const labels={confirmed:ui("مؤكد بمصادر متعددة · "+count+" مصادر","Confirmed by multiple sources · "+count),multi:ui("متعدد المصادر — غير مؤكد · "+count,"Multiple sources — unconfirmed · "+count),preliminary:ui("أولي","Preliminary"),unconfirmed:ui("غير مؤكد","Unconfirmed"),disputed:ui("متنازع عليه","Disputed")};
  html+='<span class="translation-badge editorial-verification">'+escapeHTML(labels[a.verification]||labels.unconfirmed)+'</span>';
 }
 if(a.hasTranslation&&a.translationStatus&&a.translationStatus!=="none")html+='<span class="translation-badge translation-source">'+escapeHTML(translationBadge(a))+'</span>';
 else if(a.translationFallback)html+='<span class="translation-badge translation-source">'+escapeHTML(translationBadge(a))+'</span>';
 return html;
}
function sourceLineMarkup(a,extraClass=""){
 const sourceText=displaySourceName(a);
 const source=escapeHTML(sourceText);
 const date=escapeHTML(formatDate(a.published_at));
 const iso=publicationISO(a);
 const link=a.sourceURL?'<a class="source-link" href="'+escapeHTML(a.sourceURL)+'" target="_blank" rel="noopener noreferrer" data-source-link data-article-id="'+escapeHTML(a.id)+'">'+source+' ↗</a>':'<span class="source-missing">'+source+' · '+ui("رابط المصدر غير متوفر","Source link unavailable")+'</span>';
 return '<div class="story-source '+(extraClass||"")+'"><span class="story-source-name">'+link+'</span><time datetime="'+(iso||"")+'" aria-label="'+escapeHTML(ui("تاريخ النشر: ","Published: ")+date)+'">'+date+'</time></div>';
}
function sourceBoxMarkup(a){
 const kind=contentTypeOf(a);
 const sourceText=displaySourceName(a);
 const source=escapeHTML(sourceText);
 const link=a.sourceURL?'<a class="source-link" href="'+escapeHTML(a.sourceURL)+'" target="_blank" rel="noopener noreferrer" data-source-link data-article-id="'+escapeHTML(a.id)+'">'+ui("قراءة الخبر لدى المصدر الأصلي ↗","Read at original source ↗")+'</a>':'<span class="source-missing">'+ui("رابط المصدر الأصلي غير متوفر. لا نستبدله برابط وهمي.","The original source link is unavailable. We do not substitute a fake link.")+'</span>';
 const sponsor=kind==="sponsored"?'<small class="sponsor-disclosure">'+ui("بالتعاون مع: ","In partnership with: ")+escapeHTML(a.sponsorName||ui("راعٍ لم يحدد","Unnamed sponsor"))+(a.sponsorURL?' · <a href="'+escapeHTML(a.sponsorURL)+'" target="_blank" rel="noopener noreferrer sponsored">'+ui("موقع الراعي ↗","Sponsor site ↗")+'</a>':"")+'</small>':"";
 return '<div class="source-box source-box-'+kind+'"><span>'+ui("المصدر الأصلي","Original source")+'</span><strong>'+source+'</strong>'+link+sponsor+'<small class="publication-date">'+ui("تاريخ النشر: ","Published: ")+escapeHTML(formatDate(a.published_at))+'</small></div>';
}
function correctionMarkup(a){if(!a.correctionNote)return "";return '<div class="correction-note" role="note"><strong>'+ui("تصحيح منشور","Published correction")+'</strong><p>'+escapeHTML(a.correctionNote)+'</p><small>'+escapeHTML(formatDate(a.correctedAt||a.published_at))+'</small></div>';}
const GENERIC_FEED_HEADLINES=/^(?:آخر الأخبار العاجلة في العراق وكوردستان والعالم|نوفمبر\\s+20\\d{2}(?:\\s*[-–—|]\\s*شفق نيوز)?|أرقام\\s*:\\s*.*(?:الاخبار|الأخبار).*(?:تاسي|سوق الأسهم)|مباشر\\s*[—–-]\\s*الأخبار المالية والأسواق والرؤى الاستثمارية)$/i;
function isLowQualityArticle(a){
 const title=normalizeText(a.originalTitle||a.title);
 if(!title||title.length<4)return true;
 if(GENERIC_FEED_HEADLINES.test(title))return true;
 return title.length<55&&LOW_QUALITY_TITLE.test(title);
}
function dedupeArticles(list){return window.WLDiscovery.dedupe(list);}
function translationLooksUntranslated(translation,sourceTitle,sourceSummary){
 if(!translation?.title)return true;
 const t=normalizeText(translation.title).toLocaleLowerCase();
 const s=normalizeText(sourceTitle).toLocaleLowerCase();
 if(t===s)return true;
 return !!(sourceSummary&&normalizeText(translation.summary).toLocaleLowerCase()===normalizeText(sourceSummary).toLocaleLowerCase());
}

function newsDataMetaMarkup(a){
 const tags=(Array.isArray(a.newsdataAiTags)?a.newsdataAiTags:[]).map(x=>typeof x==="string"?x:(x?.name||x?.tag||x?.value||"")).filter(Boolean).slice(0,3);
 const sentiment=String(a.newsdataSentiment||"").toLowerCase();
 const sentimentLabel=sentiment==="positive"?ui("إيجابي","Positive"):sentiment==="negative"?ui("سلبي","Negative"):sentiment==="neutral"?ui("محايد","Neutral"):"";
 if(!a.newsdataArticleId&&!tags.length&&!sentimentLabel&&!a.newsdataAiSummary)return "";
 return '<div class="newsdata-meta"><span class="newsdata-provider">NewsData.io</span>'+tags.map(t=>'<span class="newsdata-tag">'+escapeHTML(t)+'</span>').join("")+(sentimentLabel?'<span class="newsdata-sentiment sentiment-'+escapeHTML(sentiment)+'">'+ui("المشاعر: ","Sentiment: ")+escapeHTML(sentimentLabel)+'</span>':"")+'</div>';
}
const editionParams = new URLSearchParams(location.search);
const requestedCategory = editionParams.get("category");
const initialCategory = requestedCategory && Object.hasOwn(CATEGORY_NAMES.ar, requestedCategory) ? requestedCategory : "all";
const initialFormat = window.WLDiscovery.formats.includes(editionParams.get("format")) ? editionParams.get("format") : "all";
const state = { articles:[], frontPageArticles:[], filtered:[], category:initialCategory, country:window.WLEditorial.iso3Of(editionParams.get("country"))||"all", format:initialFormat, lang:window.wrldlineLang==="en"?"en":"ar", limit:PAGE_SIZE, saved:new Set(readSaved()), query:"", sort:editionParams.get("sort")==="oldest"?"oldest":"newest", loading:false, db:null, user:null, preferences:null, follows:{category:[],country:[]}, followOnly:false, realtime:null, pendingLocalSaved:new Set(readSaved()), breakingTickerIndex:0, breakingTickerCurrentId:null, missedLimit:8, lastFetchAt:0, feedRows:[], extraRows:[], popularRows:[], feedArticles:[], before:null, offset:0, more:false, paging:false, feedStatus:"loading", pageStatus:"" };
const supplemental = {
 breaking:{rows:[],status:"loading",grid:"breakingNewsGrid",heading:"breakingHeading",filter:"p_is_breaking"},
 exclusive:{rows:[],status:"loading",grid:"exclusiveNewsGrid",heading:"exclusiveHeading",filter:"p_is_exclusive"},
 popular:{rows:[],status:"loading",grid:"popularStoriesGrid",heading:"popularStoriesHeading"}
};

document.addEventListener("DOMContentLoaded", () => {
  initPreferences(); bindEvents(); updateCategoryControls(); updateReaderLabels(); populateCountries(); updateClock(); fetchNews();
  // Start the public feed independently of the optional account SDK.
  loadPersonalizationSDK();
  setInterval(()=>{if(!document.hidden&&Date.now()-state.lastFetchAt>=90000)fetchNews();},30000);
  setInterval(()=>{if(!document.hidden)updateBreaking();},15000);
  if(typeof BroadcastChannel==="function"){
   const channel=new BroadcastChannel("wrldline:publication");
   channel.addEventListener("message",event=>{
    if(event.data?.type!=="published")return;
    state.lastFetchAt=0;
    if(!document.hidden)void fetchNews();
   });
  }
  if(document.readyState==="complete")void registerServiceWorker();
  else window.addEventListener("load",registerServiceWorker,{once:true});
  setupAppInstall();
});

async function registerServiceWorker(){
 if(!("serviceWorker" in navigator))return;
 try{
  const registration=await navigator.serviceWorker.register("/sw.js?v=edition",{scope:"/"});
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
function safeURL(value){ try{const u=new URL(value);if(!["http:","https:"].includes(u.protocol))return "";if(u.protocol==="http:")u.protocol="https:";return u.href;}catch{return "";} }
function formatDate(value){const d=new Date(value);if(!value||Number.isNaN(d.getTime()))return ui("تاريخ النشر غير متوفر","Publication date unavailable");const locale=state.lang==="ar"?"ar-SA-u-ca-gregory":"en-US-u-ca-gregory";return new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",calendar:"gregory"}).format(d);}
function timeAgo(value,providerStory=false){const d=new Date(value);if(!value||Number.isNaN(d.getTime()))return ui("تاريخ النشر غير متوفر","Publication date unavailable");const mins=Math.max(0,Math.floor((Date.now()-d)/60000));if(mins<1)return providerStory?ui("قبل أقل من دقيقة","Less than a minute ago"):ui("الآن","Just now");if(mins<60)return providerStory?ui("قبل "+mins+" دقيقة",mins+" minutes ago"):ui("قبل "+mins+" د",mins+"m ago");const h=Math.floor(mins/60);if(h<24)return providerStory?ui("قبل "+h+" ساعة",h+" hours ago"):ui("قبل "+h+" س",h+"h ago");if(providerStory){const days=Math.floor(h/24);const label=days===1?"يوم":days===2?"يومين":days<=10?days+" أيام":days+" يومًا";return ui("قبل "+label,days+" days ago");}return formatDate(value);}
function updateClock(){const now=new Date();const locale=state.lang==="ar"?"ar-SA-u-ca-gregory":"en-US-u-ca-gregory";const label=document.getElementById("todayLabel");if(label){label.textContent=new Intl.DateTimeFormat(locale,{weekday:"long",year:"numeric",month:"long",day:"numeric",calendar:"gregory"}).format(now);label.dateTime=now.toISOString().slice(0,10);}const edition=document.getElementById("editionDate");if(edition)edition.textContent=new Intl.DateTimeFormat(locale,{dateStyle:"medium",calendar:"gregory"}).format(now);const year=document.getElementById("year");if(year)year.textContent=now.getFullYear();}
function initPreferences(){const theme=localStorage.getItem("wrldline:theme")||"light";document.documentElement.dataset.theme=theme;const btn=document.getElementById("themeButton");if(btn){const use=btn.querySelector("use");if(use)use.setAttribute("href",theme==="dark"?"#i-sun":"#i-moon");else btn.textContent=theme==="dark"?"☀":"☾";btn.setAttribute("aria-label",theme==="dark"?"التبديل إلى المظهر الفاتح":"التبديل إلى المظهر الداكن");}}
function loadPersonalizationSDK(){
 const start=()=>{
  if(window.supabase?.createClient){void initPersonalization().catch(console.warn);return;}
  const script=document.createElement("script");
  script.src="./vendor/supabase-2.119.0.js";
  script.onload=()=>{void initPersonalization().catch(console.warn);};
  script.onerror=()=>console.warn("WRLDLINE account SDK unavailable");
  document.head.append(script);
 };
 // Keep account startup off the initial foreground render, but don't let a slow
 // third-party image delay sign-in or syncing.
 if("requestIdleCallback" in window)requestIdleCallback(start,{timeout:1500});
 else setTimeout(start,0);
}
function bindEvents(){
 document.getElementById("themeButton").addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;localStorage.setItem("wrldline:theme",next);document.getElementById("themeButton").textContent=next==="dark"?"☀":"☾";});
 document.getElementById("refreshButton").addEventListener("click",()=>fetchNews(true));
 document.getElementById("feedRefreshButton").addEventListener("click",()=>fetchNews(true));
 document.getElementById("dockSaved").addEventListener("click",showSaved);
 document.getElementById("dockSearch").addEventListener("click",openSearch);
 document.getElementById("backToTop").addEventListener("click",()=>window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}));
 window.addEventListener("scroll",()=>document.getElementById("backToTop").classList.toggle("visible",window.scrollY>650),{passive:true});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&Date.now()-state.lastFetchAt>=90000)fetchNews();});

 document.addEventListener("wrldline:language",event=>{
  state.lang=event.detail.lang;updateClock();updateCategoryControls();updateReaderLabels();
  if(state.before)refreshReaderData();
  else {populateCountries();if(state.feedStatus==="error")renderFetchFailure();renderFeedMeta();}
  setFeedConnection(state.feedConnection||state.feedStatus);
  if(document.getElementById("searchOverlay").open)renderSearch();
 });
document.addEventListener("click",e=>{const link=e.target.closest?.("[data-source-link]");if(!link)return;e.stopPropagation();track("outbound_source_click",{article_id:link.dataset.articleId||"",destination_domain:sourceDomain(link.href),content_type:link.closest("[data-content-type]")?.dataset.contentType||"unknown"});},true);
 document.getElementById("searchButton").addEventListener("click",openSearch);document.getElementById("closeSearch").addEventListener("click",closeSearch);
 const searchInput=document.getElementById("searchInput");
 searchInput.addEventListener("input",e=>{state.query=e.target.value;renderSearch();});
 searchInput.addEventListener("keydown",event=>{
  if(event.key!=="Enter"||event.isComposing)return;
  const first=document.querySelector("#searchResults [data-open]");if(first){event.preventDefault();first.click();}
 });
 for(const [id,key] of [["countryFilter","country"],["formatFilter","format"],["sortFilter","sort"]]){
  document.getElementById(id).addEventListener("change",event=>{
   state[key]=event.target.value;state.limit=PAGE_SIZE;state.pageStatus="";
   syncEditionURL();applyFilters();
  });
 }
 document.getElementById("clearEditionFilters").addEventListener("click",()=>resetEditionFilters(true));
 document.getElementById("loadMoreButton").addEventListener("click",loadOlderNews);
 document.getElementById("missedLoadMoreButton")?.addEventListener("click",()=>{state.missedLimit+=8;renderMissedStories();});
 document.getElementById("followFeedButton").addEventListener("click",()=>{if(!state.user){showToast(ui("سجّل الدخول أولاً لحفظ ومزامنة متابعاتك.","Sign in to save and sync your follows."));return;}state.followOnly=!state.followOnly;state.limit=PAGE_SIZE;updateFollowToggle();applyFilters();});
 document.getElementById("followOptions").addEventListener("click",e=>{const b=e.target.closest("[data-follow-type]");if(b)toggleFollow(b.dataset.followType,b.dataset.followValue);});
 document.getElementById("coveragePulseGrid").addEventListener("click",e=>{const b=e.target.closest("[data-pulse-category]");if(b)selectCategory(b.dataset.pulseCategory,true);});
 document.getElementById("savedButton").addEventListener("click",showSaved);document.getElementById("openSaved").addEventListener("click",showSaved);
 document.querySelectorAll("[data-category]").forEach(el=>el.addEventListener("click",e=>{
  if(e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return;
  e.preventDefault();
  selectCategory(el.dataset.category,!(el.closest("#newsSection")||el.matches(".nav-link[data-category=all]")));
 }));
 document.addEventListener("click",event=>{
  const button=event.target.closest("[data-reader-action]"),action=button?.dataset.readerAction;
  if(action==="retry")fetchNews(true);
  if(action==="retry-section"&&state.before&&Object.hasOwn(supplemental,button.dataset.section))void loadSupplemental(button.dataset.section,state.before,button);
  if(action==="reset")resetEditionFilters(true);
 });
 document.getElementById("articleModal").addEventListener("click",e=>{if(e.target.id==="articleModal")closeArticle();});
 document.getElementById("searchOverlay").addEventListener("click",e=>{if(e.target.id==="searchOverlay")closeSearch();});
 document.getElementById("newsGrid").addEventListener("click",e=>{
  const button=e.target.closest("button");if(!button)return;
  if(button.dataset.open)openArticle(button.dataset.open);
  if(button.dataset.save)toggleSaved(button.dataset.save);
 });
 for(const [id,close] of [["articleModal",()=>closeArticle()],["searchOverlay",closeSearch]]){
  document.getElementById(id).addEventListener("cancel",event=>{event.preventDefault();close();});
 }
 document.addEventListener("keydown",e=>{
  const inText=e.target.closest?.("input, textarea, select, [contenteditable]");
  if(e.defaultPrevented||e.isComposing||document.querySelector(".wrldline-consent:not([hidden])")||document.querySelector("dialog[open]:not(#searchOverlay)"))return;
  if(((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k")||(e.key==="/"&&!inText&&!e.metaKey&&!e.ctrlKey&&!e.altKey)){e.preventDefault();openSearch();}
 });
 document.addEventListener("keydown",e=>{if(e.key!=="Enter"&&e.key!==" ")return;const el=e.target.closest?.("[data-open][role=button]");if(!el||e.target!==el)return;e.preventDefault();openArticle(el.dataset.open);});

 window.addEventListener("popstate",()=>{
  const article=new URLSearchParams(location.search).get("article");
  if(article)openArticle(article,false);else closeArticle(false);
 });
}
async function getPublicNewsRows(params, { url=PUBLIC_NEWS_RPC, timeout=8000 }={}){
 const response=await fetch(url,{method:"POST",headers:{apikey:SUPABASE_ANON_KEY,"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(params),signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw new Error("HTTP "+response.status);
 const rows=await response.json();
 if(!Array.isArray(rows))throw new Error("Invalid response");
 return rows;
}
function normalizeHomeRows(rows){
 return rows.filter(row=>row?.id).map(normalizeArticle).filter(a=>a.title&&!BLOCKED_EDITORIAL_STATUSES.has(a.editorialStatus)&&!isLowQualityArticle(a)&&(!isTelegramArticle(a.raw)||(a.isBreaking===true&&isDedicatedBreakingSource(a.src))));
}
async function loadSupplemental(name,before,retryButton){
 const section=supplemental[name],host=document.getElementById(section.grid);
 if(section.pending)return;
 section.pending=true;
 host.setAttribute("aria-busy","true");
 renderSupplementalNotice(name);
 const since=new Date(Date.parse(before)-24*60*60*1000).toISOString();
 try{
  section.rows=name==="breaking"
   ?await getPublicNewsRows({p_limit:SUPPLEMENTAL_FEED_LIMIT,p_since:since},{url:BREAKING_FEED_RPC,timeout:6000})
   :name==="exclusive"
   ?await getPublicNewsRows({p_limit:SUPPLEMENTAL_FEED_LIMIT},{url:EXCLUSIVE_FEED_RPC,timeout:6000})
   :await getPublicNewsRows({p_days:7,p_limit:5},{url:WRLDLINE_PUBLIC_NEWS_API+"/rest/v1/rpc/public_top_read_articles",timeout:6000});
  section.status="ready";
 }catch(error){
  section.status="error";
  console.warn("WRLDLINE supplemental section unavailable:",name,error.message);
 }finally{
  section.pending=false;
  host.setAttribute("aria-busy","false");
 }
 if(section.status==="ready"&&document.activeElement===retryButton){
  document.getElementById(section.heading).focus();
 }
 state.extraRows=[...supplemental.breaking.rows,...supplemental.exclusive.rows];
 state.popularRows=supplemental.popular.rows;
 refreshReaderData({updateFeed:false,section:name});
}
function renderSupplementalNotice(name,hasVisibleRows=false){
 const section=supplemental[name],notice=document.getElementById(`${name}FeedNotice`);
 if(!notice)return;
 const button=notice.querySelector("button"),failed=section.status==="error";
 notice.hidden=!failed;
 if(!failed)return;
 const message=section.pending?ui("جارٍ إعادة تحميل القسم…","Retrying this section…"):hasVisibleRows
  ?ui("تعذّر تحديث القسم. نعرض القصص المتاحة.","This section could not refresh. Showing available stories.")
  :ui("تعذّر تحميل هذا القسم.","This section could not load.");
 const status=notice.querySelector("p"),label=ui("إعادة محاولة تحميل القسم","Retry this section");
 if(status.textContent!==message)status.textContent=message;
 if(button.textContent!==label)button.textContent=label;
 button.setAttribute("aria-disabled",String(!!section.pending));
}
function refreshReaderData({updateFeed=true,updateSections=true,section=null}={}){
 if(updateFeed){
  const previous=new Map(state.feedDataLanguage===state.lang?state.feedArticles.map(a=>[a.raw,a]):[]);
  state.feedArticles=dedupeArticles(normalizeHomeRows(state.feedRows)).map(a=>previous.get(a.raw)||a);
  state.feedDataLanguage=state.lang;
  state.feedFreshness=window.WLDiscovery.feedFreshness(state.feedArticles,state.loadedAt);
 }
 const byId=new Map();
 for(const row of [...state.extraRows,...state.popularRows,...state.feedRows])if(row?.id)byId.set(String(row.id),row);
 const approved=normalizeHomeRows([...byId.values()]);
 state.articleById=new Map(approved.map(a=>[a.id,a]));
 state.articles=dedupeArticles(approved);
 if(updateFeed){populateCountries();applyFilters();}
 if(updateSections){
  const frontIds=new Set([...state.extraRows,...state.feedRows.slice(0,MAIN_FEED_LIMIT)].map(row=>String(row?.id)));
  state.frontPageArticles=dedupeArticles(approved.filter(a=>frontIds.has(a.id)));
  if(!section||section!=="popular"){
   renderMissedStories();renderCoveragePulse();
   document.dispatchEvent(new CustomEvent("wrldline:news",{detail:{articles:state.frontPageArticles}}));
  }
  if(!section||section==="exclusive")renderExclusive();
  if(!section||section==="popular")renderPopularStories(state.popularRows);
  if(!section||section==="breaking")updateBreaking();
 }
 if(document.getElementById("searchOverlay").open&&!document.activeElement.closest("#searchResults"))renderSearch();
}
function setFeedConnection(status){
 state.feedConnection=status;
 const loadedMessages={
  recent:ui("تم تحميل موجز الأخبار","News feed loaded"),
  quiet:ui("لا أخبار حديثة في الموجز","No recent stories in the feed"),
  undated:ui("تم تحميل الموجز دون تاريخ نشر صالح","Feed loaded; no valid publication dates"),
  empty:ui("لا مواد متاحة في الموجز","No stories in the feed")
 };
 const messages={
  loading:ui("جارٍ تحديث الأخبار","Updating news"),
  ready:loadedMessages[state.feedFreshness?.status]||loadedMessages.empty,
  stale:ui("تعذر التحديث؛ نعرض آخر نسخة","Refresh failed; showing last loaded news"),
  error:ui("تعذر الاتصال بمصدر الأخبار","News connection unavailable")
 };
 document.getElementById("connectionLabel").textContent=messages[status];
 const el=document.getElementById("newsStatus");
 el.classList.toggle("is-updating",status==="loading");el.classList.toggle("is-error",status==="error"||status==="stale");
}
async function fetchNews(manual=false){
 if(state.loading||state.paging)return;
 // Don't replace the reader's browse window or a focused result in the background.
 if(!manual&&(state.offset>MAIN_FEED_LIMIT||document.querySelector("dialog[open]")||document.activeElement.closest("#newsGrid,#heroLayout,.wl-feed-controls,#categoryChips,#missedNewsSection,#breakingSection,#exclusiveSection,#popularStoriesSection")))return;
 state.loading=true;
 const refreshes=["refreshButton","feedRefreshButton"].map(id=>document.getElementById(id));
 refreshes.forEach(el=>{el.classList.add("is-loading");el.setAttribute("aria-busy","true");el.setAttribute("aria-disabled","true");});
 setFeedConnection("loading");
 try{
  const now=new Date().toISOString();
  const params={p_limit:MAIN_FEED_LIMIT,p_before:now,p_since:null,p_offset:0,p_newsdata_only:false};
  let mainRows;
  try{mainRows=await getPublicNewsRows(params);}
  catch(error){
   if(navigator.onLine===false)throw error;
   mainRows=await getPublicNewsRows(params,{timeout:4000});
  }
  const firstLoad=!state.before;
  state.feedRows=mainRows;state.before=now;state.offset=mainRows.length;state.more=mainRows.length===MAIN_FEED_LIMIT;
  state.limit=PAGE_SIZE;state.pageStatus="";state.feedStatus="ready";state.loadedAt=state.lastFetchAt=Date.now();
  // Paint the main feed before issuing optional requests, and don't rebuild it
  // when those requests finish.
  refreshReaderData();setFeedConnection("ready");renderFeedMeta();
  if(firstLoad){
   const linkedId=new URLSearchParams(location.search).get("article");
   if(linkedId&&!document.querySelector("dialog[open]"))openArticle(linkedId,false);
  }
  if(manual)showToast(ui("تم تحميل الموجز","Feed loaded"));
  // The retrospective uses already loaded, eligible coverage rather than
  // requesting the separate NewsData-only lane that the renderer excludes.
  const sections=await Promise.allSettled(Object.keys(supplemental).map(name=>loadSupplemental(name,now)));
  for(const result of sections)if(result.status==="rejected")console.warn("WRLDLINE supplemental render failed:",result.reason);
  // A deep link can refer to a separate breaking or exclusive batch.
  if(firstLoad){
   const linkedId=new URLSearchParams(location.search).get("article");
   if(linkedId&&!document.querySelector("dialog[open]"))openArticle(linkedId,false);
  }
  if(state.user)void syncLocalSavedToCloud().catch(console.warn);
 }catch(err){
  console.warn("WRLDLINE feed unavailable:",err);
  state.feedStatus=state.before?"stale":"error";setFeedConnection(state.feedStatus);
  if(manual)showToast(ui("تعذر تحديث الأخبار. تحقق من الاتصال وحاول مجددًا.","Could not refresh news. Check your connection and try again."));
  if(!state.before)renderFetchFailure();
  if(document.getElementById("searchOverlay").open)renderSearch();
  renderFeedMeta();
 }finally{
  state.loading=false;
  refreshes.forEach(el=>{el.classList.remove("is-loading");el.removeAttribute("aria-busy");el.removeAttribute("aria-disabled");});
  renderPageControls();
 }
}
async function loadOlderNews(){
 if(state.paging||!state.before||(!state.more&&state.limit>=state.filtered.length))return;
 const previousIds=new Set([...document.querySelectorAll("#newsGrid [data-open]")].map(el=>el.dataset.open));
 const more=document.getElementById("loadMoreButton");
 const hasLocal=state.limit<state.filtered.length;
 if(!hasLocal&&state.loading)return;
 state.pageStatus="";
 if(hasLocal){state.limit+=PAGE_SIZE;renderFeed();}
 else{
  state.paging=true;renderPageControls();
  try{
   const rows=await getPublicNewsRows({p_limit:MAIN_FEED_LIMIT,p_before:state.before,p_since:null,p_offset:state.offset,p_newsdata_only:false});
   state.offset+=rows.length;state.more=rows.length===MAIN_FEED_LIMIT&&state.offset<MAX_FEED_OFFSET;
   state.feedRows.push(...rows);state.limit+=PAGE_SIZE;refreshReaderData({updateSections:false});
   setFeedConnection(state.feedStatus);
   if(state.user)void syncLocalSavedToCloud().catch(console.warn);
  }catch(error){
   console.warn("WRLDLINE pagination unavailable:",error);state.pageStatus="error";
  }finally{state.paging=false;renderPageControls();}
 }
 if(document.activeElement===more||(!state.more&&document.activeElement===document.body)){
  const firstNew=[...document.querySelectorAll("#newsGrid [data-open]")].find(el=>!previousIds.has(el.dataset.open));
  if(firstNew){
   const disclosure=firstNew.closest("details");
   (disclosure&&!disclosure.open?disclosure.querySelector("summary"):firstNew).focus();
  }
  else if(more.hidden)document.querySelector(".reader-feed-footer a").focus();
 }
}
function renderPageControls(){
 const el=document.getElementById("loadMoreButton"),status=document.getElementById("feedPageStatus");
 const local=state.limit<state.filtered.length;
 el.hidden=!state.before||(!state.more&&!local);
 el.setAttribute("aria-disabled",String(state.paging||(!local&&state.loading)));
 el.textContent=state.pageStatus==="error"?ui("إعادة محاولة تحميل الأقدم","Retry loading older news"):local?ui("عرض المزيد من النتائج","Show more results"):ui("تحميل أخبار أقدم","Load older news");
 status.textContent=state.paging?ui("جارٍ تحميل أخبار أقدم…","Loading older news…"):state.pageStatus==="error"?
  ui("تعذر تحميل الدفعة التالية. يمكنك المحاولة مرة أخرى.","The next batch could not load. You can try again."):
  state.before&&!state.more&&!local?ui("لمزيد من التغطية، تصفّح الأرشيف.","Visit the archive for more coverage."):"";
}
function renderFetchFailure(){
 const message='<div class="wl-empty reader-failure"><strong>'+ui("لم نتمكن من تحميل الأخبار","We could not load the news")+'</strong><p>'+ui("يمكنك إعادة المحاولة أو تصفّح الأخبار المنشورة في الأرشيف.","Try again or browse published news in the archive.")+'</p><div><button class="outline-button" type="button" data-reader-action="retry">'+ui("إعادة المحاولة","Retry")+'</button> <a href="/news/">'+ui("تصفّح الأرشيف","Browse the archive")+'</a></div></div>';
 for(const id of ["missedNewsGrid","breakingNewsGrid","exclusiveNewsGrid","newsGrid","coveragePulseGrid","popularStoriesGrid"]){
  const el=document.getElementById(id);if(el){el.setAttribute("aria-busy","false");el.innerHTML=message;}
 }
 document.getElementById("lastUpdated").textContent=ui("تعذر التحديث","Update unavailable");
 const last=document.getElementById("missedNewsCount");if(last)last.textContent="—";
 const breaking=document.getElementById("breakingCount");if(breaking)breaking.textContent="—";
 const exclusive=document.getElementById("exclusiveCount");if(exclusive)exclusive.textContent="—";
}
function isTelegramArticle(a){return /t\.me|telegram\.me|telegram/i.test([a?.url,a?.source_url,a?.source_name].filter(Boolean).join(" "));}
function translationNeedsReview(text){
 const value=String(text||"");
 const arabic=(value.match(/[\u0600-\u06FF]/g)||[]).length;
 const latin=(value.match(/[A-Za-z]/g)||[]).length;
 return arabic>0&&latin>=8&&latin/(arabic+latin)>0.12;
}
function normalizeArticle(a){
 const sourceTitle=String(a.title||"");
 const titleIsArabic=/[\u0600-\u06FF]/.test(sourceTitle);
 const declaredLang=String(a.source_language||a.lang||"").toLowerCase();
 const sourceLang=window.WLArticleEditions?.originalLanguage(declaredLang,sourceTitle)||(titleIsArabic?"ar":"en");
 const editionLang=window.WLArticleEditions?.locale(sourceLang)||sourceLang;
 const translations=Array.isArray(a.article_translations)?a.article_translations:[];
 const publishedTranslations=translations.filter(t=>t.translation_status==="published"&&t.translation_source==="editorial");
 const translation=editionLang!==state.lang&&publishedTranslations.find(t=>t.lang===state.lang&&t.title&&t.summary&&!translationLooksUntranslated(t,sourceTitle,a.summary));
 const translationPending=false;
 const translationFallback=editionLang!==state.lang&&!translation;
 const translationReview=!!translation&&translationNeedsReview((translation.title||"")+" "+(translation.summary||""));
 const sameLanguage=editionLang===state.lang;
 const sourceScope=String(a.source_scope||"").toLowerCase();
 const eventCountry=window.WLEditorial.eventCountry(a);
 const rawTitle=translation?.title||sourceTitle;
 const title=window.WLRank&&typeof window.WLRank.cleanHeadline==="function"?window.WLRank.cleanHeadline(rawTitle,displaySourceName(a)):rawTitle;
 const summary=translation?.summary||a.summary||ui("الملخص غير متوفر. افتح المصدر لقراءة الخبر كاملًا.","Summary unavailable. Open the source to read the full story.");
 const published=String(a.published_at||"");
 const kind=contentTypeOf(a);
 return {translationPending,translationFallback,translationNeedsReview:translationReview,id:String(a.id),title,summary,isNewsDataOnly:a.newsdata_only===true,newsdataArticleId:a.newsdata_article_id||null,newsdataAiTags:Array.isArray(a.newsdata_ai_tags)?a.newsdata_ai_tags:[],newsdataSentiment:a.newsdata_sentiment||null,newsdataAiSummary:a.newsdata_ai_summary||null,newsdataFetchedAt:a.newsdata_fetched_at||null,mediaType:a.media_type==="video"?"video":"image",img:safeURL(a.image_url||""),cat:normalizeCategory(a.category),country:eventCountry,eventCountry:eventCountry,sourceScope:sourceScope,sourceLanguage:sourceLang,languageDetection:a.language_detection||"unknown",hasTranslation:!!translation,translationStatus:translation?.translation_status||"none",translationSource:translation?.translation_source||"",aiCountryCode:a.ai_country_code||null,src:displaySourceName(a),sourceURL:safeURL(String(a.source_name||"").toUpperCase().includes("WRLDLINE")?(a.source_url||a.url||""):(a.url||a.source_url||"")),published_at:published,received_at:String(a.received_at||""),lang:sourceLang,isBreaking:!!a.is_breaking,contentType:kind,sponsorName:normalizeText(a.sponsor_name||""),sponsorURL:safeURL(a.sponsor_url||""),correctionNote:normalizeText(a.correction_note||""),correctedAt:String(a.corrected_at||""),editorialStatus:a.editorial_status||"published",verification:a.trust_needs_review===true?(a.editorial_trust_status==="disputed"?"disputed":(a.verification==="multi"?"multi":"unconfirmed")):(a.editorial_trust_status||a.verification||"unconfirmed"),verification_source_count:Number(a.verification_source_count)||0,verification_independent_count:Number(a.verification_independent_count)||0,verification_official_count:Number(a.verification_official_count)||0,verification_conflict_count:Number(a.verification_conflict_count)||0,verification_correction_count:Number(a.verification_correction_count)||0,verification_retraction_count:Number(a.verification_retraction_count)||0,verification_updated_at:a.verification_updated_at||"",verification_note:a.verification_note||"",aiSummary:translation?.ai_summary||(sameLanguage?a.ai_summary||"":""),aiReaderImpact:String(a.ai_reader_impact||""),aiWatchNext:String(a.ai_watch_next||""),aiRiskLevel:a.ai_risk_level||"unknown",aiRiskScore:a.ai_risk_score||0,aiConfidence:a.ai_confidence||null,raw:a,isExclusive:a.is_exclusive===true,exclusiveType:a.exclusive_type||null,exclusiveReason:a.exclusive_reason||"",exclusiveConfidence:Number(a.exclusive_confidence)||0,originalTitle:sourceTitle,originalSummary:String(a.summary||""),
  eventCountryCode:window.WLEditorial.eventCountryCode(a)};
}
function populateCountries(){
 const select=document.getElementById("countryFilter");
 const codes=new Set(state.feedArticles.map(a=>a.eventCountryCode).filter(Boolean));
 if(state.country!=="all")codes.add(state.country);
 const entries=[...codes].map(code=>[code,window.WLEditorial.countryName(code,state.lang)||code])
  .sort((a,b)=>a[1].localeCompare(b[1],state.lang));
 updateEditionSelect(select,[["all",ui("كل الدول","All countries")],...entries],state.country);
 renderFollowPanel();
}
function updateEditionSelect(select,entries,value){
 if(select.options.length!==entries.length||entries.some(([key,label],i)=>select.options[i].value!==key||select.options[i].textContent!==label)){
  select.replaceChildren(...entries.map(([key,label])=>new Option(label,key)));
 }
 select.value=value;
}
function renderFollowPanel(){
 const host=document.getElementById("followOptions"),hint=document.getElementById("followHint");if(!host||!hint)return;
 if(!state.user){hint.textContent=ui("سجّل الدخول لتحفظ اختياراتك وتزامنها مع حسابك على كل أجهزتك.","Sign in to save your preferences and sync them across devices.");host.innerHTML='<a class="outline-button" href="account.html">'+ui("تسجيل الدخول أو إنشاء حساب","Sign in or create an account")+"</a>";return;}
 hint.textContent=ui("اختر ما تريد متابعته؛ ستظهر أخباره في موجز متابعاتي.","Choose what to follow; related stories will appear in your personal feed.");
 const cats=Object.keys(CATEGORY_NAMES.ar).map(value=>({type:"category",value,label:categoryName(value)}));
 const countries=[...new Set(state.articles.map(a=>a.country).filter(c=>c&&c!=="دولي"&&c!=="غير محدد"))].sort((a,b)=>a.localeCompare(b,"ar")).map(value=>({type:"country",value,label:countryName(value,window.WLEditorial.eventCountryCode({event_country:value}))}));
 const make=(item)=>'<button type="button" class="follow-chip '+(state.follows[item.type].includes(item.value)?"selected":"")+'" data-follow-type="'+item.type+'" data-follow-value="'+escapeHTML(item.value)+'" aria-pressed="'+String(state.follows[item.type].includes(item.value))+'">'+escapeHTML(item.label)+(state.follows[item.type].includes(item.value)?" ✓":" +")+'</button>';
 host.innerHTML='<div class="follow-group"><strong>'+ui("الأقسام","Sections")+'</strong><div class="follow-chip-list">'+cats.map(make).join("")+'</div></div><div class="follow-group"><strong>'+ui("الدول","Countries")+'</strong><div class="follow-chip-list">'+(countries.length?countries.map(make).join(""):'<span class="muted">تظهر الدول بعد وصول أخبارها.</span>')+'</div></div>';
}
async function initPersonalization(){
 if(!window.supabase?.createClient)return;
 state.db=window.WRLDLINE_AUTH?.client||window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const {data:{session}}=await state.db.auth.getSession();await handlePersonalSession(session);
 initNewsRealtime();
 state.db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>handlePersonalSession(session),0);});
}
async function handlePersonalSession(session){
 const next=session?.user||null,changed=state.user?.id!==next?.id;state.user=next;
 if(changed&&state.realtime){await state.db.removeChannel(state.realtime);state.realtime=null;}
 if(!next){const wasFollowing=state.followOnly;state.follows={category:[],country:[]};state.preferences=null;state.followOnly=false;updateFollowToggle();renderFollowPanel();if(wasFollowing)applyFilters();return;}
 await loadCloudSaved(false);await loadPreferences();renderFollowPanel();
 state.followOnly=state.follows.category.length>0||state.follows.country.length>0;
 updateFollowToggle();
 if(state.articles.length)applyFilters();
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
 state.saved=new Set((data||[]).map(x=>String(x.article_id)));persistSaved();updateSavedButtons();
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
async function loadPreferences(){
 if(!state.db||!state.user)return;
 const {data,error}=await state.db.from("user_preferences").select("followed_categories,followed_countries,notify_breaking,notify_categories,notify_countries,browser_notifications").eq("user_id",state.user.id).maybeSingle();
 if(error){console.warn("WRLDLINE preferences:",error.message);await loadFollows();return;}
 if(!data){await loadFollows();state.preferences={followed_categories:state.follows.category,followed_countries:state.follows.country,notify_breaking:true,notify_categories:state.follows.category,notify_countries:state.follows.country,browser_notifications:false};await state.db.from("user_preferences").upsert({user_id:state.user.id,...state.preferences},{onConflict:"user_id"});return;}
 state.preferences=data;
 state.follows={category:Array.isArray(data.followed_categories)?data.followed_categories:[],country:Array.isArray(data.followed_countries)?data.followed_countries:[]};
}
async function savePreferenceArrays(){
 if(!state.db||!state.user)return;
 state.preferences=state.preferences||{};
 state.preferences.followed_categories=state.follows.category;
 state.preferences.followed_countries=state.follows.country;
 state.preferences.notify_categories=state.follows.category;
 state.preferences.notify_countries=state.follows.country;
 const {error}=await state.db.from("user_preferences").upsert({user_id:state.user.id,...state.preferences},{onConflict:"user_id"});
 if(error)console.warn("WRLDLINE preferences sync:",error.message);
}
// Delivery is centralized in notification-dispatch and the owner-bound Service
// Worker. Realtime continues to refresh the feed, never duplicates notifications.
function notifyForArticle(_article){}
async function toggleFollow(type,value){
 if(!state.user||!["category","country"].includes(type))return;
 const exists=state.follows[type].includes(value);
 const result=exists?await state.db.from("user_follows").delete().eq("user_id",state.user.id).eq("target_type",type).eq("target_value",value):await state.db.from("user_follows").insert({user_id:state.user.id,target_type:type,target_value:value});
 if(result.error){showToast(ui("تعذر حفظ المتابعة: ","Could not save follow: ")+result.error.message);return;}
 state.follows[type]=exists?state.follows[type].filter(x=>x!==value):[...state.follows[type],value];
 await savePreferenceArrays();
 window.WRLDLINE_ANALYTICS?.track("engagement",{action:"follow",category:type==="category"?value:"world"});
 renderFollowPanel();if(state.followOnly)applyFilters();showToast(exists?ui("تم إلغاء المتابعة","Unfollowed"):ui("تمت إضافة المتابعة","Added to following"));
}
function updateFollowToggle(){
 const el=document.getElementById("followFeedButton");el.classList.toggle("active",state.followOnly);el.setAttribute("aria-pressed",String(state.followOnly));
}
function updateCategoryControls(){
 const cat=state.category;
 document.querySelectorAll("button[data-category],a.nav-link[data-category]").forEach(el=>{
  const active=el.dataset.category===cat;
  el.classList.toggle(el.matches("a")?"is-active":"active",active);
  if(el.matches("button"))el.setAttribute("aria-pressed",String(active));
  else if(active)el.setAttribute("aria-current",cat==="all"?"page":"location");
  else el.removeAttribute("aria-current");
 });
 document.getElementById("feedTitle").textContent=cat==="all"?ui("أحدث الأخبار","Latest news"):categoryName(cat);
 document.dispatchEvent(new CustomEvent("wrldline:category",{detail:{category:cat}}));
}
function selectCategory(cat,jump=false){
 state.category=cat;state.limit=PAGE_SIZE;state.pageStatus="";
 syncEditionURL(jump);
 updateCategoryControls();applyFilters();
 if(jump){const feed=document.getElementById("newsSection");feed.focus({preventScroll:true});feed.scrollIntoView();}
}
function syncEditionURL(jump=true){
 const url=new URL(location.href);
 for(const [key,defaultValue] of [["category","all"],["country","all"],["format","all"],["sort","newest"]]){
  if(state[key]===defaultValue)url.searchParams.delete(key);else url.searchParams.set(key,state[key]);
 }
 if(jump||editionHasFilters())url.hash="newsSection";
 try{history.replaceState(history.state,"",url);}catch{}
}
function resetEditionFilters(jump){
 state.country="all";state.format="all";state.sort="newest";state.followOnly=false;
 populateCountries();updateReaderLabels();updateFollowToggle();selectCategory("all",jump);
}
function editionHasFilters(){
 return state.category!=="all"||state.country!=="all"||state.format!=="all"||state.sort!=="newest"||state.followOnly;
}
function updateReaderLabels(){
 const strings={
  clearEditionFilters:ui("مسح التصفية","Clear filters"),
  feedRefreshButton:ui("تحديث الأخبار","Refresh news"),
  searchScope:ui("البحث ضمن الأخبار المحمّلة في هذه الصفحة.","Search covers the stories loaded on this page.")
 };
 Object.assign(strings,{
  missedNewsHeading:ui("أخبار فاتتك","Missed stories"),
  missedNewsDescription:ui("أخبار عاجلة أو حصرية من آخر 24 ساعة لم تظهر في الدفعة الأولى من الموجز.","Breaking or exclusive stories from the past 24 hours that did not appear in the first feed batch."),
  breakingHeading:ui("الأخبار العاجلة","Breaking news"),
  exclusiveHeading:ui("الأخبار الحصرية","Exclusive stories"),
  exclusiveDescription:ui("ما يضعه الناشرون بوسم الحصرية صراحة، بعد التحقق التحريري.","Stories explicitly marked as exclusive by their publishers, subject to editorial checks."),
  popularStoriesHeading:ui("الأكثر قراءة","Most read"),
  popularStoriesDescription:ui("قصص قرأها ثلاثة قراء مختلفين على الأقل خلال آخر 7 أيام. لا نستخدم المشاهدات التجريبية أو بيانات الأفراد في الترتيب.","Stories read by at least three distinct readers in the past seven days. Test views and personal data aren’t used in ranking."),
  popularStoriesWindow:ui("آخر 7 أيام","Past 7 days")
 });
 for(const [id,label] of Object.entries(strings)){
  const el=document.getElementById(id);if(el)el.textContent=label;
 }
 const format=document.getElementById("formatFilter");
 format.setAttribute("aria-label",ui("صيغة المحتوى","Story format"));
 updateEditionSelect(format,[["all",ui("كل الصيغ","All formats")],...window.WLDiscovery.formats.map(kind=>[kind,contentKindLabel(kind)])],state.format);
 const sort=document.getElementById("sortFilter");
 sort.setAttribute("aria-label",ui("ترتيب الأخبار","Story order"));
 updateEditionSelect(sort,[["newest",ui("الأحدث أولاً","Newest first")],["oldest",ui("الأقدم أولاً","Oldest first")]],state.sort);
 document.getElementById("countryFilter").setAttribute("aria-label",ui("دولة الحدث","Event country"));
 document.getElementById("searchInput").placeholder=ui("عنوان، موضوع، دولة أو مصدر…","Headline, topic, country or source…");
 document.getElementById("searchOverlay").setAttribute("aria-label",ui("البحث في الأخبار","Search news"));
}
function applyFilters(){
 document.getElementById("clearEditionFilters").hidden=!editionHasFilters();
 if(!state.before)return;
 state.filtered=window.WLDiscovery.filter(state.feedArticles,state);
 renderFeed();
}
function renderFeedMeta(){
 const count=document.getElementById("feedResultCount"),updated=document.getElementById("lastUpdated");
 const fmt=new Intl.NumberFormat(state.lang==="ar"?"ar-SA":"en-US");
 count.textContent=state.before?ui(
  "المعروض: "+fmt.format(Math.min(state.limit,state.filtered.length))+" من "+fmt.format(state.filtered.length)+" نتيجة محمّلة",
  "Showing "+fmt.format(Math.min(state.limit,state.filtered.length))+" of "+fmt.format(state.filtered.length)+" loaded matches"):"";
 if(!state.before){
  updated.textContent=state.feedStatus==="error"?ui("تعذر التحديث","Update unavailable"):ui("بانتظار التحديث","Waiting for news");
  return;
 }
 const freshness=state.feedFreshness;
 const latest=freshness.newest===null
  ? (freshness.status==="empty"?ui("الموجز لا يحتوي على مواد","The feed contains no stories"):ui("تاريخ أحدث نشر غير متاح","Latest publication date unavailable"))
  : ui("أحدث مادة في الموجز: ","Latest story in the feed: ")+formatDate(freshness.newest);
 const stale=state.feedStatus==="stale"?ui("تعذر التحديث؛ نعرض آخر نسخة. ","Refresh failed; showing last loaded news. "):"";
 const quiet=freshness.status==="quiet"?ui("لا مواد جديدة في آخر ٦ ساعات. ","No new stories in the past 6 hours. "):"";
 updated.textContent=stale+quiet+latest+" · "+ui("آخر تحميل ناجح: ","Last successful load: ")+formatDate(state.loadedAt);
}
function renderCoveragePulse(){
 const host=document.getElementById("coveragePulseGrid");if(!host)return;
 const since=Date.now()-24*60*60*1000;
 const recent=state.frontPageArticles.filter(a=>!a.isNewsDataOnly&&(()=>{const t=Date.parse(a.published_at||"");return Number.isFinite(t)&&t<=Date.now()&&t>=since;})());
 const counts=new Map();recent.forEach(a=>counts.set(a.cat,(counts.get(a.cat)||0)+1));
 const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3);
 if(!ranked.length){host.innerHTML='<div class="wl-empty">لا توجد بيانات كافية لعرض نبض التغطية بعد.</div>';return;}
 const total=recent.length;
 host.innerHTML='<div class="pulse-card" style="background:var(--navy);color:#fff"><strong style="font-family:var(--font-latin);font-size:28px;line-height:1">'+total+'</strong><div class="pulse-bar" style="background:#ffffff22"><i style="width:100%;background:#d9b878"></i></div><small style="color:#a9b7c8">خبراً خلال 24 ساعة</small></div>'+
 ranked.map(([cat,count],i)=>'<button type="button" class="pulse-card" data-pulse-category="'+escapeHTML(cat)+'"><strong>'+escapeHTML(categoryName(cat))+'</strong><div class="pulse-bar"><i style="width:'+Math.max(10,Math.round(count/Math.max(1,ranked[0][1])*100))+'%"></i></div><small>'+count+' خبر · المرتبة '+(i+1)+'</small></button>').join("");
}
function imageMarkup(article,cls=""){
 if(!article.img||article.img==="#")return '<div class="image-placeholder '+cls+'"><span>'+escapeHTML(categoryName(article.cat||article.category))+'</span></div>';
 if(article.mediaType==="video")return '<video class="'+cls+'" src="'+escapeHTML(article.img)+'" muted playsinline preload="metadata"></video>';
 const loading=cls==="lead-image"?'fetchpriority="high"':'loading="lazy"';
 return '<img class="'+cls+'" src="'+escapeHTML(article.img)+'" alt="" '+loading+' decoding="async" referrerpolicy="no-referrer" onerror="handleImageError(this)">';
}
function handleImageError(img){if(!img||img.dataset.failed)return;img.dataset.failed="1";img.style.display="none";img.closest(".lead-story")?.classList.add("lead-story--text");const placeholder=document.createElement("div");placeholder.className="image-placeholder "+(img.className||"");placeholder.textContent="WRLDLINE";img.parentNode?.insertBefore(placeholder,img);}
function articleMediaMarkup(article){
 if(!article.img||article.img==="#")return "";
 if(article.mediaType==="video")return '<video class="modal-image" src="'+escapeHTML(article.img)+'" controls playsinline preload="metadata"></video>';
 return imageMarkup(article,"modal-image");
}
function cardExcerpt(value,max=420){
 const text=String(value||"");
 if(text.length<=max)return text;
 const prefix=text.slice(0,max).replace(/[\uD800-\uDBFF]$/u,"");
 const boundary=prefix.lastIndexOf(" ");
 return (boundary>max*.8?prefix.slice(0,boundary):prefix).trimEnd()+"…";
}
function wlReadingTime(a){
 const text=String((a.title||'')+' '+(a.summary||'')+' '+(a.aiSummary||'')).trim();
 const words=text.split(/\s+/).filter(Boolean).length;
 const mins=Math.max(1,Math.round(words/180));
 const number=new Intl.NumberFormat(state.lang==="ar"?"ar-SA":"en").format(mins);
 const isExcerpt=window.WLPublicArticleBody?.mayBeClipped(a.summary);
 return number+(isExcerpt?"+":"")+ui(" د"," min");
}
function wlSaveMarkup(a){
 const saved=state.saved.has(a.id);
 return '<button class="card-save '+(saved?'is-saved':'')+'" type="button" data-save="'+escapeHTML(a.id)+'" aria-label="'+(saved?'إزالة من المحفوظات':'حفظ الخبر')+'" aria-pressed="'+saved+'"><svg viewBox="0 0 24 24" fill="'+(saved?'currentColor':'none')+'" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/></svg></button>';
}
function wlCardMeta(a){
 return '<div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(a.cat))+'</span>'+typeBadgesMarkup(a)+articleCountryMarkup(a)+'<span class="read-time">'+wlReadingTime(a)+'</span>'+wlSaveMarkup(a)+'</div>';
}
function articleCountryMarkup(a){
 const country=window.WLEditorial.countryName(a.eventCountryCode,state.lang);
 return country?'<span class="story-country">'+escapeHTML(country)+'</span>':"";
}
function placeFeedChildren(host,nodes){
 for(let i=0;i<nodes.length;i++)if(host.children[i]!==nodes[i])host.insertBefore(nodes[i],host.children[i]||null);
 while(host.children.length>nodes.length)host.lastElementChild.remove();
}
function renderEventStack(prior,dossier,items,cardFor){
 const el=prior||document.createElement("section");
 if(!prior){
  el.className="event-stack";
  el.dataset.eventSlug=dossier.slug;
  el.dataset.languageManaged="";
  el.setAttribute("aria-labelledby","event-title-"+dossier.slug);
  el.innerHTML='<div class="event-stack-head"><div><span class="content-badge"></span><h3></h3></div><a class="event-stack-link" hreflang="ar"></a></div><details><summary></summary><div class="event-stack-items"></div></details>';
  el.querySelector("h3").id="event-title-"+dossier.slug;
  el.querySelector(".event-stack-link").href="/dossier/"+encodeURIComponent(dossier.slug)+".html";
 }
 el.querySelector("h3").textContent=dossier.title[state.lang];
 el.querySelector(".content-badge").textContent=eventDesk.label("dossier",state.lang);
 el.querySelector("a").textContent=ui("افتح ملف الحدث ↗","Open the dossier (Arabic) ↗");
 const count=new Intl.NumberFormat(state.lang==="ar"?"ar-SA":"en").format(items.length);
 el.querySelector("summary").textContent=ui("عرض التغطية المرتبطة ("+count+")","Show related coverage ("+count+")");
 placeFeedChildren(el.querySelector(".event-stack-items"),items.map(cardFor));
 return el;
}
function renderFeed(){
 const host=document.getElementById("newsGrid"),items=state.filtered.slice(0,state.limit);
 if(!host||!state.before)return;
 host.setAttribute("aria-busy","false");
 if(!items.length){
  const filtered=editionHasFilters();
  host.innerHTML='<div class="wl-empty reader-failure"><strong>'+ui("لا توجد نتائج في الأخبار المحمّلة","No matches in the loaded stories")+'</strong><p>'+ui("يمكنك تغيير التصفية أو تحميل أخبار أقدم إن توفرت.","Change the filters or load older stories if available.")+'</p>'+(filtered?'<button class="outline-button" type="button" data-reader-action="reset">'+ui("مسح التصفية","Clear filters")+'</button>':'')+'</div>';
 }else{
  // Keep already rendered cards mounted when adding stories. This preserves
  // image loads, expanded translations and focus across pagination.
  const existing=new Map([...host.querySelectorAll(".reader-card")].map(card=>[card.dataset.storyId,card]));
  const stacks=new Map([...host.querySelectorAll(":scope > .event-stack")].map(stack=>[stack.dataset.eventSlug,stack]));
  const cardFor=a=>{
   const prior=existing.get(a.id);
   if(prior&&prior.readerArticle===a)return prior;
   const template=document.createElement("template");
   const lang=escapeHTML(a.hasTranslation?state.lang:a.sourceLanguage);
   template.innerHTML='<article class="news-card reader-card content-card-'+a.contentType+'" data-content-type="'+a.contentType+'">'+imageMarkup(a,"card-image")+'<div class="card-content"><h3 lang="'+lang+'"><button class="reader-story-link" type="button" data-open="'+escapeHTML(a.id)+'" dir="auto">'+escapeHTML(a.title)+'</button></h3>'+wlCardMeta(a)+'<p lang="'+lang+'" dir="auto">'+escapeHTML(cardExcerpt(a.summary))+'</p>'+newsDataMetaMarkup(a)+sourceLineMarkup(a)+(a.correctionNote?'<span class="correction-chip">'+ui("تم التصحيح","Corrected")+'</span>':'')+'</div></article>';
   const card=template.content.firstElementChild;
   card.dataset.storyId=a.id;card.readerArticle=a;
   return card;
  };
  const blocks=!editionHasFilters()&&eventCatalog.length?eventDesk.group(items,eventCatalog):items.map(item=>({item}));
  placeFeedChildren(host,blocks.map(block=>block.dossier?renderEventStack(stacks.get(block.dossier.slug),block.dossier,block.items,cardFor):cardFor(block.item)));
 }
 renderFeedMeta();renderPageControls();
}
function renderMissedStories(){
 const host=document.getElementById("missedNewsGrid");if(!host)return;
 const firstBatch=normalizeHomeRows(state.feedRows.slice(0,MAIN_FEED_LIMIT));
 const supplementalIds=new Set(state.extraRows.map(row=>String(row?.id)));
 const before=Date.parse(state.before);
 const pool=state.frontPageArticles.filter(a=>{
  const age=before-Date.parse(a.published_at);
  return supplementalIds.has(a.id)&&(a.isBreaking||a.isExclusive)&&!a.isNewsDataOnly&&(state.lang==="en"||/[\u0600-\u06FF]/.test(a.title||""))&&
   !["sports","culture","entertainment"].includes(a.cat)&&age>=0&&age<=24*60*60*1000;
 });
 const all=window.WLDiscovery.dedupe(pool,firstBatch),items=all.slice(0,state.missedLimit||8);
 const failed=supplemental.breaking.status==="error"||supplemental.exclusive.status==="error";
 const awaiting=supplemental.breaking.status==="loading"||supplemental.exclusive.status==="loading";
 const partial=failed?ui("بعض أقسام التغطية لم تُحمّل. قد لا تكون هذه القائمة مكتملة.","Some coverage could not load. This list may be incomplete."):"";
 const count=document.getElementById("missedNewsCount");
 if(count)count.textContent=!all.length&&(failed||awaiting)?"—":new Intl.NumberFormat(state.lang).format(all.length);
 const more=document.getElementById("missedLoadMoreButton");
 if(more){more.hidden=items.length>=all.length;more.textContent=ui("عرض المزيد","Show more");}
 if(!items.length){host.innerHTML='<div class="wl-empty">'+(failed?partial:awaiting?ui("جارٍ تحميل التغطية الإضافية…","Loading additional coverage…"):ui("لا توجد أخبار إضافية في الدفعات المحمّلة.","No additional stories in the loaded batches."))+'</div>';return;}
 host.innerHTML=(failed?'<p class="wl-empty">'+partial+'</p>':'')+items.map(a=>'<article class="news-card missed-news-card content-card-'+a.contentType+'"><div class="card-open" role="button" tabindex="0" data-open="'+escapeHTML(a.id)+'">'+imageMarkup(a,"card-image")+'<div class="card-content"><div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(a.cat))+'</span>'+articleCountryMarkup(a)+'<span class="read-time">'+wlReadingTime(a)+'</span>'+wlSaveMarkup(a)+'</div><h3>'+escapeHTML(a.title)+'</h3>'+sourceLineMarkup(a)+'</div></div></article>').join("");
 host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));
 host.querySelectorAll("[data-save]").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();toggleSaved(el.dataset.save);}));
}
function renderPopularStories(rows){
 const host=document.getElementById("popularStoriesGrid");
 if(!host)return;
 const items=dedupeArticles(normalizeHomeRows(rows));
 const status=supplemental.popular.status;
 renderSupplementalNotice("popular",!!items.length);
 if(!items.length){
  host.innerHTML=status==="error"?'':'<p class="wl-popular-empty">'+(status==="loading"?ui("جارٍ تحميل القصص الأكثر قراءة…","Loading most-read stories…"):ui("لا توجد بيانات قراءة كافية بعد.","Not enough reading data yet."))+'</p>';
  return;
 }
 host.innerHTML=items.slice(0,5).map((a,index)=>'<button type="button" class="wl-popular-item" data-open="'+escapeHTML(a.id)+'"><span class="wl-popular-rank">'+String(index+1).padStart(2,"0")+'</span><span class="wl-popular-copy"><strong>'+escapeHTML(a.title)+'</strong><small>'+escapeHTML(categoryName(a.cat))+' · '+escapeHTML(a.src||"WRLDLINE")+' · '+escapeHTML(timeAgo(a.published_at))+'</small></span><span class="wl-popular-arrow" aria-hidden="true">←</span></button>').join("");
 host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));
}
function renderExclusive(){
 const host=document.getElementById("exclusiveNewsGrid");if(!host)return;
 const feedRows=Array.isArray(supplemental.exclusive.rows)?supplemental.exclusive.rows.map(normalizeArticle).filter(a=>a.title):[];
 const pool=feedRows.length?feedRows:state.frontPageArticles.filter(a=>!a.isNewsDataOnly&&a.isExclusive);
 const items=pool.slice().sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at)).slice(0,6);
 const count=document.getElementById("exclusiveCount");
 const status=supplemental.exclusive.status;
 renderSupplementalNotice("exclusive",!!items.length);
 if(count)count.textContent=!items.length&&status!=="ready"?"—":new Intl.NumberFormat(state.lang).format(items.length);
 if(!items.length){host.innerHTML=status==="error"?'':'<div class="exclusive-empty">'+(status==="loading"?ui("جارٍ تحميل الأخبار الحصرية…","Loading exclusive stories…"):ui("لا توجد أخبار حصرية منشورة الآن.","No exclusive stories are published right now."))+'</div>';return;}
 host.innerHTML=items.map(a=>'<article class="news-card exclusive-news-card content-card-'+a.contentType+'"><span class="exclusive-tag">'+ui("حصري لدى المصدر","Publisher exclusive")+'</span><div class="card-open" role="button" tabindex="0" data-open="'+escapeHTML(a.id)+'">'+imageMarkup(a,"card-image")+'<div class="card-content"><div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(a.cat))+'</span>'+typeBadgesMarkup(a)+'<span class="read-time">'+wlReadingTime(a)+'</span>'+wlSaveMarkup(a)+'</div><h3>'+escapeHTML(a.title)+'</h3><p>'+escapeHTML(a.summary)+'</p>'+sourceLineMarkup(a)+'</div></div></article>').join("");
 host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));
 host.querySelectorAll("[data-save]").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();toggleSaved(el.dataset.save);}));
}
function initNewsRealtime(){
 // Avoid broad Postgres Changes subscriptions on the 80k-row public articles table.
 // They force Realtime to evaluate row visibility and can saturate the small database.
 // Public news is refreshed on initial load and by the reader's explicit refresh action.
 return;
 }
function isDedicatedBreakingSource(name){
 const source=String(name||"").trim().toLocaleLowerCase();
 return /breaking desk|news alert|غرفة الأخبار العاجلة|مصادر العاجل/.test(source);
}
const BREAKING_HEADLINE_NOISE=/^(?:مختص|استشاري|باحث|أكاديمي|خبير|محلل|محام|الأرصاد|طقس|موجز الصباح|التقويم الدراسي|دوري|مباراة|الأهلي|الهلال|النصر|الشباب|الاتحاد|يستعرض العلاقات|يثمن جهود|يدعو إلى|يؤكد ما يجب|فرص استثمارية)/i;
const BREAKING_EVENT_SIGNAL=/(?:عاجل\s*[|:،]|أعلن(?:ت|وا)?|يعلن|يعلنون|اعتراض|إسقاط|تدمير|قصف|غارة|هجوم|هجمات|إطلاق نار|انفجار|حريق|اشتباك|مقتل|وفاة|إصابة|جرحى|اعتقال|ضبط|إحباط|سقوط|تحطم|إغلاق|إخلاء|استقالة|تعيين|عقوبات|زلزال|فيضانات|طائرة مسيرة|صاروخ|سفينة|ناقلة)/i;
function isLikelyBreakingArticle(a){
 const title=String(a?.title||"").replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,"").trim();
 if(!title||BREAKING_HEADLINE_NOISE.test(title))return false;
 return BREAKING_EVENT_SIGNAL.test(title);
}
function breakingFingerprint(a){
 return String(a?.title||"").toLocaleLowerCase().replace(/https?:\/\/\S+/g," ").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
}
function breakingItems(maxAge=15*60*1000,ageField="published_at"){
 const now=Date.now(), seen=new Set();
 return state.frontPageArticles.filter(a=>{
  if(a.isNewsDataOnly||a.isBreaking!==true)return false;
   if(!isDedicatedBreakingSource(a.raw?.source_name||a.src))return false;
  if(!/[\u0600-\u06FF]/.test(a.title||""))return false;
  if(!isLikelyBreakingArticle(a))return false;
  if(/مباراة|الدوري|مانشستر|تشيلسي|ريال مدريد|برشلونة|مباشر|بث مباشر|ملخص|هدف|sports|sport/i.test(a.title||""))return false;
  const sourceUrl=String(a.sourceURL||a.raw?.source_url||"");
  if(/t\.me|telegram\.me|telegram/i.test(sourceUrl))return false;
  const timestamp=ageField==="received_at"?(a.raw?.received_at||a.published_at):a.published_at;
  const date=Date.parse(timestamp||""),age=now-date;
  if(!Number.isFinite(date)||age<-60*1000||age>maxAge)return false;
  const fp=breakingFingerprint(a);
  if(!fp||seen.has(fp))return false;
  seen.add(fp);return true;
 }).sort((a,b)=>Date.parse(b.published_at||0)-Date.parse(a.published_at||0));
}
function renderBreakingSection(){
 const host=document.getElementById("breakingNewsGrid");if(!host)return;
 if(!state.before&&state.feedStatus==="error")return;
 const items=breakingItems(15*60*1000,"published_at"),count=document.getElementById("breakingCount");
 const status=supplemental.breaking.status;
 renderSupplementalNotice("breaking",!!items.length);
 if(count)count.textContent=!items.length&&status!=="ready"?"—":ui("آخر 15 دقيقة","Past 15 minutes");
 if(!items.length){host.innerHTML=status==="error"?'':'<div class="breaking-empty">'+(status==="loading"?ui("جارٍ تحميل غرفة العاجل…","Loading breaking news…"):ui("لا أخبار عاجلة في الدفعات المحمّلة خلال آخر 15 دقيقة.","No breaking stories from the past 15 minutes in the loaded batches."))+'</div>';return;}
 host.innerHTML=items.slice(0,6).map(a=>'<article class="breaking-news-card content-card-'+a.contentType+'" data-content-type="'+a.contentType+'" role="button" tabindex="0" data-open="'+escapeHTML(a.id)+'">'+imageMarkup(a,"breaking-news-image")+'<div class="breaking-news-copy"><div class="story-meta"><span class="breaking-badge">عاجل</span>'+contentBadgeMarkup(a)+'<span>'+escapeHTML(categoryName(a.cat))+'</span><span class="read-time">'+timeAgo(a.published_at)+'</span></div><h3>'+escapeHTML(a.title)+'</h3><p>'+escapeHTML(a.summary)+'</p>'+sourceLineMarkup(a,"breaking-source")+'</div></article>').join("");
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
 const items=breakingItems(15*60*1000,"published_at");renderBreakingSection();
 const strip=document.getElementById("breakingStrip"),title=document.getElementById("breakingText"),time=document.getElementById("breakingTime");
 if(!strip||!title)return;
 const marquee=title.querySelector(".breaking-marquee")||title;
 if(!items.length){state.breakingTickerIndex=0;state.breakingTickerCurrentId=null;strip.hidden=true;strip.removeAttribute("dir");marquee.textContent="";marquee.classList.remove("is-moving","is-ltr","is-rtl");delete marquee.dataset.articleId;delete marquee.dataset.articleTitle;title.removeAttribute("title");if(time)time.textContent="";return;}
 let item=items.find(a=>a.id===state.breakingTickerCurrentId);
 if(!item){state.breakingTickerIndex=0;item=items[0];state.breakingTickerCurrentId=item.id;}
 state.breakingTickerIndex=Math.max(0,items.findIndex(a=>a.id===item.id));strip.hidden=false;
 if(marquee.dataset.articleId!==item.id||marquee.dataset.articleTitle!==String(item.title||"")){
  const cleanTitle=String(item.title||"").replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,"").normalize("NFC").trim();
  const isRTL=/[\u0590-\u08FF]/.test(cleanTitle),direction=isRTL?"rtl":"ltr";
  marquee.textContent=cleanTitle;marquee.dataset.articleId=item.id;marquee.dataset.articleTitle=String(item.title||"");
  marquee.classList.remove("is-moving","is-ltr","is-rtl");strip.setAttribute("dir",direction);strip.style.direction=direction;title.setAttribute("dir",direction);title.style.direction=direction;title.style.textAlign=isRTL?"right":"left";
  marquee.setAttribute("dir",direction);marquee.style.direction=direction;marquee.style.unicodeBidi="isolate";
  marquee.classList.add(isRTL?"is-rtl":"is-ltr");marquee.style.removeProperty("--breaking-duration");
  requestAnimationFrame(()=>{const viewportWidth=title.clientWidth,distance=Math.max(viewportWidth,marquee.scrollWidth)+viewportWidth;marquee.style.setProperty("--breaking-duration",Math.max(10,distance/55)+"s");marquee.classList.add("is-moving");});
  marquee.onanimationend=()=>{if(breakingItems().length>1)rotateBreaking();else{marquee.classList.remove("is-moving");requestAnimationFrame(()=>marquee.classList.add("is-moving"));}};
 }
 title.title=ui("عاجل خلال آخر 15 دقيقة — الأحدث أولاً","Breaking in the last 15 minutes — newest first");if(time)time.textContent=ui("عاجل · ","Breaking · ")+timeAgo(item.published_at);
}
function publicArticleURL(article){
 const id=String(article?.id||"");
 const status=article?.editorialStatus||article?.raw?.editorial_status;
 return status==="published"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)?"https://al-ghaib.us.ci/news/"+id.toLowerCase():"";
}
function renderRelatedCoverage(host, current){
 const related=window.WLDiscovery.related(state.articles,current);
 const actions=host.querySelector(".article-actions");
 const country=window.WLEditorial.countryName(current.eventCountryCode,state.lang);
 const dossier=eventDesk?.match(current,eventCatalog);
 if(!actions||(!related.length&&!country&&!dossier))return;
 const section=document.createElement("section");
 section.className="edition-related";
 section.setAttribute("aria-labelledby","editionRelatedTitle");
 const title=document.createElement("h2");
 title.id="editionRelatedTitle";
 title.textContent=ui("تابع التغطية","Continue exploring");
 section.append(title);
 if(dossier){
  const link=document.createElement("a");
  link.href="/dossier/"+encodeURIComponent(dossier.slug)+".html";link.hreflang="ar";
  link.textContent=ui("افتح ملف الحدث: ","Open the event dossier (Arabic): ")+dossier.title[state.lang];
  section.append(link);
 }
 if(related.length){
  const list=document.createElement("ul");
  for(const article of related){
   const row=document.createElement("li"), button=document.createElement("button"), heading=document.createElement("strong"), metadata=document.createElement("small");
   button.type="button";heading.dir="auto";heading.textContent=article.title;
   metadata.textContent=[categoryName(article.cat),window.WLEditorial.countryName(article.eventCountryCode,state.lang),article.src].filter(Boolean).join(" · ");
   button.append(heading,metadata);
   button.addEventListener("click",()=>openArticle(article.id));
   row.append(button);list.append(row);
  }
  section.append(list);
 }
 if(country){
  const link=document.createElement("a");
  link.href="map.html?country="+encodeURIComponent(current.eventCountryCode)+"&lang="+state.lang;
  link.textContent=ui("افتح مرصد العالم: ","Open World Monitor: ")+country;
  section.append(link);
 }
 actions.after(section);
}
function openArticle(id,updateUrl=true,returnFocus){
 const a=state.articleById?.get(id)||state.articles.find(x=>x.id===id);if(!a)return;
 const socialURL=encodeURIComponent(publicArticleURL(a)||("https://al-ghaib.us.ci/news/"+a.id));
 const socialTitle=encodeURIComponent(a.title||"WRLDLINE");
 const socialCaption=encodeURIComponent((a.title||"WRLDLINE")+" — "+cardExcerpt(a.summary,320));
 const socialMarkup='<a class="outline-button" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text='+socialCaption+'%20'+socialURL+'">WhatsApp</a><a class="outline-button" target="_blank" rel="noopener noreferrer" href="https://twitter.com/intent/tweet?text='+socialTitle+'&url='+socialURL+'">X</a><a class="outline-button" target="_blank" rel="noopener noreferrer" href="https://t.me/share/url?url='+socialURL+'&text='+socialTitle+'">Telegram</a>';
 if(updateUrl){const url=new URL(location.href);url.searchParams.set("article",id);try{history.pushState({article:id},"",url);}catch{}}
 track("view_article",{article_id:a.id,content_type:a.contentType,category:a.cat,source_domain:sourceDomain(a.sourceURL),has_source_link:!!a.sourceURL});
 const host=document.getElementById("modalContent");
 host.articleEditions?.stop();
 host.dataset.languageManaged="";
 const published=publicationISO(a), media=articleMediaMarkup(a);
 let largeText=false;
 try{largeText=localStorage.getItem("wrldline:article-large-text")==="1";}catch{}
 host.classList.add("reader-article");
 host.classList.toggle("reader-text-large",largeText);
 host.closest("dialog").classList.add("article-reading-mode");
 host.innerHTML='<div class="reader-topbar"><span class="reader-wordmark" lang="en">WRLDLINE</span><div class="reader-top-actions">'+
  '<button class="reader-tool" id="readerTextSize" type="button" aria-label="'+ui("تكبير نص الخبر","Enlarge article text")+'" aria-pressed="'+largeText+'"><span aria-hidden="true">'+ui("أ+","A+")+'</span></button>'+
  '<button class="reader-tool reader-close" id="modalClose" type="button"><span aria-hidden="true">×</span><span>'+ui("إغلاق","Close")+'</span></button></div></div>'+
  '<div class="modal-article-body"><header class="reader-article-header"><div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(a.cat))+'</span>'+
  typeBadgesMarkup(a)+articleCountryMarkup(a)+'</div><h1 dir="auto">'+escapeHTML(a.title)+'</h1><div class="reader-byline">'+
  '<span dir="auto">'+escapeHTML(a.src)+'</span>'+(published?'<time datetime="'+escapeHTML(published)+'" aria-label="'+ui("تاريخ النشر: ","Published: ")+escapeHTML(formatDate(published))+'">'+escapeHTML(formatDate(published))+'</time>':'')+
  '</div></header>'+(media?'<figure class="reader-article-media">'+media+'</figure>':'')+
  correctionMarkup(a)+'<div class="reader-article-editions"></div><div class="modal-summary reader-prose"></div>'+newsDataMetaMarkup(a)+
  (a.newsdataAiSummary?'<section class="ai-insight"><strong>NewsData.io AI</strong><p>'+escapeHTML(a.newsdataAiSummary)+'</p></section>':'')+
  (a.aiSummary?'<section class="ai-insight"><strong>'+ui("تحليل WRLDLINE AI","WRLDLINE AI analysis")+'</strong><p>'+escapeHTML(a.aiSummary)+'</p><small>'+ui("مؤشر الحدث: ","Event risk: ")+escapeHTML(riskLabel(a.aiRiskLevel))+' · '+escapeHTML(a.aiRiskScore)+'/100</small></section>':'')+
  (state.lang==="ar"&&a.aiReaderImpact?'<section class="ai-impact"><h3>وش يعني لك؟</h3><p>'+escapeHTML(a.aiReaderImpact)+'</p><small>قراءة آلية مساعدة مبنية على نص الخبر، وليست تحققاً بشرياً أو نصيحة مالية.</small></section>':'')+
  (state.lang==="ar"&&a.aiWatchNext?'<section class="ai-impact ai-impact--watch"><h3>ما الذي نراقبه تالياً؟</h3><p>'+escapeHTML(a.aiWatchNext)+'</p></section>':'')+
  sourceBoxMarkup(a)+'<p class="disclaimer"><span data-edition-disclosure>'+escapeHTML(provenanceNote(a))+'</span> <a href="'+ui("corrections.html","corrections-en.html")+'">'+ui("سياسة التصحيح","Corrections policy")+'</a>.</p>'+
  '<div class="article-actions"><button class="outline-button" id="modalListen" type="button">♫ '+ui("استمع للخبر","Listen to story")+'</button>'+
  '<button class="outline-button" id="modalShare" type="button">↗ '+ui("مشاركة الخبر","Share story")+'</button>'+
  '<button class="outline-button" id="modalSave">'+(state.saved.has(a.id)?ui("★ إزالة من المحفوظات","★ Remove saved"):ui("☆ حفظ الخبر","☆ Save story"))+'</button>'+
  socialMarkup+'</div></div>';
 const prose=host.querySelector(".reader-prose");
 const options={lang:a.sourceLanguage,editorial:/WRLDLINE/i.test(a.src||"")};
 let viewed=a;
 const publicURL=publicArticleURL(a), editions=window.WLArticleEditions;
 if(publicURL){
  const correction=new URLSearchParams({topic:"correction",article:String(a.id).toLowerCase(),lang:state.lang==="en"?"en":"ar"});
  host.querySelector(".article-actions")?.insertAdjacentHTML("beforeend",
   '<a class="outline-button" data-edition-permalink href="'+escapeHTML(publicURL)+'">↗ '+ui("فتح صفحة الخبر المستقلة","Open article page")+'</a>'+
   '<a class="outline-button" data-article-correction href="/contact.html?'+escapeHTML(correction.toString())+'#form">'+ui("أبلغ عن خطأ","Report an error")+'</a>');
 }
 if(options.lang)prose.lang=options.lang;
 if(editions)host.articleEditions=editions.mount({
  host:prose,tools:host.querySelector(".reader-article-editions"),heading:host.querySelector("h1"),
  id:a.id,title:a.originalTitle||a.title,body:a.originalSummary||(!a.hasTranslation?a.summary:""),lang:a.sourceLanguage,
  editorial:options.editorial,published:!!publicURL,uiLang:state.lang,preferred:state.lang,
  clip:window.WLPublicArticleBody?.mayBeClipped(a.originalSummary),
  onView(version){
   viewed={...a,title:version.title,summary:version.body,readingLang:version.lang,hasTranslation:!!version.editorialEdition,translationStatus:"published",translationSource:"editorial"};
   const disclosure=host.querySelector("[data-edition-disclosure]");
   if(disclosure)disclosure.textContent=options.editorial&&version.complete&&!version.editorialEdition?ui("النص الكامل كما نشرته هيئة تحرير WRLDLINE.","Full article as published by WRLDLINE."):provenanceNote(viewed);
   const permalink=host.querySelector("[data-edition-permalink]");
   if(permalink)permalink.href=version.editorialEdition?editions.link(publicURL,version.lang):publicURL;
   const social=host.querySelectorAll(".article-actions a[target='_blank']");
   const url=encodeURIComponent(permalink?.href||publicURL), title=encodeURIComponent(version.title), caption=encodeURIComponent(version.title+" · "+cardExcerpt(version.body,320));
   if(social.length===3&&publicURL){
    social[0].href="https://wa.me/?text="+caption+"%20"+url;
    social[1].href="https://twitter.com/intent/tweet?text="+title+"&url="+url;
    social[2].href="https://t.me/share/url?url="+url+"&text="+title;
   }
  }
 });
 else if(window.WLReaderProse)window.WLReaderProse.renderInto(prose,a.summary,options);
 else{prose.classList.add("is-plain");prose.dir="auto";prose.textContent=a.summary;}
 document.getElementById("modalClose").addEventListener("click",closeArticle);
 document.getElementById("readerTextSize").addEventListener("click",event=>{
  const selected=host.classList.toggle("reader-text-large");
  event.currentTarget.setAttribute("aria-pressed",String(selected));
  try{localStorage.setItem("wrldline:article-large-text",selected?"1":"0");}catch{}
 });
 document.getElementById("modalSave").addEventListener("click",()=>{toggleSaved(a.id);document.getElementById("modalSave").textContent=state.saved.has(a.id)?ui("★ إزالة من المحفوظات","★ Remove saved"):ui("☆ حفظ الخبر","☆ Save story");});
 document.getElementById("modalShare").addEventListener("click",()=>shareArticle(viewed,host.querySelector("[data-edition-permalink]")?.href));
 document.getElementById("modalListen").addEventListener("click",()=>playArticleAudio(viewed));
 renderRelatedCoverage(host,a);
 showModal("articleModal",returnFocus);
 try{document.dispatchEvent(new CustomEvent("wrldline:article-opened",{detail:{article:a}}));}catch(error){console.warn("WRLDLINE intelligence:",error);}
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
   body:JSON.stringify({text,language:window.WLArticleEditions?.locale(article.readingLang)||state.lang}),
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
function closeArticle(updateUrl=true){document.getElementById("modalContent")?.articleEditions?.stop();hideModal("articleModal");if(updateUrl&&new URLSearchParams(location.search).has("article")){const url=new URL(location.href);url.searchParams.delete("article");try{history.replaceState(null,"",url);}catch{}}}
async function shareArticle(article,url){if(window.WRLDLINE_SHARE){return window.WRLDLINE_SHARE.share({title:article.title,description:cardExcerpt(article.summary||article.aiSummary,320),category:categoryName(article.cat)+" · "+countryName(article.country,article.aiCountryCode),source:article.src,image:article.img||"",url:url||publicArticleURL(article)||"https://al-ghaib.us.ci/"});}showToast(ui("أداة المشاركة لم تجهز بعد. أعد المحاولة بعد لحظة.","Sharing is still loading. Please try again."));}
async function toggleSaved(id){
 const wasSaved=state.saved.has(id);
 if(state.user&&state.db){
  const result=wasSaved?await state.db.from("user_saved_articles").delete().eq("user_id",state.user.id).eq("article_id",id):await state.db.from("user_saved_articles").upsert({user_id:state.user.id,article_id:id},{onConflict:"user_id,article_id"});
  if(result.error){showToast("تعذر مزامنة المكتبة: "+result.error.message);return;}
 }
 wasSaved?state.saved.delete(id):state.saved.add(id);if(!state.user){wasSaved?state.pendingLocalSaved.delete(id):state.pendingLocalSaved.add(id);}persistSaved();updateSavedButtons();
 showToast(wasSaved?"أُزيل الخبر من مكتبتك":"أُضيف الخبر إلى مكتبتك");
}
async function showSaved(){
 let list=state.articles.filter(a=>state.saved.has(a.id));
 if(state.user&&state.db){
  const {data,error}=await state.db.from("user_saved_articles").select("article_id, article:articles(id,title,summary,category,country,event_country,source_scope,source_language,language_detection,source_name,url,source_url,published_at,received_at,lang,media_type,image_url,is_breaking,content_type,sponsor_name,sponsor_url,correction_note,corrected_at,editorial_status,ai_country_code,ai_summary,ai_risk_level,ai_risk_score,ai_confidence,is_exclusive,exclusive_type,exclusive_reason,exclusive_confidence,newsdata_article_id,newsdata_categories,newsdata_ai_tags,newsdata_sentiment,newsdata_ai_summary,newsdata_fetched_at,article_translations(lang,title,summary,ai_summary,translation_status,translation_source))").eq("user_id",state.user.id).order("created_at",{ascending:false});
  if(!error){list=(data||[]).map(row=>row.article).filter(row=>row&&!isTelegramArticle(row)).map(normalizeArticle).filter(a=>!BLOCKED_EDITORIAL_STATUSES.has(a.editorialStatus)&&!isLowQualityArticle(a));for(const a of list)if(!state.articles.some(x=>x.id===a.id))state.articles.push(a);}
  else showToast("تعذر تحميل المكتبة المتزامنة حالياً");
 }
 const host=document.getElementById("modalContent");
 host.classList.remove("reader-article","reader-text-large");
 host.closest("dialog").classList.remove("article-reading-mode");
 host.innerHTML='<button class="modal-close" id="modalClose" aria-label="إغلاق">×</button><div class="modal-article-body saved-view"><span class="section-kicker">مكتبتك الشخصية</span><h2>الأخبار المحفوظة</h2><p class="muted">'+(state.user?"مزامنة مع حسابك على جميع أجهزتك":"محفوظات هذا الجهاز فقط — سجّل الدخول للمزامنة")+'</p>'+(list.length?list.map(a=>'<div class="saved-row-wrap"><button class="saved-row" data-open="'+escapeHTML(a.id)+'"><strong>'+escapeHTML(a.title)+'</strong><small>'+escapeHTML(a.src)+' · '+escapeHTML(formatDate(a.published_at))+'</small></button>'+(a.sourceURL?'<a class="saved-source source-link" href="'+escapeHTML(a.sourceURL)+'" target="_blank" rel="noopener noreferrer" data-source-link data-article-id="'+escapeHTML(a.id)+'">'+ui("المصدر ↗","Source ↗")+'</a>':'<span class="source-missing">'+ui("المصدر غير متوفر","Source unavailable")+'</span>')+'<button class="saved-remove" type="button" data-remove-saved="'+escapeHTML(a.id)+'">'+ui("إزالة","Remove")+'</button></div>').join(""):'<p class="muted">لم تحفظ أي خبر بعد.</p>')+'</div>';
 document.getElementById("modalClose").addEventListener("click",closeArticle);
 host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));
 host.querySelectorAll("[data-remove-saved]").forEach(el=>el.addEventListener("click",async()=>{await toggleSaved(el.dataset.removeSaved);await showSaved();}));
 showModal("articleModal");
}
function updateSavedButtons(){
 document.querySelectorAll("button[data-save]").forEach(button=>{
  const saved=state.saved.has(button.dataset.save);
  button.classList.toggle("is-saved",saved);
  button.setAttribute("aria-pressed",String(saved));
  button.setAttribute("aria-label",saved?ui("إزالة من المحفوظات","Remove from saved"):ui("حفظ الخبر","Save story"));
  button.querySelector("svg")?.setAttribute("fill",saved?"currentColor":"none");
 });
}
function showModal(id,returnFocus){
 const el=document.getElementById(id);
 if(id==="articleModal")el.querySelector("h1, h2")?.setAttribute("id","readerModalTitle");
 if(!el.open){el.readerReturnFocus=returnFocus||document.activeElement;el.showModal();}
 el.classList.add("visible");document.body.classList.add("modal-open");
 el.querySelector(id==="articleModal"?"#modalClose":"#searchInput")?.focus({preventScroll:true});
 el.scrollTop=0;
}
function hideModal(id){
 const el=document.getElementById(id);
 if(!el.open)return;
 el.classList.remove("visible");el.close();document.body.classList.remove("modal-open");
 if(el.readerReturnFocus?.isConnected)el.readerReturnFocus.focus({preventScroll:true});
 el.readerReturnFocus=null;
}
function openSearch(){showModal("searchOverlay");renderSearch();}
function closeSearch(){hideModal("searchOverlay");}
function renderSearch(){
 const host=document.getElementById("searchResults"),status=document.getElementById("searchStatus");
 const q=window.WLDiscovery.normalize(state.query);
 if(!q||!state.before){
  status.textContent="";
  host.innerHTML='<p class="search-empty">'+(!q?ui("اكتب كلمة للبدء.","Type to begin."):state.feedStatus==="error"?ui("لم تُحمّل الأخبار. يمكنك الانتقال إلى الأرشيف.","The stories could not load. You can browse the archive instead."):ui("جارٍ تحميل الأخبار…","Loading news…"))+'</p>';return;
 }
 const {matches,count}=window.WLDiscovery.search(state.articles,q,a=>[
  categoryName(a.cat),window.WLEditorial.countryName(a.eventCountryCode,state.lang),contentKindLabel(a.contentType),sourceDomain(a.sourceURL)
 ]);
 if(state.lastTrackedQuery!==q){state.lastTrackedQuery=q;track("search",{results_count:count,has_query:true});}
 const fmt=new Intl.NumberFormat(state.lang==="ar"?"ar-SA":"en-US");
 const summary=matches.length?ui("المعروض: "+fmt.format(matches.length)+" من "+fmt.format(count)+" نتيجة","Showing "+fmt.format(matches.length)+" of "+fmt.format(count)+" results"):ui("لا توجد نتائج في الأخبار المحمّلة. جرّب كلمات أقل أو تصفّح الأرشيف.","No matches in the loaded stories. Try fewer words or browse the archive.");
 status.textContent=summary;
 host.innerHTML=matches.length?'<p class="reader-search-count" aria-hidden="true">'+summary+'</p>'+matches.map(a=>'<button class="search-result" type="button" data-open="'+escapeHTML(a.id)+'"><strong dir="auto">'+escapeHTML(a.title)+'</strong><small>'+escapeHTML([a.src,formatDate(a.published_at),categoryName(a.cat)].join(" · "))+'</small></button>').join(""):'<p class="search-empty">'+summary+'</p>';
 host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>{
  const trigger=document.getElementById("searchOverlay").readerReturnFocus;
  closeSearch();openArticle(el.dataset.open,true,trigger);
 }));
}
function showToast(message){const el=document.getElementById("toast");el.textContent=message;el.classList.add("visible");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.classList.remove("visible"),2300);}
window.WRLDLINE_STATE=state;
window.WRLDLINE_UI={ui,escapeHTML,formatDate,timeAgo,categoryName,countryName,openArticle,showToast};
