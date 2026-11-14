/* WRLDLINE NEWS — editorial frontend */
const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
const PAGE_SIZE = 24;
const WRLDLINE_TAXONOMY = window.WRLDLINE_TAXONOMY || null;
const CATEGORY_NAMES = WRLDLINE_TAXONOMY?.CATEGORY_NAMES || { ar:{politics:"سياسة",economy:"اقتصاد",security:"أمن ودفاع",tech:"تكنولوجيا",sports:"رياضة",culture:"ثقافة",health:"صحة",science:"علوم",environment:"بيئة",society:"مجتمع",world:"حول العالم",uncategorized:"غير مصنف"}, en:{politics:"Politics",economy:"Economy",security:"Security & Defence",tech:"Technology",sports:"Sports",culture:"Culture",health:"Health",science:"Science",environment:"Environment",society:"Society",world:"Around the world",uncategorized:"Uncategorized"} };
function normalizeCategory(value){if(WRLDLINE_TAXONOMY?.normalizeCategory)return WRLDLINE_TAXONOMY.normalizeCategory(value);const key=String(value||"").trim().toLowerCase();return CATEGORY_NAMES.ar[key]?key:"uncategorized";}
function categoryName(value){if(WRLDLINE_TAXONOMY?.categoryName)return WRLDLINE_TAXONOMY.categoryName(value,state.lang);return CATEGORY_NAMES[state.lang]?.[normalizeCategory(value)]||(state.lang==="ar"?"غير مصنف":"Uncategorized");}
function ui(ar,en){return state.lang==="ar"?ar:en;}
function countryName(value,code){const iso3={SAU:"SA",EGY:"EG",CHN:"CN",ARE:"AE",QAT:"QA",KWT:"KW",BHR:"BH",OMN:"OM",YEM:"YE",JOR:"JO",LBN:"LB",PSE:"PS",SYR:"SY",IRQ:"IQ",MAR:"MA",DZA:"DZ",TUN:"TN",LBY:"LY",SDN:"SD",USA:"US",GBR:"GB",FRA:"FR",DEU:"DE",RUS:"RU",UKR:"UA",IRN:"IR",TUR:"TR",IND:"IN",JPN:"JP",KOR:"KR",PRK:"KP",PAK:"PK",AFG:"AF",ISR:"IL",ETH:"ET",SOM:"SO",KEN:"KE",NGA:"NG",ZAF:"ZA",CAN:"CA",MEX:"MX",BRA:"BR",ARG:"AR",AUS:"AU",NZL:"NZ",ESP:"ES",ITA:"IT",POL:"PL",NLD:"NL",SWE:"SE",NOR:"NO",FIN:"FI",GRC:"GR",CHE:"CH",AUT:"AT",BEL:"BE",CZE:"CZ",HUN:"HU",ROU:"RO",BGR:"BG",SRB:"RS",HRV:"HR",THA:"TH",VNM:"VN",IDN:"ID",MYS:"MY",SGP:"SG",PHL:"PH",TWN:"TW",HKG:"HK",MNG:"MN",KAZ:"KZ",UZB:"UZ",KHM:"KH",LAO:"LA",MMR:"MM",BGD:"BD",NPL:"NP",LKA:"LK",COL:"CO",CHL:"CL",PER:"PE",VEN:"VE",CUB:"CU",DOM:"DO",HTI:"HT",PAN:"PA",CRI:"CR",IRL:"IE",PRT:"PT",DNK:"DK",ISL:"IS",CYP:"CY"};if(!value)return state.lang==="ar"?"غير محدد":"Unknown";if(value==="دولي")return state.lang==="ar"?"غير محدد":"Unknown";if(state.lang!=="en")return value;if(code&&iso3[String(code).toUpperCase()]){try{return new Intl.DisplayNames(["en"],{type:"region"}).of(iso3[String(code).toUpperCase()]);}catch{}}const map={"دولي":"International","السعودية":"Saudi Arabia","المملكة العربية السعودية":"Saudi Arabia","الإمارات":"United Arab Emirates","الإمارات العربية المتحدة":"United Arab Emirates","قطر":"Qatar","الكويت":"Kuwait","البحرين":"Bahrain","عمان":"Oman","اليمن":"Yemen","مصر":"Egypt","الأردن":"Jordan","لبنان":"Lebanon","فلسطين":"Palestine","سوريا":"Syria","العراق":"Iraq","المغرب":"Morocco","الجزائر":"Algeria","تونس":"Tunisia","ليبيا":"Libya","السودان":"Sudan","الصين":"China","الولايات المتحدة":"United States","بريطانيا":"United Kingdom","فرنسا":"France","روسيا":"Russia","أوكرانيا":"Ukraine","إيران":"Iran","تركيا":"Türkiye","الهند":"India","اليابان":"Japan"};return map[value]||value;}
function riskLabel(value){const labels={ar:{critical:"حرج",high:"مرتفع",elevated:"متصاعد",guarded:"مراقبة",low:"منخفض",unknown:"غير محدد"},en:{critical:"Critical",high:"High",elevated:"Elevated",guarded:"Guarded",low:"Low",unknown:"Unknown"}};return labels[state.lang]?.[value]||labels[state.lang].unknown;}
function sourceLanguageLabel(lang){return lang==="ar"?ui("النص الأصلي — العربية","Original text — Arabic"):ui("النص الأصلي — الإنجليزية","Original text — English");}
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
 const raw=normalizeText(a?.source_name||a?.source||"");
 const domain=sourceDomain(a?.url||a?.source_url||"");
 if(raw&&!GENERIC_SOURCE_NAMES.test(raw))return raw;
 if(domain)return domain;
 return ui("مصدر إخباري","News source");
}
function contentTypeOf(a){const value=String(a?.content_type||"").toLowerCase();return CONTENT_TYPES.has(value)?value:"news";}
function contentKindLabel(value){return {news:ui("خبر","News"),analysis:ui("تحليل","Analysis"),opinion:ui("رأي","Opinion"),sponsored:ui("محتوى مدعوم","Sponsored")}[value]||ui("خبر","News");}
function contentBadgeMarkup(a){
 const kind=contentTypeOf(a);
 if(kind==="news")return "";
 return '<span class="content-badge content-'+kind+'">'+escapeHTML(contentKindLabel(kind))+'</span>';
}
function typeBadgesMarkup(a){
 let html="";
 if(a.isBreaking)html+='<span class="breaking-badge">'+ui("عاجل","Breaking")+'</span>';
 html+=contentBadgeMarkup(a);
 if(a.hasTranslation&&a.translationStatus&&a.translationStatus!=="none")html+='<span class="translation-badge translation-source">'+escapeHTML(translationBadge(a))+'</span>';
 else if(a.translationFallback)html+='<span class="translation-badge translation-source">'+escapeHTML(translationBadge(a))+'</span>';
 return html;
}
function sourceLineMarkup(a,extraClass=""){
 const domain=sourceDomain(a.sourceURL);
 const sourceText=(a.src||ui("مصدر إخباري","News source"))+(domain&&!String(a.src||"").toLocaleLowerCase().includes(domain)?" · "+domain:"");
 const source=escapeHTML(sourceText);
 const date=escapeHTML(formatDate(a.published_at));
 const iso=publicationISO(a);
 const link=a.sourceURL?'<a class="source-link" href="'+escapeHTML(a.sourceURL)+'" target="_blank" rel="noopener noreferrer" data-source-link data-article-id="'+escapeHTML(a.id)+'">'+source+' ↗</a>':'<span class="source-missing">'+source+' · '+ui("رابط المصدر غير متوفر","Source link unavailable")+'</span>';
 return '<div class="story-source '+(extraClass||"")+'"><span class="story-source-name">'+link+'</span><time datetime="'+(iso||"")+'" aria-label="'+escapeHTML(ui("تاريخ النشر: ","Published: ")+date)+'">'+date+'</time></div>';
}
function sourceBoxMarkup(a){
 const kind=contentTypeOf(a);
 const domain=sourceDomain(a.sourceURL);
 const sourceText=(a.src||ui("مصدر إخباري","News source"))+(domain&&!String(a.src||"").toLocaleLowerCase().includes(domain)?" · "+domain:"");
 const source=escapeHTML(sourceText);
 const link=a.sourceURL?'<a class="source-link" href="'+escapeHTML(a.sourceURL)+'" target="_blank" rel="noopener noreferrer" data-source-link data-article-id="'+escapeHTML(a.id)+'">'+ui("قراءة الخبر لدى المصدر الأصلي ↗","Read at original source ↗")+'</a>':'<span class="source-missing">'+ui("رابط المصدر الأصلي غير متوفر. لا نستبدله برابط وهمي.","The original source link is unavailable. We do not substitute a fake link.")+'</span>';
 const sponsor=kind==="sponsored"?'<small class="sponsor-disclosure">'+ui("بالتعاون مع: ","In partnership with: ")+escapeHTML(a.sponsorName||ui("راعٍ لم يحدد","Unnamed sponsor"))+(a.sponsorURL?' · <a href="'+escapeHTML(a.sponsorURL)+'" target="_blank" rel="noopener noreferrer sponsored">'+ui("موقع الراعي ↗","Sponsor site ↗")+'</a>':"")+'</small>':"";
 return '<div class="source-box source-box-'+kind+'"><span>'+ui("المصدر الأصلي","Original source")+'</span><strong>'+source+'</strong>'+link+sponsor+'<small class="publication-date">'+ui("تاريخ النشر: ","Published: ")+escapeHTML(formatDate(a.published_at))+'</small></div>';
}
function correctionMarkup(a){if(!a.correctionNote)return "";return '<div class="correction-note" role="note"><strong>'+ui("تصحيح منشور","Published correction")+'</strong><p>'+escapeHTML(a.correctionNote)+'</p><small>'+escapeHTML(formatDate(a.correctedAt||a.published_at))+'</small></div>';}
function isLowQualityArticle(a){
 const title=normalizeText(a.originalTitle||a.title);
 if(!title||title.length<4)return true;
 return title.length<55&&LOW_QUALITY_TITLE.test(title);
}
function dedupeArticles(list){
 const out=[],seenUrl=new Set(),seenTitle=new Set();
 const sorted=[...list].sort((a,b)=>(Date.parse(b.published_at||"")||0)-(Date.parse(a.published_at||"")||0));
 for(const a of sorted){
  const url=String(a.sourceURL||"").replace(/#.*$/,"").replace(/\/$/,"").toLowerCase();
  const title=normalizeText(a.originalTitle||a.title).toLocaleLowerCase();
  const titleKey=normalizeText(a.src).toLocaleLowerCase()+"|"+title;
  if(url&&seenUrl.has(url))continue;
  if(title&&seenTitle.has(titleKey))continue;
  if(url)seenUrl.add(url);
  if(title)seenTitle.add(titleKey);
  out.push(a);
 }
 return out;
}
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
const state = { articles:[], missedArticles:[], filtered:[], category:"all", country:"all", lang:localStorage.getItem("wrldline:language")==="en"?"en":"ar", limit:PAGE_SIZE, saved:new Set(readSaved()), query:"", sort:"newest", loading:false, db:null, user:null, follows:{category:[],country:[]}, followOnly:false, realtime:null,  pendingLocalSaved:new Set(readSaved()), breakingTickerIndex:0, breakingTickerCurrentId:null, missedLimit:8, refetchAfterCurrent:false,lastFetchAt:0 };

document.addEventListener("DOMContentLoaded", () => {
  initPreferences(); bindEvents(); updateClock(); fetchNews(); initPersonalization(); setInterval(()=>{if(!document.hidden&&Date.now()-state.lastFetchAt>=90000)fetchNews();},30000); setInterval(updateBreaking, 15000);
  registerServiceWorker(); setupAppInstall();
});

async function registerServiceWorker(){
 if(!("serviceWorker" in navigator))return;
 const workerBuild="v52";
 navigator.serviceWorker.addEventListener("controllerchange",()=>{
  if(sessionStorage.getItem("wrldline:sw-build")!==workerBuild){
   sessionStorage.setItem("wrldline:sw-build",workerBuild);
   location.reload();
  }
 });
 try{
  const registration=await navigator.serviceWorker.register("/sw.js?v=v52",{scope:"/"});
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
document.addEventListener("click",e=>{const link=e.target.closest?.("[data-source-link]");if(!link)return;e.stopPropagation();track("outbound_source_click",{article_id:link.dataset.articleId||"",destination_domain:sourceDomain(link.href),content_type:link.closest("[data-content-type]")?.dataset.contentType||"unknown"});},true);
 document.getElementById("searchButton").addEventListener("click",openSearch);document.getElementById("closeSearch").addEventListener("click",closeSearch);
 document.getElementById("searchInput").addEventListener("input",e=>{state.query=e.target.value.trim().toLocaleLowerCase();renderSearch();});
 document.getElementById("countryFilter").addEventListener("change",e=>{state.country=e.target.value;state.limit=PAGE_SIZE;applyFilters();});
 document.getElementById("sortFilter").addEventListener("change",e=>{state.sort=e.target.value;applyFilters();});
 document.getElementById("loadMoreButton").addEventListener("click",()=>{state.limit+=PAGE_SIZE;renderFeed();});
 document.getElementById("missedLoadMoreButton")?.addEventListener("click",()=>{state.missedLimit+=8;renderMissedStories();});
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
 if(state.loading){state.refetchAfterCurrent=true;return;}
 state.loading=true;
 const refresh=document.getElementById("refreshButton");if(refresh){refresh.disabled=true;refresh.classList.add("is-loading");refresh.setAttribute("aria-busy","true");}
 document.getElementById("connectionLabel").textContent=ui("جارٍ تحديث الأخبار","Updating newsroom");
 document.getElementById("newsStatus")?.classList.remove("is-error");document.getElementById("newsStatus")?.classList.add("is-updating");
 try{
  const headers={apikey:SUPABASE_ANON_KEY};
  const select="select=id,title,summary,category,country,event_country,source_scope,source_language,language_detection,source_name,url,source_url,published_at,received_at,lang,media_type,image_url,is_breaking,content_type,sponsor_name,sponsor_url,correction_note,corrected_at,editorial_status,verification,verification_source_count,verification_independent_count,verification_field_count,verification_official_count,verification_conflict_count,verification_correction_count,verification_retraction_count,verification_updated_at,verification_note,ai_country_code,ai_summary,ai_risk_level,ai_risk_score,ai_confidence,is_exclusive,exclusive_type,exclusive_reason,exclusive_confidence,newsdata_article_id,newsdata_categories,newsdata_ai_tags,newsdata_sentiment,newsdata_ai_summary,newsdata_fetched_at,newsdata_only,article_translations(lang,title,summary,ai_summary,translation_status,translation_source)";
  const base=SUPABASE_URL+"/rest/v1/articles?"+select+"&editorial_status=eq.published";
  const since24h=new Date(Date.now()-24*60*60*1000).toISOString();
  const getRows=async(url,required=false)=>{
   try{const response=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error("HTTP "+response.status);const data=await response.json();if(!Array.isArray(data))throw new Error("Invalid response");return data;}
   catch(error){if(required)throw error;console.warn("WRLDLINE supplemental section fetch:",url.split("?")[1],error);return [];}
  };
  const [mainRows,missedRows,breakingRows,exclusiveRows]=await Promise.all([
   getRows(base+"&newsdata_only=eq.false&order=published_at.desc&limit=1000",true),
   getRows(base+"&newsdata_only=eq.true&order=published_at.desc&limit=100"),
   getRows(base+"&is_breaking=eq.true&published_at=gte."+encodeURIComponent(since24h)+"&order=published_at.desc&limit=200"),
   getRows(base+"&is_exclusive=eq.true&order=published_at.desc&limit=100")
  ]);
  const unique=new Map();[...mainRows,...missedRows,...breakingRows,...exclusiveRows].forEach(row=>{if(row?.id)unique.set(String(row.id),row);});
  const rows=[...unique.values()];
  state.lastFetchAt=Date.now();
  const normalized=rows.map(normalizeArticle).filter(a=>a.title&&!BLOCKED_EDITORIAL_STATUSES.has(a.editorialStatus)&&!isLowQualityArticle(a)&&(!isTelegramArticle(a.raw)||(a.isBreaking===true&&isDedicatedBreakingSource(a.src))));
  state.articles=dedupeArticles(normalized);
  state.missedArticles=dedupeArticles(state.articles.filter(a=>a.isNewsDataOnly));
  populateCountries();renderMissedStories();applyFilters();renderCoveragePulse();renderExclusive();updateBreaking();if(state.user)syncLocalSavedToCloud();const linkedId=new URLSearchParams(location.search).get("article");if(linkedId)openArticle(linkedId,false);
  document.getElementById("lastUpdated").textContent=ui("آخر تحديث: ","Last updated: ")+formatDate(new Date());
  document.getElementById("connectionLabel").textContent=ui("الأخبار محدثة","News updated");
  document.getElementById("newsStatus")?.classList.remove("is-updating","is-error");
  if(manual)showToast(ui("تم تحديث الأخبار","News updated"));
 }catch(err){
  console.error("WRLDLINE fetch:",err);
  document.getElementById("connectionLabel").textContent=ui("تعذر الاتصال بمصدر الأخبار","News connection unavailable");
  document.getElementById("newsStatus")?.classList.remove("is-updating");document.getElementById("newsStatus")?.classList.add("is-error");
  if(manual)showToast(ui("تعذر تحديث الأخبار. تحقق من الاتصال وحاول مجددًا.","Could not refresh news. Check your connection and try again."));
  if(!state.articles.length)renderFetchFailure();
 }finally{
  state.loading=false;
  if(refresh){refresh.disabled=false;refresh.classList.remove("is-loading");refresh.removeAttribute("aria-busy");}
  if(state.refetchAfterCurrent){state.refetchAfterCurrent=false;queueMicrotask(fetchNews);}
 }
}
function renderFetchFailure(){
 const message='<div class="empty-state"><strong>'+ui("لم نتمكن من تحميل الأخبار","We could not load the news")+'</strong><p>'+ui("انتهت مهلة المحاولة أو تعذر الاتصال. لن نُبقي مؤشرات تحميل مفتوحة.","The attempt timed out or the connection failed. We will not leave loading indicators open.")+'</p><button class="outline-button" type="button" onclick="fetchNews(true)">'+ui("إعادة المحاولة","Retry")+'</button></div>';
 for(const id of ["heroLayout","missedNewsGrid","breakingNewsGrid","exclusiveNewsGrid","newsGrid","coveragePulseGrid"]){
  const el=document.getElementById(id);if(el)el.innerHTML=message;
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
 const sourceLang=declaredLang.startsWith("ar")?"ar":(declaredLang.startsWith("en")?"en":(titleIsArabic?"ar":"en"));
 const translations=Array.isArray(a.article_translations)?a.article_translations:[];
 const publishedTranslations=translations.filter(t=>!t.translation_status||t.translation_status==="published");
 const translation=publishedTranslations.find(t=>t.lang===state.lang&&t.title&&!translationLooksUntranslated(t,sourceTitle,a.summary));
 const alternateTranslation=publishedTranslations.find(t=>t.lang!==sourceLang&&t.title&&!translationLooksUntranslated(t,sourceTitle,a.summary));
 const translationPending=false;
 const translationFallback=sourceLang!==state.lang&&!translation;
 const translationReview=!!translation&&translationNeedsReview((translation.title||"")+" "+(translation.summary||""));
 const sameLanguage=sourceLang===state.lang;
 const sourceScope=String(a.source_scope||"").toLowerCase();
 const eventCountry=a.event_country||a.country||null;
 const title=translation?.title||sourceTitle;
 const summary=translation?.summary||a.summary||ui("الملخص غير متوفر. افتح المصدر لقراءة الخبر كاملًا.","Summary unavailable. Open the source to read the full story.");
 const published=String(a.published_at||"");
 const kind=contentTypeOf(a);
 return {translationPending,translationFallback,translationNeedsReview:translationReview,id:String(a.id),title,summary,isNewsDataOnly:a.newsdata_only===true,newsdataArticleId:a.newsdata_article_id||null,newsdataAiTags:Array.isArray(a.newsdata_ai_tags)?a.newsdata_ai_tags:[],newsdataSentiment:a.newsdata_sentiment||null,newsdataAiSummary:a.newsdata_ai_summary||null,newsdataFetchedAt:a.newsdata_fetched_at||null,mediaType:a.media_type==="video"?"video":"image",img:safeURL(a.image_url||""),cat:normalizeCategory(a.category),country:eventCountry,eventCountry:eventCountry,sourceScope:sourceScope,sourceLanguage:sourceLang,languageDetection:a.language_detection||"unknown",hasTranslation:!!translation,translationStatus:translation?.translation_status||"none",translationSource:translation?.translation_source||"",aiCountryCode:a.ai_country_code||null,src:displaySourceName(a),sourceURL:safeURL(a.url||a.source_url||""),published_at:published,received_at:String(a.received_at||""),lang:sourceLang,isBreaking:!!a.is_breaking,contentType:kind,sponsorName:normalizeText(a.sponsor_name||""),sponsorURL:safeURL(a.sponsor_url||""),correctionNote:normalizeText(a.correction_note||""),correctedAt:String(a.corrected_at||""),editorialStatus:a.editorial_status||"published",verification:a.verification||"unconfirmed",verification_source_count:Number(a.verification_source_count)||0,verification_independent_count:Number(a.verification_independent_count)||0,verification_official_count:Number(a.verification_official_count)||0,verification_conflict_count:Number(a.verification_conflict_count)||0,verification_correction_count:Number(a.verification_correction_count)||0,verification_retraction_count:Number(a.verification_retraction_count)||0,verification_updated_at:a.verification_updated_at||"",verification_note:a.verification_note||"",aiSummary:translation?.ai_summary||(sameLanguage?a.ai_summary||"":""),aiRiskLevel:a.ai_risk_level||"unknown",aiRiskScore:a.ai_risk_score||0,aiConfidence:a.ai_confidence||null,raw:a,isExclusive:a.is_exclusive===true,exclusiveType:a.exclusive_type||null,exclusiveReason:a.exclusive_reason||"",exclusiveConfidence:Number(a.exclusive_confidence)||0,originalTitle:sourceTitle,originalSummary:String(a.summary||""),translationTitle:translation?.title||"",translationSummary:translation?.summary||""};
}
function populateCountries(){const select=document.getElementById("countryFilter"),previous=state.country;const countries=[...new Set([...state.articles.map(a=>a.country).filter(c=>c&&c!=="دولي"&&c!=="غير محدد"),...state.follows.country])].sort((a,b)=>a.localeCompare(b,state.lang));select.innerHTML='<option value="all">'+ui("كل الدول","All countries")+'</option>'+countries.map(c=>'<option value="'+escapeHTML(c)+'">'+escapeHTML(countryName(c,state.articles.find(a=>a.country===c)?.aiCountryCode))+'</option>').join("");select.value=countries.includes(previous)?previous:"all";if(select.value==="all")state.country="all";renderFollowPanel();}
function renderFollowPanel(){
 const host=document.getElementById("followOptions"),hint=document.getElementById("followHint");if(!host||!hint)return;
 if(!state.user){hint.textContent=ui("سجّل الدخول لتحفظ اختياراتك وتزامنها مع حسابك على كل أجهزتك.","Sign in to save your preferences and sync them across devices.");host.innerHTML='<a class="outline-button" href="account.html">'+ui("تسجيل الدخول أو إنشاء حساب","Sign in or create an account")+"</a>";return;}
 hint.textContent=ui("اختر ما تريد متابعته؛ ستظهر أخباره في موجز متابعاتي.","Choose what to follow; related stories will appear in your personal feed.");
 const cats=Object.keys(CATEGORY_NAMES.ar).map(value=>({type:"category",value,label:categoryName(value)}));
 const countries=[...new Set(state.articles.map(a=>a.country).filter(c=>c&&c!=="دولي"&&c!=="غير محدد"))].sort((a,b)=>a.localeCompare(b,"ar")).map(value=>({type:"country",value,label:countryName(value,state.articles.find(a=>a.country===value)?.aiCountryCode)}));
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
function applyFilters(){
 const pool=state.articles.filter(a=>!a.isNewsDataOnly&&(state.category==="all"||a.cat===state.category)&&(state.country==="all"||a.country===state.country)&&(!state.followOnly||([...state.follows.category,...state.follows.country].length>0&&(state.follows.category.includes(a.cat)||state.follows.country.includes(a.country)))));
 const arabic=pool.filter(a=>/[\u0600-\u06FF]/.test(a.title||""));
 state.filtered=(arabic.length>=12?arabic:pool);
 const softRe=/ملكات|ملكة الكون|فيتامين|ألم |أعراض|وصفة|رجيم|تخسيس|بالصور|فيديو|فنان|ممثل|زواج|طلاق|مشاهير|أزياء/;
 state.filtered.sort((a,b)=>{
   if(state.sort==="oldest")return new Date(a.published_at)-new Date(b.published_at);
   const softDiff=(softRe.test(a.title||"")?1:0)-(softRe.test(b.title||"")?1:0);
   return softDiff||(new Date(b.published_at)-new Date(a.published_at));
 });
 renderHero();renderFeed();renderCoveragePulse();
 try{document.dispatchEvent(new CustomEvent("wrldline:news",{detail:{articles:state.articles,filtered:state.filtered}}));}catch(error){console.warn(error);}
}
function renderCoveragePulse(){
 const host=document.getElementById("coveragePulseGrid");if(!host)return;
 const since=Date.now()-24*60*60*1000;
 const recent=state.articles.filter(a=>!a.isNewsDataOnly&&(()=>{const t=Date.parse(a.published_at||"");return Number.isFinite(t)&&t<=Date.now()&&t>=since;})());
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
 return '<img class="'+cls+'" src="'+escapeHTML(article.img)+'" alt="'+escapeHTML(article.title||"")+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="handleImageError(this)">';
}
function handleImageError(img){if(!img||img.dataset.failed)return;img.dataset.failed="1";img.style.display="none";const placeholder=document.createElement("div");placeholder.className="image-placeholder "+(img.className||"");placeholder.textContent="WRLDLINE";img.parentNode?.insertBefore(placeholder,img);}
function articleMediaMarkup(article){
 if(!article.img||article.img==="#")return "";
 if(article.mediaType==="video")return '<video class="modal-image" src="'+escapeHTML(article.img)+'" controls playsinline preload="metadata"></video>';
 return imageMarkup(article,"modal-image");
}
function wlReadingTime(a){
 const text=String((a.title||'')+' '+(a.summary||'')+' '+(a.aiSummary||'')).trim();
 const words=text.split(/\s+/).filter(Boolean).length;
 const mins=Math.max(1,Math.round(words/180));
 return mins+' د';
}
function wlSaveMarkup(a){
 const saved=state.saved.has(a.id);
 return '<button class="card-save '+(saved?'is-saved':'')+'" type="button" data-save="'+escapeHTML(a.id)+'" aria-label="'+(saved?'إزالة من المحفوظات':'حفظ الخبر')+'" aria-pressed="'+saved+'"><svg viewBox="0 0 24 24" fill="'+(saved?'currentColor':'none')+'" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/></svg></button>';
}
function wlCardMeta(a){
 return '<div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(a.cat))+'</span>'+typeBadgesMarkup(a)+'<span>'+escapeHTML(countryName(a.country,a.aiCountryCode))+'</span><span class="read-time">'+wlReadingTime(a)+'</span>'+wlSaveMarkup(a)+'</div>';
}
function renderHero(){
 const host=document.getElementById("heroLayout");
 if(!host)return;
 if(!state.filtered.length){host.innerHTML='<div class="wl-empty"><strong>لا توجد نتائج في هذا القسم</strong><p>جرّب تغيير الدولة أو اختيار قسم آخر.</p></div>';return;}
 const lead=state.filtered.slice(0,8).find(a=>a.img&&a.img!=="#")||state.filtered[0];
 const others=state.filtered.filter(a=>a.id!==lead.id).slice(0,3);
 host.innerHTML='<article class="lead-story" role="button" tabindex="0" data-open="'+escapeHTML(lead.id)+'">'+imageMarkup(lead,"lead-image")+'<div class="lead-overlay"><div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(lead.cat))+'</span>'+typeBadgesMarkup(lead)+'<span>'+escapeHTML(countryName(lead.country,lead.aiCountryCode))+'</span><span class="read-time" style="color:#ffffffb0">'+wlReadingTime(lead)+'</span></div><h2>'+escapeHTML(lead.title)+'</h2><p>'+escapeHTML(lead.summary)+'</p>'+sourceLineMarkup(lead,"lead-source")+'</div></article>'+
 '<div class="lead-rail"><div class="lead-rail-head"><span>TOP STORIES</span><strong>أهم ما يحدث الآن</strong></div>'+
 others.map((a,idx)=>'<article class="rail-story" role="button" tabindex="0" data-open="'+escapeHTML(a.id)+'"><div><div class="story-meta"><span class="rail-number">0'+(idx+1)+'</span><span class="category-label">'+escapeHTML(categoryName(a.cat))+'</span></div><h3>'+escapeHTML(a.title)+'</h3><div class="rail-source">'+escapeHTML(a.src||"WRLDLINE")+' · '+timeAgo(a.published_at)+'</div></div>'+imageMarkup(a,"rail-image")+'</article>').join("")+
 '</div>';
 host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));
}
function renderFeed(){
 const host=document.getElementById("newsGrid"),items=state.filtered.slice(0,state.limit);
 if(!host)return;
 if(!items.length){host.innerHTML='<div class="wl-empty"><strong>لا توجد أخبار مطابقة حالياً.</strong><p>جرّب تغيير القسم أو الدولة أو إلغاء موجز المتابعات.</p></div>';}
 else host.innerHTML=items.slice(4).map(a=>'<article class="news-card content-card-'+a.contentType+'" data-content-type="'+a.contentType+'"><div class="card-open" role="button" tabindex="0" data-open="'+escapeHTML(a.id)+'">'+imageMarkup(a,"card-image")+'<div class="card-content">'+wlCardMeta(a)+'<h3>'+escapeHTML(a.title)+'</h3><p>'+escapeHTML(a.summary)+'</p>'+newsDataMetaMarkup(a)+sourceLineMarkup(a)+(a.correctionNote?'<span class="correction-chip">تم التصحيح</span>':'')+'<div class="card-actions"><button class="translation-button" type="button" data-translate="'+escapeHTML(a.id)+'" aria-expanded="false">الترجمة</button></div></div></div>'+translationPanelMarkup(a)+'</article>').join("");
 host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));
 host.querySelectorAll("[data-save]").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();toggleSaved(el.dataset.save);}));
 host.querySelectorAll("[data-translate]").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();toggleCardTranslation(el);}));
 const more=document.getElementById("loadMoreButton");if(more)more.hidden=state.limit>=state.filtered.length;
}
function toggleCardTranslation(button){
 const panel=button.closest(".news-card")?.querySelector(".translation-panel");if(!panel)return;
 const opening=panel.hidden;panel.hidden=!opening;button.setAttribute("aria-expanded",String(opening));
 button.textContent=opening?ui("إخفاء الترجمة","Hide translation"):ui("الترجمة","Translation");
}
function translationPanelMarkup(article){
 if(article.translationTitle&&article.translationSummary&&!article.translationPending)return '<div class="translation-panel" hidden><div class="translation-original"><small>'+ui("النص الأصلي","Original text")+'</small><strong>'+escapeHTML(article.originalTitle||"")+'</strong><p>'+escapeHTML(article.originalSummary||"")+'</p></div><div class="translation-result"><small>'+ui("الترجمة","Translation")+'</small><strong>'+escapeHTML(article.translationTitle)+'</strong><p>'+escapeHTML(article.translationSummary)+'</p></div></div>';
 const age=Date.now()-Date.parse(article.published_at||"");
 const message=ui("لا توجد ترجمة تحريرية محفوظة لهذا الخبر.","No reviewed translation is available for this story.");
 return '<div class="translation-panel" hidden><p>'+message+'</p><p class="translation-source-note">'+ui("نعرض النص الأصلي كما ورد من المصدر، ولا ننسب ترجمة آلية للموقع.","The original source text is shown; WRLDLINE does not present an unreviewed machine translation as its own.")+'</p></div>';
}
function renderMissedStories(){
 const host=document.getElementById("missedNewsGrid");if(!host)return;
 const feedIds=new Set((state.filtered||[]).slice(0,24).map(a=>a.id));
 let pool=(state.articles||[]).filter(a=>!a.isNewsDataOnly&&/[\u0600-\u06FF]/.test(a.title||"")&&!["sports","culture","entertainment"].includes(a.cat)&&!feedIds.has(a.id));
 if(pool.length<8)pool=(state.articles||[]).filter(a=>!a.isNewsDataOnly&&/[\u0600-\u06FF]/.test(a.title||"")&&!["sports","culture","entertainment"].includes(a.cat));
 const all=pool.slice(0,40),items=all.slice(0,state.missedLimit||8);
 const count=document.getElementById("missedNewsCount");
 if(count)count.textContent=all.length+" قصة إضافية";
 const more=document.getElementById("missedLoadMoreButton");
 if(more){more.hidden=items.length>=all.length;more.textContent="عرض المزيد";}
 if(!items.length){host.innerHTML='<div class="wl-empty">لا توجد أخبار إضافية حالياً.</div>';return;}
 host.innerHTML=items.map(a=>'<article class="news-card missed-news-card content-card-'+a.contentType+'"><div class="card-open" role="button" tabindex="0" data-open="'+escapeHTML(a.id)+'">'+imageMarkup(a,"card-image")+'<div class="card-content"><div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(a.cat))+'</span><span>'+escapeHTML(countryName(a.country,a.aiCountryCode))+'</span><span class="read-time">'+wlReadingTime(a)+'</span>'+wlSaveMarkup(a)+'</div><h3>'+escapeHTML(a.title)+'</h3>'+sourceLineMarkup(a)+'</div></div></article>').join("");
 host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));
 host.querySelectorAll("[data-save]").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();toggleSaved(el.dataset.save);}));
}
function renderExclusive(){
 const host=document.getElementById("exclusiveNewsGrid");if(!host)return;
 const items=state.articles.filter(a=>!a.isNewsDataOnly&&a.isExclusive).sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at)).slice(0,6);
 const count=document.getElementById("exclusiveCount");
 if(count)count.textContent=items.length+" قصة موسومة بالحصرية";
 if(!items.length){host.innerHTML='<div class="exclusive-empty">لا توجد مواد حصرية مؤكدة حالياً. لن نعرض خبراً لمجرد أن مصدره معروف؛ يجب أن تتوفر قرائن على السبق أو العمل الصحفي الأصلي.</div>';return;}
 host.innerHTML=items.map(a=>'<article class="news-card exclusive-news-card content-card-'+a.contentType+'"><span class="exclusive-tag">حصري لدى المصدر</span><div class="card-open" role="button" tabindex="0" data-open="'+escapeHTML(a.id)+'">'+imageMarkup(a,"card-image")+'<div class="card-content"><div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(a.cat))+'</span>'+typeBadgesMarkup(a)+'<span class="read-time">'+wlReadingTime(a)+'</span>'+wlSaveMarkup(a)+'</div><h3>'+escapeHTML(a.title)+'</h3><p>'+escapeHTML(a.summary)+'</p>'+sourceLineMarkup(a)+'</div></div></article>').join("");
 host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));
 host.querySelectorAll("[data-save]").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();toggleSaved(el.dataset.save);}));
}
function initNewsRealtime(){
  if(!state.db||state.newsChannel)return;
  let refreshTimer=null;
  state.newsChannel=state.db.channel("wrldline-public-news")
   .on("postgres_changes",{event:"*",schema:"public",table:"articles",filter:"editorial_status=eq.published"},()=>{
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
function breakingFingerprint(a){
 return String(a?.title||"").toLocaleLowerCase().replace(/https?:\/\/\S+/g," ").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
}
function breakingItems(maxAge=15*60*1000,ageField="published_at"){
 const now=Date.now(), seen=new Set();
 return state.articles.filter(a=>{
  if(a.isNewsDataOnly||a.isBreaking!==true)return false;
  if(!/[\u0600-\u06FF]/.test(a.title||""))return false;
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
 const items=breakingItems(15*60*1000,"published_at"),count=document.getElementById("breakingCount");
 if(count)count.textContent="آخر 15 دقيقة";
 if(!items.length){host.innerHTML='<div class="breaking-empty">لا توجد أخبار عاجلة موثوقة خلال آخر 15 دقيقة. سنعرض الخبر فور وروده.</div>';return;}
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
 if(!items.length){state.breakingTickerIndex=0;state.breakingTickerCurrentId=null;strip.hidden=true;marquee.textContent="";marquee.classList.remove("is-moving","is-ltr","is-rtl");delete marquee.dataset.articleId;delete marquee.dataset.articleTitle;title.removeAttribute("title");if(time)time.textContent="";return;}
 let item=items.find(a=>a.id===state.breakingTickerCurrentId);
 if(!item){state.breakingTickerIndex=0;item=items[0];state.breakingTickerCurrentId=item.id;}
 state.breakingTickerIndex=Math.max(0,items.findIndex(a=>a.id===item.id));strip.hidden=false;
 if(marquee.dataset.articleId!==item.id||marquee.dataset.articleTitle!==String(item.title||"")){
  const cleanTitle=String(item.title||"").replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,"").normalize("NFC").trim();
  const isRTL=/[\u0590-\u08FF]/.test(cleanTitle),direction=isRTL?"rtl":"ltr";
  marquee.textContent=cleanTitle;marquee.dataset.articleId=item.id;marquee.dataset.articleTitle=String(item.title||"");
  marquee.classList.remove("is-moving","is-ltr","is-rtl");title.setAttribute("dir",direction);title.style.direction=direction;textAlign="start";
  marquee.setAttribute("dir",direction);marquee.style.direction=direction;marquee.style.unicodeBidi="isolate";
  marquee.classList.add(isRTL?"is-rtl":"is-ltr");marquee.style.removeProperty("--breaking-duration");
  requestAnimationFrame(()=>{const viewportWidth=title.clientWidth,distance=Math.max(viewportWidth,marquee.scrollWidth)+viewportWidth;marquee.style.setProperty("--breaking-duration",Math.max(10,distance/55)+"s");marquee.classList.add("is-moving");});
  marquee.onanimationend=()=>{if(breakingItems().length>1)rotateBreaking();else{marquee.classList.remove("is-moving");requestAnimationFrame(()=>marquee.classList.add("is-moving"));}};
 }
 title.title=ui("عاجل خلال آخر 15 دقيقة — الأحدث أولاً","Breaking in the last 15 minutes — newest first");if(time)time.textContent=ui("عاجل · ","Breaking · ")+timeAgo(item.published_at);
}
function openArticle(id,updateUrl=true){
 const a=state.articles.find(x=>x.id===id);if(!a)return;
 if(updateUrl){const url=new URL(location.href);url.searchParams.set("article",id);history.pushState({article:id},"",url);}
 track("view_article",{article_id:a.id,content_type:a.contentType,category:a.cat,source_domain:sourceDomain(a.sourceURL),has_source_link:!!a.sourceURL});
 const host=document.getElementById("modalContent");
 host.innerHTML='<button class="modal-close" id="modalClose" aria-label="'+ui("إغلاق","Close")+'">×</button>'+articleMediaMarkup(a)+'<div class="modal-article-body"><div class="story-meta"><span class="category-label">'+escapeHTML(categoryName(a.cat))+'</span>'+typeBadgesMarkup(a)+'<span>'+escapeHTML(countryName(a.country,a.aiCountryCode))+'</span></div><h1>'+escapeHTML(a.title)+'</h1><p class="modal-publication-date">'+ui("تاريخ النشر: ","Published: ")+escapeHTML(formatDate(a.published_at))+'</p>'+correctionMarkup(a)+'<p class="modal-summary">'+escapeHTML(a.summary)+'</p>'+newsDataMetaMarkup(a)+(a.newsdataAiSummary?'<section class="ai-insight"><strong>NewsData.io AI</strong><p>'+escapeHTML(a.newsdataAiSummary)+'</p></section>':'')+(a.aiSummary?'<section class="ai-insight"><strong>'+ui("تحليل WRLDLINE AI","WRLDLINE AI analysis")+'</strong><p>'+escapeHTML(a.aiSummary)+'</p><small>'+ui("مؤشر الحدث: ","Event risk: ")+escapeHTML(riskLabel(a.aiRiskLevel))+' · '+escapeHTML(a.aiRiskScore)+'/100</small></section>':'')+sourceBoxMarkup(a)+'<p class="disclaimer">'+escapeHTML(provenanceNote(a))+' <a href="corrections.html">'+ui("سياسة التصحيح","Corrections policy")+'</a>.</p><div class="article-actions"><button class="outline-button" id="modalListen" type="button">♫ '+ui("استمع للخبر","Listen to story")+'</button><button class="outline-button" id="modalShare" type="button">↗ '+ui("مشاركة الخبر","Share story")+'</button><button class="outline-button" id="modalSave">'+(state.saved.has(a.id)?ui("★ إزالة من المحفوظات","★ Remove saved"):ui("☆ حفظ الخبر","☆ Save story"))+'</button></div></div>';
 document.getElementById("modalClose").addEventListener("click",closeArticle);
 document.getElementById("modalSave").addEventListener("click",()=>{toggleSaved(a.id);document.getElementById("modalSave").textContent=state.saved.has(a.id)?ui("★ إزالة من المحفوظات","★ Remove saved"):ui("☆ حفظ الخبر","☆ Save story");});
 document.getElementById("modalShare").addEventListener("click",()=>shareArticle(a));
 document.getElementById("modalListen").addEventListener("click",()=>playArticleAudio(a));
 showModal("articleModal");
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
  const {data,error}=await state.db.from("user_saved_articles").select("article_id, article:articles(id,title,summary,category,country,event_country,source_scope,source_language,language_detection,source_name,url,source_url,published_at,received_at,lang,media_type,image_url,is_breaking,content_type,sponsor_name,sponsor_url,correction_note,corrected_at,editorial_status,ai_country_code,ai_summary,ai_risk_level,ai_risk_score,ai_confidence,is_exclusive,exclusive_type,exclusive_reason,exclusive_confidence,newsdata_article_id,newsdata_categories,newsdata_ai_tags,newsdata_sentiment,newsdata_ai_summary,newsdata_fetched_at,article_translations(lang,title,summary,ai_summary,translation_status,translation_source))").eq("user_id",state.user.id).order("created_at",{ascending:false});
  if(!error){list=(data||[]).map(row=>row.article).filter(row=>row&&!isTelegramArticle(row)).map(normalizeArticle).filter(a=>!BLOCKED_EDITORIAL_STATUSES.has(a.editorialStatus)&&!isLowQualityArticle(a));for(const a of list)if(!state.articles.some(x=>x.id===a.id))state.articles.push(a);}
  else showToast("تعذر تحميل المكتبة المتزامنة حالياً");
 }
 const host=document.getElementById("modalContent");
 host.innerHTML='<button class="modal-close" id="modalClose" aria-label="إغلاق">×</button><div class="modal-article-body saved-view"><span class="section-kicker">مكتبتك الشخصية</span><h2>الأخبار المحفوظة</h2><p class="muted">'+(state.user?"مزامنة مع حسابك على جميع أجهزتك":"محفوظات هذا الجهاز فقط — سجّل الدخول للمزامنة")+'</p>'+(list.length?list.map(a=>'<div class="saved-row-wrap"><button class="saved-row" data-open="'+escapeHTML(a.id)+'"><strong>'+escapeHTML(a.title)+'</strong><small>'+escapeHTML(a.src)+' · '+escapeHTML(formatDate(a.published_at))+'</small></button>'+(a.sourceURL?'<a class="saved-source source-link" href="'+escapeHTML(a.sourceURL)+'" target="_blank" rel="noopener noreferrer" data-source-link data-article-id="'+escapeHTML(a.id)+'">'+ui("المصدر ↗","Source ↗")+'</a>':'<span class="source-missing">'+ui("المصدر غير متوفر","Source unavailable")+'</span>')+'<button class="saved-remove" type="button" data-remove-saved="'+escapeHTML(a.id)+'">'+ui("إزالة","Remove")+'</button></div>').join(""):'<p class="muted">لم تحفظ أي خبر بعد.</p>')+'</div>';
 document.getElementById("modalClose").addEventListener("click",closeArticle);
 host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>openArticle(el.dataset.open)));
 host.querySelectorAll("[data-remove-saved]").forEach(el=>el.addEventListener("click",async()=>{await toggleSaved(el.dataset.removeSaved);await showSaved();}));
 showModal("articleModal");
}
function showModal(id){const el=document.getElementById(id);el.classList.add("visible");el.setAttribute("aria-hidden","false");document.body.classList.add("modal-open");}
function hideModal(id){const el=document.getElementById(id);el.classList.remove("visible");el.setAttribute("aria-hidden","true");document.body.classList.remove("modal-open");}
function openSearch(){showModal("searchOverlay");document.getElementById("searchInput").focus();}
function closeSearch(){hideModal("searchOverlay");}
function renderSearch(){
 const q=state.query,host=document.getElementById("searchResults");
 if(!q){host.innerHTML='<p class="muted">'+ui("اكتب كلمة للبدء.","Type to begin.")+'</p>';return;}
 const results=state.articles.filter(a=>(a.title+" "+a.summary+" "+a.country+" "+a.src).toLocaleLowerCase().includes(q)).slice(0,30);
 if(state.lastTrackedQuery!==q){state.lastTrackedQuery=q;track("search",{results_count:results.length,has_query:true});}
 host.innerHTML=results.length?results.map(a=>'<button class="search-result" data-open="'+escapeHTML(a.id)+'"><strong>'+escapeHTML(a.title)+'</strong><small>'+escapeHTML(a.src)+' · '+escapeHTML(formatDate(a.published_at))+' · '+escapeHTML(a.country)+'</small></button>').join(""):'<p class="muted">'+ui("لا توجد نتائج مطابقة.","No matching results.")+'</p>';
 host.querySelectorAll("[data-open]").forEach(el=>el.addEventListener("click",()=>{closeSearch();openArticle(el.dataset.open);}));
}
function showToast(message){const el=document.getElementById("toast");el.textContent=message;el.classList.add("visible");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.classList.remove("visible"),2300);}
window.WRLDLINE_STATE=state;
window.WRLDLINE_UI={ui,escapeHTML,formatDate,timeAgo,categoryName,countryName,openArticle,showToast};
