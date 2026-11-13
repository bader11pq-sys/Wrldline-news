const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://vmaxbnogmmfyrcucapnq.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const DB_HEADERS = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" };
const URGENT = /\bBREAKING\b|\bJUST IN\b|\bLIVE\b|عاجل|الآن|قبل قليل|تطور عاجل|نبأ عاجل/i;
const COUNTRY_BY_NAME = {"الجزيرة":"دولي","BBC عربي":"دولي","CNN عربية":"دولي","العربية":"دولي","الشرق الأوسط":"دولي","سكاي نيوز عربية":"دولي","فرانس 24 عربي":"دولي","DW عربية":"دولي","وكالة الأنباء السعودية واس":"السعودية","كونا":"الكويت","الخليج":"الإمارات","الاتحاد":"الإمارات","البيان":"الإمارات","الشرق":"قطر","اليوم السابع":"مصر","المصري اليوم":"مصر","الغد":"الأردن","رؤيا":"الأردن","المدن":"لبنان","معاً":"فلسطين","عربي21":"دولي","هسبريس":"المغرب","الشروق":"الجزائر","تونس الرقمية":"تونس","ليبيا أخبار":"ليبيا","آر تي عربي":"دولي","النهار اللبنانية":"لبنان","العربي الجديد":"دولي","وكالة الأناضول العربية":"دولي","القدس العربي":"فلسطين","موزاييك إف إم":"تونس","يورونيوز عربي":"دولي","الصباح المغربية":"المغرب","الحرة":"دولي","عالم التقنية":"السعودية","أخبار الأمم المتحدة":"دولي","اندبندنت عربية":"دولي","نون بوست":"دولي","البوابة العربية للأخبار التقنية":"السعودية","عاجل":"السعودية","الرياض":"السعودية","عكاظ":"السعودية","إل بي سي آي اللبنانية":"لبنان","المدينة":"السعودية","شفق نيوز عربي":"العراق","عنب بلدي":"سوريا","السومرية":"العراق","BBC Top Stories":"دولي","NPR World":"دولي","BBC World":"دولي","Al Jazeera English":"دولي","The Guardian":"دولي","DW News":"دولي","France 24":"دولي","NPR":"دولي","The New York Times":"دولي","Sky News":"دولي","Reuters (Google News)":"دولي","Associated Press (Google News)":"دولي","CNN (Google News)":"دولي","AFP":"دولي","EFE":"دولي","dpa":"دولي","Kyodo News":"دولي","Jiji Press":"دولي","Xinhua":"دولي","TASS":"دولي","UPI":"دولي","Yonhap News Agency":"دولي","NHK World":"دولي","CNA":"دولي","Bernama":"دولي","ANSA":"دولي","The Hindu":"دولي","The Times of India":"دولي","The Indian Express":"دولي","Hindustan Times":"دولي","Dawn":"دولي","South China Morning Post":"دولي","The Japan Times":"دولي","Nikkei Asia":"دولي","The Korea Herald":"دولي","The Straits Times":"دولي","The Sydney Morning Herald":"دولي","ABC News Australia":"دولي","CBC News":"دولي","The Globe and Mail":"دولي","Toronto Star":"دولي","Le Monde":"دولي","El País":"دولي","Der Spiegel":"دولي","POLITICO Europe":"دولي","The Independent":"دولي","The Telegraph":"دولي","The Wall Street Journal":"دولي","Financial Times":"دولي","The Economist":"دولي","Bloomberg":"دولي","Axios":"دولي","Newsweek":"دولي"};

function decode(value = "") {
 return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
  .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'")
  .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/<br\s*\/?\s*>/gi," ")
  .replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}
function tag(block,names) {
 for (const name of names) {
  const re=new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i");
  const m=block.match(re); if(m) return decode(m[1]);
 }
 return "";
}
function xmlEntries(xml) {
 const rss=xml.match(/<item\b[\s\S]*?<\/item>/gi)||[];
 const atom=xml.match(/<entry\b[\s\S]*?<\/entry>/gi)||[];
 return rss.length?rss:atom;
}
function entryLink(block) {
 const href=(block.match(/<link\b[^>]*href=["']([^"']+)["']/i)||[])[1];
 if(href) return decode(href);
 const link=tag(block,["link"]);
 if(/^https?:\/\//i.test(link)) return link;
 return tag(block,["guid","id"]);
}
function entryImage(block) {
 const m=block.match(/<(?:enclosure|media:content|media:thumbnail)[^>]*(?:url|href)=["']([^"']+)["']/i)||block.match(/<img[^>]+src=["']([^"']+)["']/i);
 return m?decode(m[1]):null;
}
function parsedDate(value) {
 const d=value?new Date(value):new Date();
 return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString();
}
async function requestText(url,timeout=7000) {
 const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; WRLDLINE-News/3.0; +https://al-ghaib.us.ci)","Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml, */*"},signal:AbortSignal.timeout(timeout)});
 if(!r.ok) throw new Error("HTTP "+r.status);
 return await r.text();
}
function googleFallback(feed) {
 try {
  const u=new URL(feed.url);
  if(u.hostname.includes("news.google.com")) return null;
  const rawDomain=u.hostname.replace(/^www\./,""); const domain=rawDomain==="alsharq.net"?"al-sharq.com":rawDomain;
  const english=feed.lang==="en";
  const q="site:"+domain+" when:1d";
  return "https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl="+(english?"en-US&gl=US&ceid=US:en":"ar&gl=SA&ceid=SA:ar");
 } catch { return null; }
}
function parseGeneral(xml,feed) {
 return xmlEntries(xml).slice(0,25).map(block=>{
  const title=tag(block,["title"]),url=entryLink(block);
  if(!title||!/^https?:\/\//i.test(url)) return null;
  const summary=tag(block,["description","summary","content:encoded","content"]);
  const date=tag(block,["pubDate","published","updated","dc:date"]);
  const arabic=/[\u0600-\u06FF]/.test(title);
  return {url,title:title.slice(0,500),summary:summary.slice(0,5000),image_url:entryImage(block),category:feed.category||"world",country:COUNTRY_BY_NAME[feed.name]||"دولي",source_name:feed.name,source_url:feed.url,lang:arabic?"ar":(feed.lang||"en"),verification:"unconfirmed",published_at:parsedDate(date),ai_classification_status:"pending",editorial_status:"published"};
 }).filter(Boolean);
}
async function dbRequest(path,init={}) {
 return await fetch(SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{...DB_HEADERS,...(init.headers||{})}});
}
async function updateRun(id,patch) {
 if(!id) return;
 await dbRequest("news_ingestion_runs?id=eq."+id,{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({...patch,finished_at:new Date().toISOString()})});
}
async function beginRun(pipeline) {
 const r=await dbRequest("news_ingestion_runs",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({pipeline,trigger_source:"supabase_cron"})});
 if(!r.ok) throw new Error("Run log insert failed: "+r.status+" "+(await r.text()).slice(0,180));
 const rows=await r.json(); return rows?.[0]?.id;
}
async function processGeneralFeed(feed) {
 let lastError="No parseable entries";
 const candidates=[feed.url,googleFallback(feed)].filter(Boolean);
 for(let i=0;i<candidates.length;i++) {
  try {
   const xml=await requestText(candidates[i],7000);
   const rows=parseGeneral(xml,feed);
   if(!rows.length) throw new Error("Feed returned no parseable RSS/Atom entries");
   const saved=await dbRequest("articles?on_conflict=url",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(rows)});
   if(!saved.ok) throw new Error("Database HTTP "+saved.status+" "+(await saved.text()).slice(0,160));
   return {ok:true,name:feed.name,parsed:rows.length,usedFallback:i>0};
  } catch(e) { lastError=String(e?.message||e).slice(0,200); }
 }
 return {ok:false,name:feed.name,parsed:0,error:lastError};
}
async function setFeedHealth(feed,result) {
 const query="feeds?url=eq."+encodeURIComponent(feed.url);
 const patch={last_fetched:result.ok?new Date().toISOString():null,last_error:result.ok?null:result.error,active:true};
 const r=await dbRequest(query,{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify(patch)});
 return r.ok;
}
async function runGeneral() {
 const r=await dbRequest("feeds?select=name,url,lang,category,active&active=eq.true&order=name.asc");
 if(!r.ok) throw new Error("Could not load feeds: "+r.status+" "+(await r.text()).slice(0,160));
 const feeds=await r.json();
 const runId=await beginRun("general");
 let next=0; const results=new Array(feeds.length);
 async function worker() {
  while(next<feeds.length) {
   const i=next++; const result=await processGeneralFeed(feeds[i]); results[i]=result;
   await setFeedHealth(feeds[i],result).catch(()=>false);
  }
 }
 await Promise.all(Array.from({length:24},worker));
 const summary={pipeline:"general",feeds:feeds.length,successful:results.filter(x=>x?.ok).length,failed:results.filter(x=>!x?.ok).length,parsed_items:results.reduce((n,x)=>n+(x?.parsed||0),0),fallbacks:results.filter(x=>x?.usedFallback).length};
 await updateRun(runId,{source_count:summary.feeds,successful_sources:summary.successful,failed_sources:summary.failed,parsed_items:summary.parsed_items,error_summary:results.filter(x=>!x?.ok).slice(0,12).map(x=>String(x?.name||"unknown")+": "+String(x?.error||"failed")).join(" | ")||null});
 return summary;
}

const GOOGLE=(domain,lang="ar")=>{
 const q=lang==="ar"?`site:${domain} ("عاجل" OR "الآن" OR "قبل قليل" OR "تطور عاجل") when:1h`:`site:${domain} (BREAKING OR "JUST IN") when:1h`;
 return "https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl="+(lang==="ar"?"ar&gl=SA&ceid=SA:ar":"en-US&gl=US&ceid=US:en");
};
// Telegram channels are public breaking desks; publisher RSS searches are constrained to explicit urgent markers.

const FEEDS=[
 {publisher:"الجزيرة الآن",type:"telegram",handle:"ajarabic_now",lang:"ar"},
 {publisher:"الجزيرة عاجل",type:"telegram",handle:"aljazeerabrk",lang:"ar"},
 {publisher:"الميادين عاجل",type:"telegram",handle:"almayadeen",lang:"ar"},
 {publisher:"الحدث عاجل",type:"telegram",handle:"alhadath_brk",lang:"ar"},
 {publisher:"الشرق عاجل",type:"telegram",handle:"AsharqNewsBreaking",lang:"ar"},
 {publisher:"العربية",type:"telegram",handle:"Alarabiya",lang:"ar"},
 {publisher:"سكاي نيوز عربية",url:GOOGLE("skynewsarabia.com"),lang:"ar"},
 {publisher:"BBC عربي",url:GOOGLE("bbc.com/arabic"),lang:"ar"},
 {publisher:"CNN عربية",url:GOOGLE("cnn.com/arabic"),lang:"ar"},
 {publisher:"الحرة",url:GOOGLE("alhurra.com"),lang:"ar"},
 {publisher:"RT عربي",url:GOOGLE("arabic.rt.com"),lang:"ar"},
 {publisher:"فرانس 24 عربي",url:GOOGLE("france24.com/ar"),lang:"ar"},
 {publisher:"التلفزيون العربي",url:GOOGLE("alaraby.com"),lang:"ar"},
 {publisher:"شبكة قدس الإخبارية",url:GOOGLE("qudsn.co"),lang:"ar"},
 {publisher:"رؤيا الإخباري",url:GOOGLE("royanews.tv"),lang:"ar"},
 {publisher:"عاجل السعودية",url:"https://ajel.sa/rss.xml",lang:"ar"},
 {publisher:"وكالة الأنباء السعودية واس",url:GOOGLE("spa.gov.sa"),lang:"ar"},
 {publisher:"القاهرة الإخبارية",url:GOOGLE("alqaheranews.net"),lang:"ar"},
 {publisher:"كونا",url:GOOGLE("kuna.net.kw"),lang:"ar"},
 {publisher:"المنار",url:GOOGLE("almanar.com.lb"),lang:"ar"},
 {publisher:"سبوتنيك عربي",url:GOOGLE("sputnikarabic.ae"),lang:"ar"},
 {publisher:"رويترز",url:GOOGLE("reuters.com","en"),lang:"en"},
 {publisher:"Associated Press",url:GOOGLE("apnews.com","en"),lang:"en"},
 {publisher:"BBC News",url:GOOGLE("bbc.com/news","en"),lang:"en"},
 {publisher:"AFP",url:GOOGLE("afp.com","en"),lang:"en"},
 {publisher:"EFE",url:GOOGLE("efe.com","en"),lang:"en"},
 {publisher:"dpa",url:GOOGLE("dpa.com","en"),lang:"en"},
 {publisher:"Kyodo News",url:GOOGLE("english.kyodonews.net","en"),lang:"en"},
 {publisher:"Jiji Press",url:GOOGLE("jiji.com","en"),lang:"en"},
 {publisher:"Xinhua",url:GOOGLE("news.cn","en"),lang:"en"},
 {publisher:"TASS",url:GOOGLE("tass.com","en"),lang:"en"},
 {publisher:"UPI",url:GOOGLE("upi.com","en"),lang:"en"},
 {publisher:"Yonhap News Agency",url:GOOGLE("yna.co.kr","en"),lang:"en"},
 {publisher:"NHK World",url:GOOGLE("nhk.or.jp","en"),lang:"en"},
 {publisher:"CNA",url:GOOGLE("channelnewsasia.com","en"),lang:"en"},
 {publisher:"Bernama",url:GOOGLE("bernama.com","en"),lang:"en"},
 {publisher:"ANSA",url:GOOGLE("ansa.it","en"),lang:"en"},
 {publisher:"The Hindu",url:GOOGLE("thehindu.com","en"),lang:"en"},
 {publisher:"The Times of India",url:GOOGLE("timesofindia.indiatimes.com","en"),lang:"en"},
 {publisher:"The Indian Express",url:GOOGLE("indianexpress.com","en"),lang:"en"},
 {publisher:"Hindustan Times",url:GOOGLE("hindustantimes.com","en"),lang:"en"},
 {publisher:"Dawn",url:GOOGLE("dawn.com","en"),lang:"en"},
 {publisher:"South China Morning Post",url:GOOGLE("scmp.com","en"),lang:"en"},
 {publisher:"The Japan Times",url:GOOGLE("japantimes.co.jp","en"),lang:"en"},
 {publisher:"Nikkei Asia",url:GOOGLE("asia.nikkei.com","en"),lang:"en"},
 {publisher:"The Korea Herald",url:GOOGLE("koreaherald.com","en"),lang:"en"},
 {publisher:"The Straits Times",url:GOOGLE("straitstimes.com","en"),lang:"en"},
 {publisher:"The Sydney Morning Herald",url:GOOGLE("smh.com.au","en"),lang:"en"},
 {publisher:"ABC News Australia",url:GOOGLE("abc.net.au","en"),lang:"en"},
 {publisher:"CBC News",url:GOOGLE("cbc.ca","en"),lang:"en"},
 {publisher:"The Globe and Mail",url:GOOGLE("theglobeandmail.com","en"),lang:"en"},
 {publisher:"Toronto Star",url:GOOGLE("thestar.com","en"),lang:"en"},
 {publisher:"Le Monde",url:GOOGLE("lemonde.fr","en"),lang:"en"},
 {publisher:"El País",url:GOOGLE("english.elpais.com","en"),lang:"en"},
 {publisher:"Der Spiegel",url:GOOGLE("spiegel.de","en"),lang:"en"},
 {publisher:"POLITICO Europe",url:GOOGLE("politico.eu","en"),lang:"en"},
 {publisher:"The Independent",url:GOOGLE("independent.co.uk","en"),lang:"en"},
 {publisher:"The Telegraph",url:GOOGLE("telegraph.co.uk","en"),lang:"en"},
 {publisher:"The Wall Street Journal",url:GOOGLE("wsj.com","en"),lang:"en"},
 {publisher:"Financial Times",url:GOOGLE("ft.com","en"),lang:"en"},
 {publisher:"The Economist",url:GOOGLE("economist.com","en"),lang:"en"},
 {publisher:"Bloomberg",url:GOOGLE("bloomberg.com","en"),lang:"en"},
 {publisher:"Axios",url:GOOGLE("axios.com","en"),lang:"en"},
 {publisher:"Newsweek",url:GOOGLE("newsweek.com","en"),lang:"en"},
 {publisher:"The Atlantic",url:GOOGLE("theatlantic.com","en"),lang:"en"},
 {publisher:"Semafor",url:GOOGLE("semafor.com","en"),lang:"en"},
 {publisher:"The Kyiv Independent",url:GOOGLE("kyivindependent.com","en"),lang:"en"},
 {publisher:"Ukrainska Pravda",url:GOOGLE("pravda.com.ua","en"),lang:"en"},
 {publisher:"The Washington Post",url:GOOGLE("washingtonpost.com","en"),lang:"en"},
 {publisher:"The Guardian",url:GOOGLE("theguardian.com","en"),lang:"en"}
];
function urgentRow(title,url,summary,date,feed,force=false) {
 if(!title||!/^https?:\/\//i.test(url)||(!force&&!URGENT.test(title))) return null;
 const dt=new Date(date||Date.now());
 if(Number.isNaN(dt.getTime())||Date.now()-dt.getTime()>2*60*60*1000||dt.getTime()>Date.now()+5*60*1000) return null;
 return {url,title:title.slice(0,500),summary:(summary||"").slice(0,3000),source_name:feed.publisher+" Breaking Desk",source_url:feed.type==="telegram"?"https://t.me/"+feed.handle:feed.url,category:"world",country:"دولي",lang:feed.lang,verification:"unconfirmed",published_at:dt.toISOString(),editorial_status:"published",ai_classification_status:"pending",is_breaking:true};
}
function parseTelegram(html,feed) {
 const starts=[...html.matchAll(/<div class="tgme_widget_message\b/g)].map(m=>m.index),out=[];
 for(let i=0;i<starts.length;i++) {
  const block=html.slice(starts[i],starts[i+1]??html.length);
  const body=(block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)||[])[1]||"";
  const date=(block.match(/<time[^>]*datetime=["']([^"']+)["']/i)||[])[1];
  const post=(block.match(/href=["'](https?:\/\/t\.me\/[^/"']+\/\d+)["']/i)||[])[1];
  const clean=decode(body); if(!clean||!date||!post) continue;
  const title=clean.split(/\n|\s{2,}/)[0].slice(0,500)||clean.slice(0,500);
  const item=urgentRow(title,post,clean,date,feed,true);
  if(item) {item.summary=clean.slice(0,3000);out.push(item);}
 }
 return out.slice(0,20);
}
function parseBreakingRss(xml,feed) {
 const blocks=xmlEntries(xml),isGoogle=String(feed.url||"").includes("news.google.com");
 return blocks.slice(0,20).map(block=>{
  const title=tag(block,["title"]),url=entryLink(block);
  const summary=tag(block,["description","summary","content"]);
  const date=tag(block,["pubDate","published","updated"]);
  return urgentRow(title,url,summary,date,feed,isGoogle);
 }).filter(Boolean);
}
async function collectBreaking(feed) {
 try {
  const url=feed.type==="telegram"?"https://t.me/s/"+feed.handle:feed.url;
  const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; WRLDLINE-Breaking/4.0)","Accept":"text/html,application/rss+xml,application/xml,*/*"},signal:AbortSignal.timeout(9000)});
  if(!r.ok) throw new Error("HTTP "+r.status);
  const body=await r.text();
  const raw=feed.type==="telegram"?(body.match(/tgme_widget_message\b/g)||[]).length:xmlEntries(body).length;
  const rows=feed.type==="telegram"?parseTelegram(body,feed):parseBreakingRss(body,feed);
  if(rows.length) {
   const saved=await dbRequest("articles?on_conflict=url",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)});
   if(!saved.ok) throw new Error("DB "+saved.status+" "+(await saved.text()).slice(0,160));
  }
  return {ok:true,raw,parsed:rows.length};
 } catch(e) { return {ok:false,raw:0,parsed:0,error:String(e?.message||e).slice(0,180)}; }
}
async function runBreaking() {
 const runId=await beginRun("breaking");
 let next=0; const results=new Array(FEEDS.length);
 async function worker() {
  while(next<FEEDS.length) { const i=next++; results[i]=await collectBreaking(FEEDS[i]); }
 }
 await Promise.all(Array.from({length:24},worker));
 const summary={pipeline:"breaking",feeds:FEEDS.length,successful:results.filter(x=>x?.ok).length,failed:results.filter(x=>!x?.ok).length,raw_items:results.reduce((n,x)=>n+(x?.raw||0),0),parsed_items:results.reduce((n,x)=>n+(x?.parsed||0),0),empty_sources:results.filter(x=>x?.ok&&x.raw===0).length};
 await updateRun(runId,{source_count:summary.feeds,successful_sources:summary.successful,failed_sources:summary.failed,parsed_items:summary.parsed_items,error_summary:results.filter(x=>!x?.ok).slice(0,12).map(x=>String(x?.error||"failed")).join(" | ")||null});
 return summary;
}


async function runProviderHealthcheck() {
 const response=await fetch(SUPABASE_URL+"/functions/v1/ai-provider-healthcheck",{
  method:"POST",
  headers:DB_HEADERS,
  body:"{}",
  signal:AbortSignal.timeout(90000)
 });
 const body=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error("Provider healthcheck HTTP "+response.status+": "+JSON.stringify(body).slice(0,350));
 return {pipeline:"provider-healthcheck",...body};
}

async function runTranslation() {
 const lockResponse=await dbRequest("rpc/claim_translation_worker",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
 if(!lockResponse.ok) throw new Error("Could not acquire translation worker lock: "+lockResponse.status+" "+(await lockResponse.text()).slice(0,180));
 const claimed=await lockResponse.json();
 if(claimed!==true) return {pipeline:"translation",skipped:"worker_busy"};
 try {
  const runId=await beginRun("translation");
  const pending:any[]=[];
  const perTarget={ar:0,en:0};
  const pageSize=500;
  let scanned=0;
  for(let offset=0;offset<20000 && pending.length<10;offset+=pageSize) {
   const params=new URLSearchParams({
    select:"id,title,summary,ai_summary,lang,url,source_name,article_translations(lang,title,summary,ai_summary)",
    editorial_status:"eq.published",order:"published_at.desc",limit:String(pageSize),offset:String(offset)
   });
   const response=await dbRequest("articles?"+params.toString());
   if(!response.ok) throw new Error("Translation scan failed at offset "+offset+": "+response.status+" "+(await response.text()).slice(0,180));
   const rows=await response.json();
   scanned+=rows.length;
   for(const article of rows) {
    if(!article.title) continue;
    const declared=String(article.lang||"").toLowerCase();
    const sourceLang=declared.startsWith("ar")?"ar":(declared.startsWith("en")?"en":(/[\\u0600-\\u06FF]/.test(article.title)?"ar":"en"));
    const target=sourceLang==="ar"?"en":"ar";
    const existing=(article.article_translations||[]).find((item:any)=>item.lang===target);
    const complete=!!(existing?.title&&existing?.summary&&(!article.ai_summary||existing?.ai_summary));
    if(!complete && perTarget[target as "ar"|"en"]<5) {
     pending.push({id:article.id,target,sourceLang,title:String(article.title).slice(0,100)});
     perTarget[target as "ar"|"en"]++;
    }
    if(pending.length>=10) break;
   }
   if(pending.length>=10 || rows.length<pageSize) break;
  }
  if(!pending.length) {
   await updateRun(runId,{source_count:0,successful_sources:0,failed_sources:0,parsed_items:0,error_summary:null});
   return {pipeline:"translation",scanned,selected:0,translated:0,already_translated:0,failed:0,deferred:0};
  }
  const response=await fetch(SUPABASE_URL+"/functions/v1/translate-articles",{
   method:"POST",
   headers:{...DB_HEADERS,"Content-Type":"application/json"},
   body:JSON.stringify({article_ids:pending.map(item=>item.id)}),
   signal:AbortSignal.timeout(155000)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error("Translator HTTP "+response.status+": "+JSON.stringify(body).slice(0,350));
  const results=Array.isArray(body.results)?body.results:[];
  const translated=results.filter((item:any)=>item.status==="translated").length;
  const already=results.filter((item:any)=>item.status==="already_translated").length;
  const failed=results.filter((item:any)=>item.status==="failed").length;
  const deferred=results.filter((item:any)=>item.status==="deferred").length;
  await updateRun(runId,{
   source_count:pending.length,
   successful_sources:translated+already,
   failed_sources:failed+deferred,
   parsed_items:pending.length,
   error_summary:results.filter((item:any)=>item.status==="failed"||item.status==="deferred").slice(0,8).map((item:any)=>String(item.id)+": "+String(item.error||item.status)).join(" | ")||null
  });
  return {pipeline:"translation",scanned,selected:pending.length,translated,already_translated:already,failed,deferred,targets:pending.map(item=>item.target),providers:body.providers_configured||null,concurrency:body.concurrency||null};
 } finally {
  await dbRequest("rpc/release_translation_worker",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).catch(()=>null);
 }
}
Deno.serve(async (req) => {
 if(req.method!=="POST") return Response.json({error:"POST required"},{status:405});
 if(!SERVICE_KEY) return Response.json({error:"Missing service key"},{status:500});
 const authCheck=await dbRequest("rpc/verify_wrldline_cron_secret",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({p_secret:req.headers.get("x-wrldline-cron-secret")||""})});
 if(!authCheck.ok || (await authCheck.json())!==true) return Response.json({error:"Unauthorized"},{status:401});
 let mode="unknown";
 try {
  const body=await req.json(); mode=body?.mode;
  const result=mode==="general"?await runGeneral():mode==="breaking"?await runBreaking():mode==="translation"?await runTranslation():mode==="provider-healthcheck"?await runProviderHealthcheck():null;
  if(!result) return Response.json({error:"mode must be general, breaking, translation, or provider-healthcheck"},{status:400});
  console.log("WRLDLINE_CRON_SUMMARY "+JSON.stringify(result));
  return Response.json({ok:true,...result});
 } catch(e) {
  console.error("WRLDLINE_CRON_ERROR",mode,String(e?.stack||e));
  return Response.json({ok:false,mode,error:String(e?.message||e)},{status:500});
 }
});
