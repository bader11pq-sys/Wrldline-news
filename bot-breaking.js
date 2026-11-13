// WRLDLINE dedicated breaking-news desk. Separate from the 60 general-news feeds.
const URL=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const HEADERS={apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"};
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
 {publisher:"BBC News",url:GOOGLE("bbc.com/news","en"),lang:"en"}
];
const urgent=/\bBREAKING\b|\bJUST IN\b|\bLIVE\b|عاجل|الآن|قبل قليل|تطور عاجل|نبأ عاجل/i;
function dec(s=""){return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/<br\s*\/?\s*>/gi," ").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
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
 const dt=new Date(date||Date.now());if(Number.isNaN(dt.getTime())||Date.now()-dt.getTime()>2*60*60*1000||dt.getTime()>Date.now()+5*60*1000)return null;
 return {url,title:title.slice(0,500),summary:(summary||"").slice(0,3000),source_name:f.publisher+" Breaking Desk",source_url:f.type==="telegram"?"https://t.me/"+f.handle:f.url,category:"world",country:"دولي",lang:f.lang,verification:"unconfirmed",published_at:dt.toISOString(),editorial_status:"published",ai_classification_status:"pending",is_breaking:true};
}
function telegramRows(html,f){
 const starts=[...html.matchAll(/<div class="tgme_widget_message\b/g)].map(m=>m.index),out=[];
 for(let i=0;i<starts.length;i++){
  const b=html.slice(starts[i],starts[i+1]??html.length);
  const text=(b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)||[])[1]||"";
  const date=(b.match(/<time[^>]*datetime=["']([^"']+)["']/i)||[])[1];
  const post=(b.match(/href=["'](https?:\/\/t\.me\/[^/"']+\/\d+)["']/i)||[])[1];
  const clean=dec(text);if(!clean||!date||!post)continue;
  const title=clean.split(/\n|\s{2,}/)[0].slice(0,500)||clean.slice(0,500);
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
  const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; WRLDLINE-Breaking/3.0)","Accept":"text/html,application/rss+xml,application/xml,*/*"},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error("HTTP "+r.status);
  const body=await r.text(),raw=rawItemCount(body,f),rows=f.type==="telegram"?telegramRows(body,f):rssRows(body,f);
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
 const results=await Promise.all(FEEDS.map(collect));
 const summary={feeds:FEEDS.length,successful:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,alerts:results.reduce((n,x)=>n+x.count,0),raw_items:results.reduce((n,x)=>n+(x.raw||0),0),empty_sources:results.filter(x=>x.ok&&x.raw===0).map(x=>x.source),telegram:FEEDS.filter(x=>x.type==="telegram").length};
 console.log("BREAKING_SUMMARY "+JSON.stringify(summary));
 if(summary.successful===0)throw new Error("All dedicated breaking sources failed");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
