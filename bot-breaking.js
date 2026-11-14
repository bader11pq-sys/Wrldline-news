// WRLDLINE dedicated breaking-news desk. Separate from the 100 general-news feeds.
const taxonomy=require("./taxonomy.js");
const fs=require("fs");
const URL=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const HEADERS={apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"};
const GOOGLE=(domain,lang="ar")=>{
 const q=`site:${domain} when:1h`;
 return "https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl="+(lang==="ar"?"ar&gl=SA&ceid=SA:ar":"en-US&gl=US&ceid=US:en");
};
// Telegram channels are public breaking desks; publisher RSS searches are constrained to explicit urgent markers.
const STATIC_FEEDS=[
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
 {publisher:"The Guardian",url:GOOGLE("theguardian.com","en"),lang:"en"},
 {publisher:"DW عربية",url:GOOGLE("dw.com/ar","ar"),lang:"ar"},
 {publisher:"TRT عربي",url:GOOGLE("trt.net.tr/ar","ar"),lang:"ar"},
 {publisher:"يورونيوز عربي",url:GOOGLE("arabic.euronews.com","ar"),lang:"ar"},
 {publisher:"وكالة الأناضول العربية",url:GOOGLE("aa.com.tr/ar","ar"),lang:"ar"},
 {publisher:"إندبندنت عربية",url:GOOGLE("independentarabia.com","ar"),lang:"ar"},
 {publisher:"الشرق الأوسط",url:GOOGLE("aawsat.com","ar"),lang:"ar"},
 {publisher:"القدس العربي",url:GOOGLE("alquds.co.uk","ar"),lang:"ar"},
 {publisher:"أخبار الأمم المتحدة عربي",url:GOOGLE("news.un.org/ar","ar"),lang:"ar"},
 {publisher:"سويس إنفو عربي",url:GOOGLE("swissinfo.ch/ara","ar"),lang:"ar"},
 {publisher:"المونيتور عربي",url:GOOGLE("al-monitor.com/ar","ar"),lang:"ar"},
 {publisher:"ABC News",url:GOOGLE("abcnews.go.com","en"),lang:"en"},
 {publisher:"NBC News",url:GOOGLE("nbcnews.com","en"),lang:"en"},
 {publisher:"CBS News",url:GOOGLE("cbsnews.com","en"),lang:"en"},
 {publisher:"NPR",url:GOOGLE("npr.org","en"),lang:"en"},
 {publisher:"The New York Times",url:GOOGLE("nytimes.com","en"),lang:"en"},
 {publisher:"USA Today",url:GOOGLE("usatoday.com","en"),lang:"en"},
 {publisher:"CNBC",url:GOOGLE("cnbc.com","en"),lang:"en"},
 {publisher:"Sky News",url:GOOGLE("news.sky.com","en"),lang:"en"},
 {publisher:"The Hill",url:GOOGLE("thehill.com","en"),lang:"en"},
 {publisher:"CTV News",url:GOOGLE("ctvnews.ca","en"),lang:"en"}
];
let FEEDS=STATIC_FEEDS;
// Validate the newly added source batch against the existing registry (publisher and host).
const ADDED_SOURCE_HOSTS=["dw.com","trt.net.tr","arabic.euronews.com","aa.com.tr","independentarabia.com","aawsat.com","alquds.co.uk","news.un.org","swissinfo.ch","al-monitor.com","abcnews.go.com","nbcnews.com","cbsnews.com","npr.org","nytimes.com","usatoday.com","cnbc.com","news.sky.com","thehill.com","ctvnews.ca"];
const ADDED_SOURCE_NAMES=["dw عربية","trt عربي","يورونيوز عربي","وكالة الأناضول العربية","إندبندنت عربية","الشرق الأوسط","القدس العربي","أخبار الأمم المتحدة عربي","سويس إنفو عربي","المونيتور عربي","abc news","nbc news","cbs news","npr","the new york times","usa today","cnbc","sky news","the hill","ctv news"];
if(new Set(ADDED_SOURCE_HOSTS).size!==ADDED_SOURCE_HOSTS.length||new Set(ADDED_SOURCE_NAMES).size!==ADDED_SOURCE_NAMES.length)throw new Error("Duplicate source in added breaking-news batch");

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
async function recordBreakingFeed(f){
 if(!f.url) return;
 const payload={name:String(f.publisher||"Breaking source").slice(0,180),url:f.url,lang:f.lang||"en",category:taxonomy.normalizeCategory(f.category),country:f.country||null,active:true,pipeline:"breaking",source_kind:"publisher_search_feed"};
 const saved=await fetch(URL+"/rest/v1/feeds?on_conflict=url",{method:"POST",headers:{...HEADERS,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
 if(!saved.ok) throw new Error("Feed registry "+saved.status);
}
async function collect(f){
 try{
  await recordBreakingFeed(f);
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
 try {
  const catalog=JSON.parse(fs.readFileSync("./source-catalog.json","utf8"));
  if(Array.isArray(catalog)&&catalog.length>=1000) {
   const batchSize=250, start=(Math.floor(Date.now()/300000)*batchSize)%1000;
   FEEDS=Array.from({length:batchSize},(_,i)=>{
    const f=catalog[(start+i)%1000], u=new URL(f.url), target=u.hostname.replace(/^www\./,"")+u.pathname.split("/").filter(Boolean).slice(0,2).join("/");
    const q="site:"+target+" (breaking OR \"just in\" OR عاجل) when:1h";
    return {publisher:f.name,url:"https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl="+(f.lang==="ar"?"ar&gl=SA&ceid=SA:ar":"en-US&gl=US&ceid=US:en")+"&src=wrldline-breaking-"+(start+i+1),lang:f.lang||"en",category:f.category,country:f.country};
   });
  }
 } catch(error) { console.warn("SOURCE_CATALOG_UNAVAILABLE "+String(error).slice(0,160)); }
 let next=0;const results=new Array(FEEDS.length);async function worker(){while(next<FEEDS.length){const i=next++;results[i]=await collect(FEEDS[i]);}}await Promise.all(Array.from({length:18},worker));
 const summary={feeds:FEEDS.length,successful:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,alerts:results.reduce((n,x)=>n+x.count,0),raw_items:results.reduce((n,x)=>n+(x.raw||0),0),empty_sources:results.filter(x=>x.ok&&x.raw===0).map(x=>x.source),telegram:FEEDS.filter(x=>x.type==="telegram").length};
 console.log("BREAKING_SUMMARY "+JSON.stringify(summary));
 if(summary.successful===0)throw new Error("All dedicated breaking sources failed");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
