const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const FEED_URL="https://alikhbariya.net/feeds/breaking.xml";
const SOURCE_NAME="Alikhbariya Breaking Desk";
if(!SUPABASE_URL||!SERVICE_KEY){console.log("Breaking feed skipped: Supabase service credentials are missing.");process.exit(0);}
const headers={apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json"};
function clean(value=""){return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();}
function field(item,tag){const m=item.match(new RegExp("<"+tag+"[^>]*>([\\s\\S]*?)</"+tag+">","i"));return m?clean(m[1]):"";}
async function main(){
 const response=await fetch(FEED_URL,{headers:{"User-Agent":"WRLDLINE-NewsBot/1.0"},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error("Breaking RSS returned HTTP "+response.status);
 const xml=await response.text();
 const items=xml.match(/<item(?:\\s[^>]*)?>[\\s\\S]*?<\\/item>/gi)||[];
 let saved=0;
 for(const item of items.slice(0,30)){
  const title=field(item,"title"),url=field(item,"link"),summary=field(item,"description"),date=field(item,"pubDate");
  if(!title||!/^https?:\\/\\//i.test(url))continue;
  const lang=/[\\u0600-\\u06FF]/.test(title)?"ar":"en";
  const published=Number.isNaN(Date.parse(date))?new Date().toISOString():new Date(date).toISOString();
  const lookup=new URLSearchParams({select:"id",url:"eq."+url,limit:"1"});
  const existing=await fetch(SUPABASE_URL+"/rest/v1/articles?"+lookup,{headers});
  if(!existing.ok)throw new Error("Could not check existing breaking item: "+existing.status);
  const found=await existing.json();
  const data={is_breaking:true,source_name:SOURCE_NAME,source_url:FEED_URL};
  if(found.length){
   const patch=await fetch(SUPABASE_URL+"/rest/v1/articles?id=eq."+encodeURIComponent(found[0].id),{method:"PATCH",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify(data)});
   if(!patch.ok)throw new Error("Could not promote breaking item: "+patch.status+" "+(await patch.text()).slice(0,160));
  }else{
   const insert=await fetch(SUPABASE_URL+"/rest/v1/articles",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({url,title,summary:summary.slice(0,1000),source_name:SOURCE_NAME,source_url:FEED_URL,category:"world",country:"دولي",lang,published_at:published,editorial_status:"published",is_breaking:true,verification:"unconfirmed"})});
   if(!insert.ok)throw new Error("Could not store breaking item: "+insert.status+" "+(await insert.text()).slice(0,160));
  }
  saved++;
 }
 console.log("Dedicated breaking feed processed "+saved+" alert(s).");
}
main().catch(error=>{console.error("Breaking feed error:",error.message);process.exitCode=1;});
