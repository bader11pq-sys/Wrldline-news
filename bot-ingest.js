// WRLDLINE ingestion with bounded retries, publisher fallbacks and source-health tracking.
function googleNewsUrl(domain){return "https://news.google.com/rss/search?q="+encodeURIComponent("site:"+domain+" when:1d")+"&hl=ar&gl=SA&ceid=SA:ar";}
const FEEDS = [
  // Arabic - Gulf and pan-Arab
  {url:"https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9",name:"الجزيرة",country:"دولي"},
  {url:"https://feeds.bbci.co.uk/arabic/rss.xml",name:"BBC عربي",country:"دولي"},
  {url:"https://arabic.cnn.com/api/v1/rss/rss.xml",name:"CNN عربية",country:"دولي"},
  {url:"https://www.alarabiya.net/feed",name:"العربية",country:"دولي",fallbackUrl:googleNewsUrl("alarabiya.net")},
  {url:"https://aawsat.com/feed",name:"الشرق الأوسط",country:"دولي"},
  {url:"https://www.skynewsarabia.com/web/rss",name:"سكاي نيوز عربية",country:"دولي"},
  {url:"https://www.france24.com/ar/rss",name:"فرانس 24 عربي",country:"دولي"},
  {url:"https://rss.dw.com/xml/rss-ar-all",name:"DW عربية",country:"دولي"},
  // Gulf official and regional
  {url:"https://www.spa.gov.sa/rss",name:"وكالة الأنباء السعودية واس",country:"السعودية",fallbackUrl:googleNewsUrl("spa.gov.sa")},
  {url:"https://www.kuna.net.kw/rss",name:"كونا",country:"الكويت",fallbackUrl:googleNewsUrl("kuna.net.kw")},
  {url:"https://www.alkhaleej.ae/rss",name:"الخليج",country:"الإمارات",fallbackUrl:googleNewsUrl("alkhaleej.ae")},
  {url:"https://www.alittihad.ae/rss",name:"الاتحاد",country:"الإمارات",fallbackUrl:googleNewsUrl("alittihad.ae")},
  {url:"https://www.albayan.ae/rss",name:"البيان",country:"الإمارات",fallbackUrl:googleNewsUrl("albayan.ae")},
  {url:"https://www.alsharq.net/rss",name:"الشرق",country:"قطر",fallbackUrl:googleNewsUrl("al-sharq.com")},
  // Egypt and Levant
  {url:"https://www.youm7.com/rss/SectionRss?SectionID=97",name:"اليوم السابع",country:"مصر"},
  {url:"https://www.almasryalyoum.com/rss",name:"المصري اليوم",country:"مصر",fallbackUrl:googleNewsUrl("almasryalyoum.com")},
  {url:"https://www.alghad.com/feed",name:"الغد",country:"الأردن",fallbackUrl:googleNewsUrl("alghad.com")},
  {url:"https://royanews.tv/rss",name:"رؤيا",country:"الأردن"},
  {url:"https://www.almodon.com/rss",name:"المدن",country:"لبنان"},
  {url:"https://www.maannews.net/rss",name:"معاً",country:"فلسطين",fallbackUrl:googleNewsUrl("maannews.net")},
  {url:"https://arabi21.com/feed",name:"عربي21",country:"دولي"},
  // North Africa
  {url:"https://www.hespress.com/feed",name:"هسبريس",country:"المغرب"},
  {url:"https://www.echoroukonline.com/feed",name:"الشروق",country:"الجزائر"},
  {url:"https://www.tunisienumerique.com/feed/",name:"تونس الرقمية",country:"تونس",fallbackUrl:googleNewsUrl("tunisienumerique.com")},
  {url:"https://www.libyaakhbar.com/feed/",name:"ليبيا أخبار",country:"ليبيا",fallbackUrl:googleNewsUrl("libyaakhbar.com")},
  // Global
  {url:"https://feeds.bbci.co.uk/news/rss.xml",name:"BBC Top Stories",country:"دولي"},
  {url:"https://www.cbc.ca/webfeed/rss/rss-world",name:"CBC World",country:"دولي",fallbackUrl:googleNewsUrl("cbc.ca")},
  {url:"https://feeds.bbci.co.uk/news/world/rss.xml",name:"BBC World",country:"دولي"},
  {url:"https://www.aljazeera.com/xml/rss/all.xml",name:"Al Jazeera English",country:"دولي"},
  {url:"https://www.theguardian.com/world/rss",name:"The Guardian",country:"دولي"},
  {url:"https://rss.dw.com/xml/rss-en-all",name:"DW News",country:"دولي"},
  {url:"https://www.france24.com/en/rss",name:"France 24",country:"دولي"},
  {url:"https://feeds.npr.org/1001/rss.xml",name:"NPR",country:"دولي"},
  {url:"https://rss.nytimes.com/services/xml/rss/nyt/World.xml",name:"The New York Times",country:"دولي"},
  {url:"https://feeds.skynews.com/feeds/rss/world.xml",name:"Sky News",country:"دولي"},
  // Reuters, AP and CNN via Google News indexed publisher feeds
  {url:"https://news.google.com/rss/search?q=site%3Areuters.com+when%3A1h&hl=en-US&gl=US&ceid=US:en",name:"Reuters (Google News)",country:"دولي"},
  {url:"https://news.google.com/rss/search?q=site%3Aapnews.com+when%3A1h&hl=en-US&gl=US&ceid=US:en",name:"Associated Press (Google News)",country:"دولي"},
  {url:"https://news.google.com/rss/search?q=site%3Acnn.com+when%3A1h&hl=en-US&gl=US&ceid=US:en",name:"CNN (Google News)",country:"دولي"}
];
const SUPABASE_URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY;
const HEADERS={apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"};
const CONCURRENCY=8;
function decode(s=""){return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
function tag(block,names){for(const name of names){const re=new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i");const m=block.match(re);if(m)return decode(m[1]);}return "";}
function entries(xml){const rss=xml.match(/<item\b[\s\S]*?<\/item>/gi)||[];const atom=xml.match(/<entry\b[\s\S]*?<\/entry>/gi)||[];return rss.length?rss:atom;}
function getLink(block){const rss=tag(block,["link"]);if(/^https?:\/\//i.test(rss))return rss;const m=block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);return m?decode(m[1]):tag(block,["guid","id"]);}
function getImage(block){const m=block.match(/<(?:enclosure|media:content|media:thumbnail)[^>]*(?:url|href)=["']([^"']+)["']/i)||block.match(/<img[^>]+src=["']([^"']+)["']/i);return m?m[1]:null;}
function safeDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString();}
function parseEntry(block,feed){const title=tag(block,["title"]);const url=getLink(block);const summary=tag(block,["description","summary","content:encoded","content"]);const date=tag(block,["pubDate","published","updated","dc:date"]);if(!title||!/^https?:\/\//i.test(url))return null;const isArabic=/[\u0600-\u06FF]/.test(title);return {url,title:title.slice(0,500),summary:summary.slice(0,5000),image_url:getImage(block),category:"world",country:feed.country,source_name:feed.name,source_url:feed.url,lang:isArabic?"ar":"en",verification:"unconfirmed",published_at:safeDate(date),ai_classification_status:"pending",editorial_status:"published"};}
async function fetchFeed(feed){
 const candidates=[feed.url,feed.fallbackUrl].filter(Boolean);let lastError="unknown";
 for(let candidate=0;candidate<candidates.length;candidate++){const url=candidates[candidate];try{
  let res=null;for(let attempt=0;attempt<3;attempt++){try{res=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; WRLDLINE-News/2.1; +https://al-ghaib.us.ci)","Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*"},signal:AbortSignal.timeout(18000)});if(res.ok||![408,425,429,500,502,503,504].includes(res.status))break;lastError="HTTP "+res.status;}catch(err){lastError=String(err).slice(0,180);}if(attempt<2)await new Promise(r=>setTimeout(r,700*(attempt+1)));}
  if(!res?.ok)throw new Error(lastError==="unknown"?"HTTP "+(res?.status||"network"):lastError);
  const xml=await res.text(),list=entries(xml).slice(0,25).map(x=>parseEntry(x,feed)).filter(Boolean);if(!list.length)throw new Error("No parseable RSS/Atom entries");
  for(let i=0;i<list.length;i+=50){const saved=await fetch(SUPABASE_URL+"/rest/v1/articles?on_conflict=url",{method:"POST",headers:{...HEADERS,Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(list.slice(i,i+50))});if(!saved.ok)throw new Error("Supabase HTTP "+saved.status+" "+(await saved.text()).slice(0,180));}
  const usedFallback=candidate>0;console.log("OK "+feed.name+": "+list.length+" entries"+(usedFallback?" via Google News fallback":""));return {name:feed.name,ok:true,count:list.length,usedFallback};
 }catch(e){lastError=String(e).slice(0,220);if(candidate===0&&feed.fallbackUrl)console.warn("FEED_PRIMARY_FAILED "+feed.name+": "+lastError+"; trying fallback");}}
 console.error("FEED_ERROR "+feed.name+": "+lastError);return {name:feed.name,ok:false,error:lastError};
}
async function recordFeedHealth(feed,result){try{const lang=/BBC World|BBC Top Stories|CBC World|NPR|CNN \(|Reuters|Associated Press|Guardian|DW News|France 24|Al Jazeera English|Sky News/i.test(feed.name)?"en":"ar";const payload={name:feed.name,url:feed.url,lang,category:"world",active:true,last_fetched:result.ok?new Date().toISOString():null,last_error:result.ok?null:result.error};const response=await fetch(SUPABASE_URL+"/rest/v1/feeds?on_conflict=url",{method:"POST",headers:{...HEADERS,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});if(!response.ok)console.warn("FEED_HEALTH_WRITE_FAILED "+feed.name+": HTTP "+response.status);}catch(error){console.warn("FEED_HEALTH_WRITE_FAILED "+feed.name+": "+String(error).slice(0,120));}}
async function main(){if(!SUPABASE_URL||!KEY)throw new Error("Missing Supabase URL/service-role key");let next=0,results=[];async function worker(){while(next<FEEDS.length){const index=next++;results[index]=await fetchFeed(FEEDS[index]);}}await Promise.all(Array.from({length:CONCURRENCY},worker));await Promise.all(results.map((result,index)=>recordFeedHealth(FEEDS[index],result)));const ok=results.filter(x=>x.ok).length,failed=results.filter(x=>!x.ok);console.log("INGESTION_SUMMARY "+JSON.stringify({feeds:FEEDS.length,successful:ok,failed:failed.length,fallbacks:results.filter(x=>x.usedFallback).length,checked:results.reduce((n,x)=>n+(x.count||0),0)}));if(!ok)throw new Error("All configured news feeds failed");}
main().catch(e=>{console.error(e);process.exitCode=1;});
