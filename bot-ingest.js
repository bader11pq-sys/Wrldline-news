// WRLDLINE ingestion with bounded retries, publisher fallbacks and source-health tracking.
function googleNewsUrl(domain){return "https://news.google.com/rss/search?q="+encodeURIComponent("site:"+domain+" when:1d")+"&hl=ar&gl=SA&ceid=SA:ar";}
function googleNewsUrlEn(domain){return "https://news.google.com/rss/search?q="+encodeURIComponent("site:"+domain+" when:1d")+"&hl=en-US&gl=US&ceid=US:en";}
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
  // Newly added Arabic-language publishers (all entries deliver Arabic headlines)
  {url:"https://arabic.rt.com/rss/",name:"آر تي عربي",country:"دولي",fallbackUrl:googleNewsUrl("arabic.rt.com")},
  {url:"https://alikhbariya.net/feeds/sources/bb738d6c-83ed-4840-ae2b-217855abc379.xml",name:"النهار اللبنانية",country:"لبنان",fallbackUrl:googleNewsUrl("annahar.com")},
  {url:"https://alikhbariya.net/feeds/sources/f51d6e12-4518-4c15-9a3c-cd43dd8b8f94.xml",name:"العربي الجديد",country:"دولي",fallbackUrl:googleNewsUrl("alaraby.co.uk")},
  {url:"https://alikhbariya.net/feeds/sources/f65491e4-269b-4356-9f7e-6c92da9121f2.xml",name:"وكالة الأناضول العربية",country:"دولي",fallbackUrl:googleNewsUrl("aa.com.tr")},
  {url:"https://alikhbariya.net/feeds/sources/ba242115-5d30-4e48-9562-12c462f01111.xml",name:"القدس العربي",country:"فلسطين",fallbackUrl:googleNewsUrl("alquds.co.uk")},
  {url:"https://alikhbariya.net/feeds/sources/8c05d09d-1d37-4c04-a5f1-fb178eb9c49c.xml",name:"موزاييك إف إم",country:"تونس",fallbackUrl:googleNewsUrl("mosaiquefm.net")},
  {url:"https://alikhbariya.net/feeds/sources/7d02e6ac-19d7-40f8-b3dc-f868fa79ed32.xml",name:"يورونيوز عربي",country:"دولي",fallbackUrl:googleNewsUrl("arabic.euronews.com")},
  {url:"https://alikhbariya.net/feeds/sources/9df805b6-1e61-4414-b2cf-09c43f16ff71.xml",name:"الصباح المغربية",country:"المغرب",fallbackUrl:googleNewsUrl("assabah.ma")},
  {url:"https://alikhbariya.net/feeds/sources/0a01f2ab-c9f2-4ce5-a6e7-6c1e0fe8a7e9.xml",name:"الحرة",country:"دولي",fallbackUrl:googleNewsUrl("alhurra.com")},
  {url:"https://alikhbariya.net/feeds/sources/4e240c64-9b3f-4b11-a725-4a1114b9fd2b.xml",name:"عالم التقنية",country:"السعودية",fallbackUrl:googleNewsUrl("tech-wd.com")},
  {url:"https://alikhbariya.net/feeds/sources/4ac5181f-7809-40fe-a6d1-e9bce44aede8.xml",name:"أخبار الأمم المتحدة",country:"دولي",fallbackUrl:googleNewsUrl("news.un.org")},
  {url:"https://alikhbariya.net/feeds/sources/015f1c27-1e52-4bd9-8359-40f9e3da4910.xml",name:"اندبندنت عربية",country:"دولي",fallbackUrl:googleNewsUrl("independentarabia.com")},
  {url:"https://alikhbariya.net/feeds/sources/7d246b7a-398a-4807-8831-71d2134874c1.xml",name:"نون بوست",country:"دولي",fallbackUrl:googleNewsUrl("noonpost.com")},
  {url:"https://alikhbariya.net/feeds/sources/fb98f343-1c7e-4082-aa66-df9ff9f99242.xml",name:"البوابة العربية للأخبار التقنية",country:"السعودية",fallbackUrl:googleNewsUrl("aitnews.com")},
  {url:"https://ajel.sa/rss.xml",name:"عاجل",country:"السعودية"},
  {url:googleNewsUrl("alriyadh.com"),name:"الرياض",country:"السعودية"},
  {url:googleNewsUrl("okaz.com.sa"),name:"عكاظ",country:"السعودية"},
  {url:"https://www.lbcgroup.tv/Rss/latest-news/ar",name:"إل بي سي آي اللبنانية",country:"لبنان"},
  {url:googleNewsUrl("al-madina.com"),name:"المدينة",country:"السعودية"},
  {url:googleNewsUrl("shafaq.com/ar"),name:"شفق نيوز عربي",country:"العراق"},
  {url:googleNewsUrl("enabbaladi.net"),name:"عنب بلدي",country:"سوريا"},
  {url:googleNewsUrl("alsumaria.tv"),name:"السومرية",country:"العراق"},
  // Global
  {url:"https://feeds.bbci.co.uk/news/rss.xml",name:"BBC Top Stories",country:"دولي"},
  {url:"https://feeds.npr.org/1004/rss.xml",name:"NPR World",country:"دولي"},
  {url:"https://feeds.bbci.co.uk/news/world/rss.xml",name:"BBC World",country:"دولي"},
  {url:"https://www.aljazeera.com/xml/rss/all.xml",name:"Al Jazeera English",country:"دولي"},
  {url:"https://www.theguardian.com/world/rss",name:"The Guardian",country:"دولي"},
  {url:"https://rss.dw.com/xml/rss-en-all",name:"DW News",country:"دولي"},
  {url:"https://www.france24.com/en/rss",name:"France 24",country:"دولي"},
  {url:"https://feeds.npr.org/1001/rss.xml",name:"NPR",country:"دولي"},
  {url:"https://rss.nytimes.com/services/xml/rss/nyt/World.xml",name:"The New York Times",country:"دولي"},
  {url:"https://feeds.skynews.com/feeds/rss/world.xml",name:"Sky News",country:"دولي"},
  // Reuters, AP and CNN via Google News indexed publisher feeds
  {url:"https://news.google.com/rss/search?q=site%3Areuters.com+when%3A24h&hl=en-US&gl=US&ceid=US:en",name:"Reuters (Google News)",country:"دولي"},
  {url:"https://news.google.com/rss/search?q=site%3Aapnews.com+when%3A24h&hl=en-US&gl=US&ceid=US:en",name:"Associated Press (Google News)",country:"دولي"},
  {url:"https://news.google.com/rss/search?q=site%3Acnn.com+when%3A24h&hl=en-US&gl=US&ceid=US:en",name:"CNN (Google News)",country:"دولي"},
  // International wire agencies and global newspapers — added after checking the existing 60-source list
  {url:"https://www.afp.com/en/rss/all/news",name:"AFP",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("afp.com")},
  {url:googleNewsUrlEn("efe.com"),name:"EFE",country:"دولي",lang:"en"},
  {url:googleNewsUrlEn("dpa.com"),name:"dpa",country:"دولي",lang:"en"},
  {url:googleNewsUrlEn("english.kyodonews.net"),name:"Kyodo News",country:"دولي",lang:"en"},
  {url:googleNewsUrlEn("jiji.com"),name:"Jiji Press",country:"دولي",lang:"en"},
  {url:"https://english.news.cn/rss/world.xml",name:"Xinhua",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("news.cn")},
  {url:"https://tass.com/rss/v2.xml",name:"TASS",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("tass.com")},
  {url:"https://www.upi.com/rss/TopNews/",name:"UPI",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("upi.com")},
  {url:"https://en.yna.co.kr/RSS/news.xml",name:"Yonhap News Agency",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("yna.co.kr")},
  {url:googleNewsUrlEn("nhk.or.jp"),name:"NHK World",country:"دولي",lang:"en"},
  {url:"https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml",name:"CNA",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("channelnewsasia.com")},
  {url:"https://www.bernama.com/en/rss.php",name:"Bernama",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("bernama.com")},
  {url:"https://www.ansa.it/english/news/english_rss.xml",name:"ANSA",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("ansa.it")},
  {url:"https://www.thehindu.com/news/international/feeder/default.rss",name:"The Hindu",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("thehindu.com")},
  {url:"https://timesofindia.indiatimes.com/rssfeeds/296589292.cms",name:"The Times of India",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("timesofindia.indiatimes.com")},
  {url:"https://indianexpress.com/section/world/feed/",name:"The Indian Express",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("indianexpress.com")},
  {url:"https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml",name:"Hindustan Times",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("hindustantimes.com")},
  {url:"https://www.dawn.com/feeds/home",name:"Dawn",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("dawn.com")},
  {url:"https://www.scmp.com/rss/91/feed/",name:"South China Morning Post",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("scmp.com")},
  {url:"https://www.japantimes.co.jp/feed/",name:"The Japan Times",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("japantimes.co.jp")},
  {url:googleNewsUrlEn("asia.nikkei.com"),name:"Nikkei Asia",country:"دولي",lang:"en"},
  {url:googleNewsUrlEn("koreaherald.com"),name:"The Korea Herald",country:"دولي",lang:"en"},
  {url:"https://www.straitstimes.com/news/world/rss.xml",name:"The Straits Times",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("straitstimes.com")},
  {url:"https://www.smh.com.au/rss/feed.xml",name:"The Sydney Morning Herald",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("smh.com.au")},
  {url:"https://www.abc.net.au/news/feed/45910/rss.xml",name:"ABC News Australia",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("abc.net.au")},
  {url:"https://www.cbc.ca/webfeed/rss/rss-topstories",name:"CBC News",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("cbc.ca")},
  {url:"https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/world/",name:"The Globe and Mail",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("theglobeandmail.com")},
  {url:googleNewsUrlEn("thestar.com"),name:"Toronto Star",country:"دولي",lang:"en"},
  {url:"https://www.lemonde.fr/en/rss/une.xml",name:"Le Monde",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("lemonde.fr")},
  {url:"https://feeds.elpais.com/mrss-s/pages/ep/site/english.elpais.com/portada",name:"El País",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("english.elpais.com")},
  {url:"https://www.spiegel.de/international/index.rss",name:"Der Spiegel",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("spiegel.de")},
  {url:"https://www.politico.eu/feed/",name:"POLITICO Europe",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("politico.eu")},
  {url:"https://www.independent.co.uk/news/world/rss",name:"The Independent",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("independent.co.uk")},
  {url:"https://www.telegraph.co.uk/rss.xml",name:"The Telegraph",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("telegraph.co.uk")},
  {url:"https://feeds.content.dowjones.io/public/rss/RSSWorldNews",name:"The Wall Street Journal",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("wsj.com")},
  {url:"https://www.ft.com/world?format=rss",name:"Financial Times",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("ft.com")},
  {url:"https://www.economist.com/the-world-this-week/rss.xml",name:"The Economist",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("economist.com")},
  {url:"https://feeds.bloomberg.com/politics/news.rss",name:"Bloomberg",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("bloomberg.com")},
  {url:"https://api.axios.com/feed/",name:"Axios",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("axios.com")},
  {url:"https://www.newsweek.com/rss",name:"Newsweek",country:"دولي",lang:"en",fallbackUrl:googleNewsUrlEn("newsweek.com")}
];
const SUPABASE_URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY;
const HEADERS={apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"};
const CONCURRENCY=16;
function decode(s=""){return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&(?:rlm|lrm);/gi,"").replace(/&nbsp;/gi," ").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,"").replace(/\s*n2we&\s*$/i,"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
function tag(block,names){for(const name of names){const re=new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i");const m=block.match(re);if(m)return decode(m[1]);}return "";}
function entries(xml){const rss=xml.match(/<item\b[\s\S]*?<\/item>/gi)||[];const atom=xml.match(/<entry\b[\s\S]*?<\/entry>/gi)||[];return rss.length?rss:atom;}
function getLink(block){const rss=tag(block,["link"]);if(/^https?:\/\//i.test(rss))return rss;const m=block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);return m?decode(m[1]):tag(block,["guid","id"]);}
function getImage(block){const m=block.match(/<(?:enclosure|media:content|media:thumbnail)[^>]*(?:url|href)=["']([^"']+)["']/i)||block.match(/<img[^>]+src=["']([^"']+)["']/i);return m?m[1]:null;}
function safeDate(value){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d.toISOString();}
function isPublisherNoise(title: string) {
 const value=String(title||"").trim().toLowerCase();
 return /^(?:kuna news agency\s*-\s*كونا|- trt world|nam news network \(nnn\) - the non aligned movement - bernama|the non aligned movement - bernama|- japan wire by kyodo news|- جريدة الوطن السعودية|bernama mrem \(eng\) - bernama mrem|\| afp\.com - afp\.com|latest news - xinhua|جريدة الغد المطبوعة - جريدة الغد|- efe - agencia de noticias)$/i.test(value);
}
function parseEntry(block,feed){const title=tag(block,["title"]);const url=getLink(block);const summary=tag(block,["description","summary","content:encoded","content"]);const date=tag(block,["pubDate","published","updated","dc:date"]);const publishedAt=safeDate(date);if(!title||isPublisherNoise(title)||!/^https?:\/\//i.test(url)||!publishedAt)return null;const isArabic=/[\u0600-\u06FF]/.test(title);return {url,title:title.slice(0,500),summary:summary.slice(0,5000),image_url:getImage(block),category:"world",country:feed.country,source_name:feed.name,source_url:feed.url,lang:isArabic?"ar":"en",verification:"unconfirmed",published_at:publishedAt,ai_classification_status:"pending",editorial_status:"published"};}
async function fetchFeed(feed){
 const candidates=[feed.url,feed.fallbackUrl].filter(Boolean);let lastError="unknown";
 for(let candidate=0;candidate<candidates.length;candidate++){const url=candidates[candidate];try{
  let res=null;for(let attempt=0;attempt<3;attempt++){try{res=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; WRLDLINE-News/2.1; +https://al-ghaib.us.ci)","Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*"},signal:AbortSignal.timeout(12000)});if(res.ok||![408,425,429,500,502,503,504].includes(res.status))break;lastError="HTTP "+res.status;}catch(err){lastError=String(err).slice(0,180);}if(attempt<2)await new Promise(r=>setTimeout(r,700*(attempt+1)));}
  if(!res?.ok)throw new Error(lastError==="unknown"?"HTTP "+(res?.status||"network"):lastError);
  const xml=await res.text(),parsed=entries(xml).slice(0,25).map(x=>parseEntry(x,feed)).filter(Boolean),list=[...new Map(parsed.map(x=>[x.url,x])).values()];if(!list.length)throw new Error("No parseable RSS/Atom entries");
  for(let i=0;i<list.length;i+=50){const saved=await fetch(SUPABASE_URL+"/rest/v1/articles?on_conflict=url",{method:"POST",headers:{...HEADERS,Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(list.slice(i,i+50))});if(!saved.ok)throw new Error("Supabase HTTP "+saved.status+" "+(await saved.text()).slice(0,180));}
  const usedFallback=candidate>0;console.log("OK "+feed.name+": "+list.length+" entries"+(usedFallback?" via Google News fallback":""));return {name:feed.name,ok:true,count:list.length,usedFallback};
 }catch(e){lastError=String(e).slice(0,220);if(candidate===0&&feed.fallbackUrl)console.warn("FEED_PRIMARY_FAILED "+feed.name+": "+lastError+"; trying fallback");}}
 console.error("FEED_ERROR "+feed.name+": "+lastError);return {name:feed.name,ok:false,error:lastError};
}
async function recordFeedHealth(feed,result){try{const lang=feed.lang||(/BBC World|BBC Top Stories|CBC World|NPR|CNN \(|Reuters|Associated Press|Guardian|DW News|France 24|Al Jazeera English|Sky News/i.test(feed.name)?"en":"ar");const payload={name:feed.name,url:feed.url,lang,category:"world",active:true,last_fetched:result.ok?new Date().toISOString():null,last_error:result.ok?null:result.error};const response=await fetch(SUPABASE_URL+"/rest/v1/feeds?on_conflict=url",{method:"POST",headers:{...HEADERS,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});if(!response.ok)console.warn("FEED_HEALTH_WRITE_FAILED "+feed.name+": HTTP "+response.status);}catch(error){console.warn("FEED_HEALTH_WRITE_FAILED "+feed.name+": "+String(error).slice(0,120));}}
async function main(){if(!SUPABASE_URL||!KEY)throw new Error("Missing Supabase URL/service-role key");let next=0,results=[];async function worker(){while(next<FEEDS.length){const index=next++;results[index]=await fetchFeed(FEEDS[index]);}}await Promise.all(Array.from({length:CONCURRENCY},worker));await Promise.all(results.map((result,index)=>recordFeedHealth(FEEDS[index],result)));const ok=results.filter(x=>x.ok).length,failed=results.filter(x=>!x.ok);console.log("INGESTION_SUMMARY "+JSON.stringify({feeds:FEEDS.length,successful:ok,failed:failed.length,fallbacks:results.filter(x=>x.usedFallback).length,checked:results.reduce((n,x)=>n+(x.count||0),0)}));if(!ok)throw new Error("All configured news feeds failed");}
main().catch(e=>{console.error(e);process.exitCode=1;});
