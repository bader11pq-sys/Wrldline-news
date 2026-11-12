// Fast, dedicated breaking-news collector. Only explicit urgent headlines are accepted.
const FEEDS=[
 {publisher:"الجزيرة",url:"https://news.google.com/rss/search?q=site%3Aaljazeera.net+%22%D8%B9%D8%A7%D8%AC%D9%84%22+when%3A1h&hl=ar&gl=SA&ceid=SA:ar",lang:"ar"},
 {publisher:"العربية",url:"https://news.google.com/rss/search?q=site%3Aalarabiya.net+%22%D8%B9%D8%A7%D8%AC%D9%84%22+when%3A1h&hl=ar&gl=SA&ceid=SA:ar",lang:"ar"},
 {publisher:"سكاي نيوز عربية",url:"https://news.google.com/rss/search?q=site%3Askynewsarabia.com+%22%D8%B9%D8%A7%D8%AC%D9%84%22+when%3A1h&hl=ar&gl=SA&ceid=SA:ar",lang:"ar"},
 {publisher:"BBC عربي",url:"https://news.google.com/rss/search?q=site%3Abbc.com%2Farabic+%22%D8%B9%D8%A7%D8%AC%D9%84%22+when%3A1h&hl=ar&gl=SA&ceid=SA:ar",lang:"ar"},
 {publisher:"CNN عربية",url:"https://news.google.com/rss/search?q=site%3Acnn.com%2Farabic+%22%D8%B9%D8%A7%D8%AC%D9%84%22+when%3A1h&hl=ar&gl=SA&ceid=SA:ar",lang:"ar"},
 {publisher:"وكالة الأنباء السعودية واس",url:"https://news.google.com/rss/search?q=site%3Aspa.gov.sa+%22%D8%B9%D8%A7%D8%AC%D9%84%22+when%3A1h&hl=ar&gl=SA&ceid=SA:ar",lang:"ar"},
 {publisher:"رويترز",url:"https://news.google.com/rss/search?q=site%3Areuters.com+%28breaking+OR+%22just+in%22%29+when%3A1h&hl=en-US&gl=US&ceid=US:en",lang:"en"},
 {publisher:"Associated Press",url:"https://news.google.com/rss/search?q=site%3Aapnews.com+%28breaking+OR+%22just+in%22%29+when%3A1h&hl=en-US&gl=US&ceid=US:en",lang:"en"},
 {publisher:"BBC News",url:"https://news.google.com/rss/search?q=site%3Abbc.com%2Fnews+%28breaking+OR+%22just+in%22%29+when%3A1h&hl=en-US&gl=US&ceid=US:en",lang:"en"},
 {publisher:"CNN",url:"https://news.google.com/rss/search?q=site%3Acnn.com+%28breaking+OR+%22just+in%22%29+when%3A1h&hl=en-US&gl=US&ceid=US:en",lang:"en"},
 {publisher:"Al Jazeera English",url:"https://news.google.com/rss/search?q=site%3Aaljazeera.com+breaking+when%3A1h&hl=en-US&gl=US&ceid=US:en",lang:"en"},
 {publisher:"France 24",url:"https://news.google.com/rss/search?q=site%3Afrance24.com+breaking+when%3A1h&hl=en-US&gl=US&ceid=US:en",lang:"en"}
];
const URL=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const HEADERS={apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"};
const urgent=/\bBREAKING\b|\bJUST IN\b|\bLIVE\b|عاجل|الآن|قبل قليل|تطور عاجل/i;
function dec(s=""){return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
function get(b,n){const m=b.match(new RegExp("<"+n+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+n+">","i"));return m?dec(m[1]):"";}
function getLink(b){const m=b.match(/<link\b[^>]*href=["']([^"']+)["']/i);return m?dec(m[1]):get(b,"link");}
function parse(b,f){const title=get(b,"title"),url=getLink(b),summary=get(b,"description")||get(b,"summary"),date=get(b,"pubDate")||get(b,"published")||get(b,"updated");if(!title||!/^https?:\/\//i.test(url)||!urgent.test(title))return null;const dt=new Date(date||Date.now());if(Number.isNaN(dt.getTime())||Date.now()-dt.getTime()>2*60*60*1000||dt.getTime()>Date.now()+5*60*1000)return null;return {url,title:title.slice(0,500),summary:summary.slice(0,3000),source_name:f.publisher+" Breaking Desk",source_url:f.url,category:"world",country:"دولي",lang:f.lang,verification:"unconfirmed",published_at:dt.toISOString(),editorial_status:"published",ai_classification_status:"pending",is_breaking:true};}
async function one(f){try{const r=await fetch(f.url,{headers:{"User-Agent":"Mozilla/5.0 WRLDLINE-Breaking/2.0"},signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error("HTTP "+r.status);const xml=await r.text();const items=xml.match(/<item\b[\s\S]*?<\/item>/gi)||xml.match(/<entry\b[\s\S]*?<\/entry>/gi)||[];const rows=items.slice(0,15).map(x=>parse(x,f)).filter(Boolean);if(!rows.length)return {publisher:f.publisher,count:0};const res=await fetch(URL+"/rest/v1/articles?on_conflict=url",{method:"POST",headers:{...HEADERS,Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(rows)});if(!res.ok)throw new Error("DB "+res.status+" "+(await res.text()).slice(0,120));console.log("BREAKING "+f.publisher+": "+rows.length);return {publisher:f.publisher,count:rows.length};}catch(e){console.error("BREAKING_FEED_ERROR "+f.publisher+": "+e.message);return {publisher:f.publisher,error:e.message,count:0};}}
async function main(){if(!URL||!KEY)throw new Error("Missing Supabase credentials");const results=await Promise.all(FEEDS.map(one));const total=results.reduce((n,x)=>n+x.count,0);console.log("BREAKING_SUMMARY "+JSON.stringify({feeds:FEEDS.length,alerts:total,failed:results.filter(x=>x.error).length}));}
main().catch(e=>{console.error(e);process.exitCode=1;});
