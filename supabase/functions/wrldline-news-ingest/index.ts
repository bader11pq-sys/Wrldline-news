import { normalizeCategory, resolveSourceLanguage, normalizeScope, inferSourceScope, TAXONOMY_VERSION } from "../_shared/taxonomy.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://vmaxbnogmmfyrcucapnq.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const DB_HEADERS = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" };
const URGENT = /\bBREAKING(?: NEWS)?\b|\bJUST IN\b|\bLIVE\b|عاجل|الآن|قبل قليل|تطور عاجل|نبأ عاجل|خبر عاجل/i;
const COUNTRY_BY_NAME = {"الجزيرة":"دولي","BBC عربي":"دولي","CNN عربية":"دولي","العربية":"دولي","الشرق الأوسط":"دولي","سكاي نيوز عربية":"دولي","فرانس 24 عربي":"دولي","DW عربية":"دولي","وكالة الأنباء السعودية واس":"السعودية","كونا":"الكويت","الخليج":"الإمارات","الاتحاد":"الإمارات","البيان":"الإمارات","الشرق":"قطر","اليوم السابع":"مصر","المصري اليوم":"مصر","الغد":"الأردن","رؤيا":"الأردن","المدن":"لبنان","معاً":"فلسطين","عربي21":"دولي","هسبريس":"المغرب","الشروق":"الجزائر","تونس الرقمية":"تونس","ليبيا أخبار":"ليبيا","آر تي عربي":"دولي","النهار اللبنانية":"لبنان","العربي الجديد":"دولي","وكالة الأناضول العربية":"دولي","القدس العربي":"فلسطين","موزاييك إف إم":"تونس","يورونيوز عربي":"دولي","الصباح المغربية":"المغرب","الحرة":"دولي","عالم التقنية":"السعودية","أخبار الأمم المتحدة":"دولي","اندبندنت عربية":"دولي","نون بوست":"دولي","البوابة العربية للأخبار التقنية":"السعودية","عاجل":"السعودية","الرياض":"السعودية","عكاظ":"السعودية","إل بي سي آي اللبنانية":"لبنان","المدينة":"السعودية","شفق نيوز عربي":"العراق","عنب بلدي":"سوريا","السومرية":"العراق","BBC Top Stories":"دولي","NPR World":"دولي","BBC World":"دولي","Al Jazeera English":"دولي","The Guardian":"دولي","DW News":"دولي","France 24":"دولي","NPR":"دولي","The New York Times":"دولي","Sky News":"دولي","Reuters (Google News)":"دولي","Associated Press (Google News)":"دولي","CNN (Google News)":"دولي","AFP":"دولي","EFE":"دولي","dpa":"دولي","Kyodo News":"دولي","Jiji Press":"دولي","Xinhua":"دولي","TASS":"دولي","UPI":"دولي","Yonhap News Agency":"دولي","NHK World":"دولي","CNA":"دولي","Bernama":"دولي","ANSA":"دولي","The Hindu":"دولي","The Times of India":"دولي","The Indian Express":"دولي","Hindustan Times":"دولي","Dawn":"دولي","South China Morning Post":"دولي","The Japan Times":"دولي","Nikkei Asia":"دولي","The Korea Herald":"دولي","The Straits Times":"دولي","The Sydney Morning Herald":"دولي","ABC News Australia":"دولي","CBC News":"دولي","The Globe and Mail":"دولي","Toronto Star":"دولي","Le Monde":"دولي","El País":"دولي","Der Spiegel":"دولي","POLITICO Europe":"دولي","The Independent":"دولي","The Telegraph":"دولي","The Wall Street Journal":"دولي","Financial Times":"دولي","The Economist":"دولي","Bloomberg":"دولي","Axios":"دولي","Newsweek":"دولي"};

function decode(value = "", preserveLines = false) {
 let text=String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
  .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'")
  .replace(/&lt;/g,"<").replace(/&gt;/g,">")
  .replace(/&(?:rlm|lrm);/gi,"").replace(/&nbsp;/gi," ")
  .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,"").replace(/\s*n2we&\s*$/i,"");
 if(preserveLines) return text.replace(/<br\s*\/?\s*>/gi,"\n").replace(/<\/(?:div|p|li)>/gi,"\n").replace(/<[^>]*>/g," ").replace(/[\t\f\v ]+/g," ").replace(/ *\n */g,"\n").replace(/\n{2,}/g,"\n").trim();
 return text.replace(/<br\s*\/?\s*>/gi," ").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}
function tag(block: string,names: string[]) {
 for (const name of names) {
  const re=new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i");
  const m=block.match(re); if(m) return decode(m[1]);
 }
 return "";
}
function xmlEntries(xml: string) {
 const rss=xml.match(/<item\b[\s\S]*?<\/item>/gi)||[];
 const atom=xml.match(/<entry\b[\s\S]*?<\/entry>/gi)||[];
 return rss.length?rss:atom;
}
function entryLink(block: string) {
 const href=(block.match(/<link\b[^>]*href=["']([^"']+)["']/i)||[])[1];
 if(href) return decode(href);
 const link=tag(block,["link"]);
 if(/^https?:\/\//i.test(link)) return link;
 return tag(block,["guid","id"]);
}
function entryImage(block: string) {
 const m=block.match(/<(?:enclosure|media:content|media:thumbnail)[^>]*(?:url|href)=["']([^"']+)["']/i)||block.match(/<img[^>]+src=["']([^"']+)["']/i);
 return m?decode(m[1]):null;
}
function parsedDate(value: string | null | undefined) {
 if(!value) return null;
 const d=new Date(value);
 return Number.isNaN(d.getTime())?null:d.toISOString();
}
async function requestText(url: string,timeout=7000) {
 const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; WRLDLINE-News/3.0; +https://al-ghaib.us.ci)","Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml, */*"},signal:AbortSignal.timeout(timeout)});
 if(!r.ok) throw new Error("HTTP "+r.status);
 return await r.text();
}
function googleFallback(feed: any) {
 try {
  const u=new URL(feed.url);
  if(u.hostname.includes("news.google.com")) return null;
  const rawDomain=u.hostname.replace(/^www\./,""); const domain=rawDomain==="alsharq.net"?"al-sharq.com":rawDomain;
  const english=feed.lang==="en";
  const q="site:"+domain+" when:1d";
  return "https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl="+(english?"en-US&gl=US&ceid=US:en":"ar&gl=SA&ceid=SA:ar");
 } catch { return null; }
}
function isPublisherNoise(title: string) {
 const value=String(title||"").trim().toLowerCase();
 return /^(?:kuna news agency\s*-\s*كونا|- trt world|nam news network \(nnn\) - the non aligned movement - bernama|the non aligned movement - bernama|- japan wire by kyodo news|- جريدة الوطن السعودية|bernama mrem \(eng\) - bernama mrem|\| afp\.com - afp\.com|latest news - xinhua|جريدة الغد المطبوعة - جريدة الغد|- efe - agencia de noticias)$/i.test(value);
}
function parseGeneral(xml: string,feed: any) {
 return xmlEntries(xml).slice(0,25).map((block: string)=>{
  const title=tag(block,["title"]),url=entryLink(block);
  if(!title||isPublisherNoise(title)||!/^https?:\/\//i.test(url)) return null;
  const summary=tag(block,["description","summary","content:encoded","content"]);
  const date=tag(block,["pubDate","published","updated","dc:date"]);
  const publishedAt=parsedDate(date);
  if(!publishedAt) return null;
  const language=resolveSourceLanguage(feed.lang,title+" "+summary);
  const category=normalizeCategory(feed.category);
  const sourceScope=normalizeScope(feed.source_scope||inferSourceScope(feed));
  return {url,title:title.slice(0,500),summary:summary.slice(0,5000),image_url:entryImage(block),category,feed_id:feed.id||null,country:null,event_country:null,source_scope:sourceScope,source_language:language.language,language_detection:language.detection,source_name:feed.name,source_url:feed.url,lang:language.language,verification:"unconfirmed",published_at:publishedAt,ai_classification_status:"pending",editorial_status:"published",classification_reason:category==="uncategorized"?"unclassified_source":"rss_source_section",taxonomy_version:TAXONOMY_VERSION};
 }).filter(Boolean);
}
async function dbRequest(path: string,init: RequestInit & {headers?: Record<string,string>} = {}) {
 return await fetch(SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{...DB_HEADERS,...(init.headers||{})}});
}
async function updateRun(id: string | number,patch: Record<string,unknown>) {
 if(!id) return;
 await dbRequest("news_ingestion_runs?id=eq."+id,{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({...patch,finished_at:new Date().toISOString()})});
}
async function beginRun(pipeline: string) {
 const r=await dbRequest("news_ingestion_runs",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({pipeline,trigger_source:"supabase_cron"})});
 if(!r.ok) throw new Error("Run log insert failed: "+r.status+" "+(await r.text()).slice(0,180));
 const rows=await r.json(); return rows?.[0]?.id;
}
async function processGeneralFeed(feed: any) {
 let lastError="No parseable entries";
 const candidates=[feed.url,googleFallback(feed)].filter(Boolean);
 for(let i=0;i<candidates.length;i++) {
  try {
   const xml=await requestText(candidates[i],7000);
   const parsedRows=parseGeneral(xml,feed);
   const rows=[...new Map(parsedRows.map((row:any)=>[row.url,row])).values()];
   if(!rows.length) throw new Error("Feed returned no parseable RSS/Atom entries");
   const saved=await dbRequest("articles?on_conflict=url",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(rows)});
   if(!saved.ok) throw new Error("Database HTTP "+saved.status+" "+(await saved.text()).slice(0,160));
   return {ok:true,name:feed.name,parsed:rows.length,usedFallback:i>0};
  } catch(e: any) { lastError=String(e?.message||e).slice(0,200); }
 }
 return {ok:false,name:feed.name,parsed:0,error:lastError};
}
async function setFeedHealth(feed: any,result: any) {
 const query="feeds?url=eq."+encodeURIComponent(feed.url);
 const patch={last_fetched:result.ok?new Date().toISOString():null,last_error:result.ok?null:result.error,active:true,category:normalizeCategory(feed.category),lang:feed.lang||"en",source_scope:normalizeScope(feed.source_scope||inferSourceScope(feed))};
 const r=await dbRequest(query,{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify(patch)});
 return r.ok;
}
async function runGeneral() {
 const r=await dbRequest("feeds?select=id,name,url,lang,category,source_scope,active&active=eq.true&order=name.asc");
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
 await Promise.all(Array.from({length:16},worker));
 const summary={pipeline:"general",feeds:feeds.length,successful:results.filter(x=>x?.ok).length,failed:results.filter(x=>!x?.ok).length,parsed_items:results.reduce((n,x)=>n+(x?.parsed||0),0),fallbacks:results.filter(x=>x?.usedFallback).length};
 await updateRun(runId,{source_count:summary.feeds,successful_sources:summary.successful,failed_sources:summary.failed,parsed_items:summary.parsed_items,error_summary:results.filter(x=>!x?.ok).slice(0,12).map(x=>String(x?.name||"unknown")+": "+String(x?.error||"failed")).join(" | ")||null});
 return summary;
}

// Dedicated 90-source urgent polling runs in bot-breaking.js through GitHub Actions.
// This cron worker classifies urgent headlines already collected by the 146-feed newsroom,
// avoiding a second burst of 90 external requests from the Supabase Edge runtime.
async function runBreaking() {
 const runId=await beginRun("breaking");
 const cutoff=new Date(Date.now()-2*60*60*1000).toISOString();
 const response=await dbRequest("articles?select=id,title,source_name,published_at,is_breaking&editorial_status=eq.published&published_at=gte."+encodeURIComponent(cutoff)+"&or=(is_breaking.eq.false,is_breaking.is.null)&order=published_at.desc&limit=2000");
 if(!response.ok) throw new Error("Breaking scan failed: "+response.status+" "+(await response.text()).slice(0,180));
 const rows=await response.json();
 const matches=rows.filter((article:any)=>{
  const published=Date.parse(article.published_at||"");
  const age=Date.now()-published;
  return typeof article.title==="string"&&URGENT.test(article.title)&&Number.isFinite(published)&&age>=-300000&&age<=2*60*60*1000;
 }).slice(0,500);
 for(let offset=0;offset<matches.length;offset+=100) {
  const ids=matches.slice(offset,offset+100).map((article:any)=>article.id).filter(Boolean);
  if(!ids.length) continue;
  const saved=await dbRequest("articles?id=in.("+ids.join(",")+")",{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({is_breaking:true})});
  if(!saved.ok) throw new Error("Could not flag urgent articles: "+saved.status+" "+(await saved.text()).slice(0,180));
 }
 const sources=new Set(matches.map((article:any)=>String(article.source_name||"").trim()).filter(Boolean));
 await updateRun(runId,{source_count:sources.size,successful_sources:sources.size,failed_sources:0,parsed_items:matches.length,error_summary:null});
 return {pipeline:"breaking",scanned:rows.length,flagged:matches.length,sources:sources.size};
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
  for(let offset=0;offset<20000 && pending.length<20;offset+=pageSize) {
   const params=new URLSearchParams({
    select:"id,title,summary,ai_summary,lang,url,source_name,is_breaking,published_at,received_at,translation_attempts,translation_retry_after,article_translations(lang,title,summary,ai_summary,translation_status,translation_source)",
    editorial_status:"eq.published",published_at:"gte."+new Date(Date.now()-3600000).toISOString(),order:"is_breaking.desc,published_at.desc",limit:String(pageSize),offset:String(offset)
   });
   const response=await dbRequest("articles?"+params.toString());
   if(!response.ok) throw new Error("Translation scan failed at offset "+offset+": "+response.status+" "+(await response.text()).slice(0,180));
   const rows=await response.json();
   scanned+=rows.length;
   for(const article of rows) {
    if(!article.title) continue;
    const published=Date.parse(article.published_at||article.received_at||"");
    const age=Date.now()-published;
    if(!Number.isFinite(published)||age < -300000||age > 3600000) continue;
    if(article.translation_retry_after && Date.parse(article.translation_retry_after)>Date.now()) continue;
    const declared=String(article.lang||"").toLowerCase();
    const sourceLang=declared.startsWith("ar")?"ar":(declared.startsWith("en")?"en":(/[\u0600-\u06FF]/.test(article.title)?"ar":"en"));
    const target=sourceLang==="ar"?"en":"ar";
    const existing=(article.article_translations||[]).find((item:any)=>item.lang===target);
    const complete=!!(existing?.title&&existing?.summary&&existing?.translation_status==="published"&&(!article.ai_summary||existing?.ai_summary));
    if(!complete && perTarget[target as "ar"|"en"]<10) {
     pending.push({id:article.id,target,sourceLang,title:String(article.title).slice(0,100)});
     perTarget[target as "ar"|"en"]++;
    }
    if(pending.length>=20) break;
   }
   if(pending.length>=20 || rows.length<pageSize) break;
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
  const returnedIds=new Set(results.map((item:any)=>String(item.id)));
  const missing=pending.filter(item=>!returnedIds.has(String(item.id)));
  const translated=results.filter((item:any)=>item.status==="translated").length;
  const already=results.filter((item:any)=>item.status==="already_translated").length;
  const failed=results.filter((item:any)=>item.status==="failed").length;
  const deferred=results.filter((item:any)=>item.status==="deferred").length+missing.length;
  await updateRun(runId,{
   source_count:pending.length,
   successful_sources:translated+already,
   failed_sources:failed+deferred,
   parsed_items:pending.length,
   error_summary:[...results.filter((item:any)=>item.status==="failed"||item.status==="deferred").map((item:any)=>String(item.id)+": "+String(item.error||item.status)),...missing.map((item:any)=>String(item.id)+": not returned by translator")].slice(0,8).join(" | ")||null
  });
  return {pipeline:"translation",scanned,selected:pending.length,translated,already_translated:already,failed,deferred,targets:pending.map(item=>item.target),providers:body.providers_configured||null,deepl_quota_exhausted:body.deepl_quota_exhausted||false,deepl_disabled_until:body.deepl_disabled_until||null,translation_priority:body.translation_priority||null,concurrency:body.concurrency||null};
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
 } catch(e: any) {
  console.error("WRLDLINE_CRON_ERROR",mode,String(e?.stack||e));
  return Response.json({ok:false,mode,error:String(e?.message||e)},{status:500});
 }
});
