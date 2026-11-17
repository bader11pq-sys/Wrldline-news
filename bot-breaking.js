// WRLDLINE breaking-news desk. Monitors 20 urgent publishers selected from the canonical 80-source RSS catalog.
const taxonomy=require("./taxonomy.js");
const fs=require("fs");
const URL=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const HEADERS={apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"};
const GOOGLE=(domain,lang="ar")=>{
 const q=`site:${domain} (breaking OR "just in" OR عاجل) when:1h`;
 return "https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl="+(lang==="ar"?"ar&gl=SA&ceid=SA:ar":"en-US&gl=US&ceid=US:en");
};
let FEEDS=[];
const urgent=/\bBREAKING\b|\bJUST IN\b|\bLIVE\b|عاجل|الآن|قبل قليل|تطور عاجل|نبأ عاجل/i;
function dec(s="",preserveLines=false){let value=String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));if(preserveLines)value=value.replace(/<br\s*\/?\s*>/gi,"\n").replace(/<\/(?:div|p|li)>/gi,"\n").replace(/<[^>]*>/g," ").replace(/[\t\f\v ]+/g," ").replace(/ *\n */g,"\n").replace(/\n{2,}/g,"\n").trim();else value=value.replace(/<br\s*\/?\s*>/gi," ").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();return value.replace(/&(?:rlm|lrm);/gi,"").replace(/&nbsp;/gi," ").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,"").replace(/\s*n2we&\s*$/i,"");}
function tag(b,n){const m=b.match(new RegExp("<"+n+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+n+">","i"));return m?dec(m[1]):"";}
function rssRows(xml,f){
 const blocks=xml.match(/<item\b[\s\S]*?<\/item>/gi)||xml.match(/<entry\b[\s\S]*?<\/entry>/gi)||[];
 return blocks.slice(0,20).map(b=>{
  const title=tag(b,"title"),link=(b.match(/<link\b[^>]*href=["']([^"']+)["']/i)||[])[1]||tag(b,"link");
  const summary=tag(b,"description")||tag(b,"summary")||tag(b,"content");
  const date=tag(b,"pubDate")||tag(b,"published")||tag(b,"updated");
  return row(title,link,summary,date,f);
 }).filter(Boolean);
}
function row(title,url,summary,date,f,force=false){
 if(!title||!/^https?:\/\//i.test(url)||(!force&&!urgent.test(title)))return null;
 const dt=date?new Date(date):null;if(!dt||Number.isNaN(dt.getTime())||Date.now()-dt.getTime()>2*60*60*1000||dt.getTime()>Date.now()+5*60*1000)return null;
 const sourceLanguage=f.lang==="ar"?"ar":(f.lang==="en"?"en":taxonomy.detectLanguage(title+" "+summary));
 const sourceScope=taxonomy.normalizeScope(f.source_scope||taxonomy.inferSourceScope({name:f.publisher,url:f.url||"",country:null}));
 return {url,title:title.slice(0,500),summary:(summary||"").slice(0,3000),source_name:f.publisher+" Breaking Desk",source_url:f.type==="telegram"?"https://t.me/"+f.handle:f.url,category:taxonomy.normalizeCategory(f.category),country:null,event_country:null,source_country:null,source_scope:sourceScope,source_language:sourceLanguage,language_detection:f.lang?"declared":"detected",lang:sourceLanguage,verification:"unconfirmed",published_at:dt.toISOString(),editorial_status:"published",ai_classification_status:"pending",classification_reason:"breaking_desk_unclassified",taxonomy_version:taxonomy.TAXONOMY_VERSION,is_breaking:true};
}
function telegramRows(html,f){
 const starts=[...html.matchAll(/<div class="tgme_widget_message\b/g)].map(m=>m.index),out=[];
 for(let i=0;i<starts.length;i++){
  const b=html.slice(starts[i],starts[i+1]??html.length);
  const text=(b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)||[])[1]||"";
  const date=(b.match(/<time[^>]*datetime=["']([^"']+)["']/i)||[])[1];
  const post=(b.match(/href=["'](https?:\/\/t\.me\/[^/"']+\/\d+)["']/i)||[])[1];
  const clean=dec(text,true);if(!clean||!date||!post)continue;
  const title=(clean.split(/\n+/).map(line=>line.trim()).find(Boolean)||clean).slice(0,500);
  const item=row(title,post,clean,date,f,true);if(item){item.summary=clean.slice(0,3000);out.push(item);}
 }
 return out.slice(0,20);
}
function rawItemCount(body,f){
 if(f.type==="telegram")return (body.match(/tgme_widget_message\b/g)||[]).length;
 return (body.match(/<item\b/gi)||body.match(/<entry\b/gi)||[]).length;
}
async function collect(f){
 try{
  const url=f.type==="telegram"?"https://t.me/s/"+f.handle:f.url;
  const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; WRLDLINE-Breaking/3.0)","Accept":"text/html,application/rss+xml,application/xml,*/*"},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error("HTTP "+r.status);
  const body=await r.text(),raw=rawItemCount(body,f),parsed=f.type==="telegram"?telegramRows(body,f):rssRows(body,f),rows=[...new Map(parsed.map(x=>[x.url,x])).values()];
  if(rows.length){
   const saved=await fetch(URL+"/rest/v1/articles?on_conflict=url",{method:"POST",headers:{...HEADERS,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)});
   if(!saved.ok)throw new Error("DB "+saved.status+" "+(await saved.text()).slice(0,150));
  }
  console.log("BREAKING_SOURCE "+f.publisher+": http="+r.status+" raw="+raw+" urgent="+rows.length);
  return {source:f.publisher,ok:true,http:r.status,raw,count:rows.length};
 }catch(e){console.error("BREAKING_SOURCE_ERROR "+f.publisher+": "+String(e.message||e).slice(0,180));return {source:f.publisher,ok:false,count:0,error:String(e.message||e).slice(0,180)};}
}
async function main(){
 if(!URL||!KEY)throw new Error("Missing Supabase credentials");
 const catalog=JSON.parse(fs.readFileSync("./source-catalog.json","utf8"));
 if(!Array.isArray(catalog)||catalog.length!==80)throw new Error("Expected exactly 80 canonical publisher sources");
 const uniqueUrls=new Set(catalog.map(f=>String(f.url||"")));
 if(uniqueUrls.size!==80||catalog.some(f=>!f.url||!f.name||!f.lang))throw new Error("The 80-source catalog contains missing or duplicate source records");
 const urgentSources=catalog.filter(f=>f.breaking===true);
 if(urgentSources.length!==20)throw new Error("Expected exactly 20 breaking-monitor sources in the 80-source catalog");
 if(urgentSources.some(f=>!f.breaking_domain))throw new Error("Every breaking-monitor source needs an explicit publisher domain");
 FEEDS=urgentSources.map(f=>({
  publisher:f.name,
  url:GOOGLE(f.breaking_domain,f.lang||"en"),
  lang:f.lang||"en",
  category:f.category||"world",
  country:f.country||null,
  source_scope:f.source_scope||"international",
  type:"rss"
 }));
 let next=0;const results=new Array(FEEDS.length);
 async function worker(){while(next<FEEDS.length){const i=next++;results[i]=await collect(FEEDS[i]);}}
 await Promise.all(Array.from({length:10},worker));
 const summary={
  configured_sources:80,
  breaking_sources:FEEDS.length,
  successful:results.filter(x=>x.ok).length,
  failed:results.filter(x=>!x.ok).length,
  alerts:results.reduce((n,x)=>n+x.count,0),
  raw_items:results.reduce((n,x)=>n+(x.raw||0),0),
  empty_sources:results.filter(x=>x.ok&&x.raw===0).map(x=>x.source)
 };
 console.log("BREAKING_SUMMARY "+JSON.stringify(summary));
 if(summary.successful===0)throw new Error("All 20 dedicated breaking-monitor sources failed");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
