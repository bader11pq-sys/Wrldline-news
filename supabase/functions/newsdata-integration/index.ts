import { isPromotion, providerContentType, providerSourceCountry, providerTopic } from "../_shared/editorial-metadata.ts";
import { resolveSourceLanguage, TAXONOMY_VERSION } from "../_shared/taxonomy.ts";
import { resolveSupabaseServiceKey, serviceApiHeaders } from "../_shared/service-key.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://vmaxbnogmmfyrcucapnq.supabase.co";
const SERVICE_KEY = resolveSupabaseServiceKey({
  SUPABASE_SECRET_KEY:Deno.env.get("SUPABASE_SECRET_KEY"),
  SUPABASE_SECRET_KEYS:Deno.env.get("SUPABASE_SECRET_KEYS"),
  SUPABASE_SERVICE_ROLE_KEY:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
}) || "";
const NEWSDATA_KEY = Deno.env.get("NEWSDATA_API_KEY") || "";
const DB_HEADERS = serviceApiHeaders(SERVICE_KEY);
const CATEGORY_BATCHES = [
  ["politics","sports","business","technology","health"],
  ["world","entertainment","crime","science","environment"],
  ["domestic","education","lifestyle","food","tourism"],
  ["top","other","politics","sports","business"]
];
function validRecentDate(value: unknown): string|null {
  const raw=String(value||"").trim();
  // NewsData can supply a UTC SQL-style timestamp without a suffix.
  const d=new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)?raw.replace(" ","T")+"Z":raw);
  if(Number.isNaN(d.getTime())) return null;
  const age=Date.now()-d.getTime();
  if(age < -300000 || age > 48*3600000) return null;
  return d.toISOString();
}
async function newsdataRequest(path: string, params: Record<string,string>) {
  if(!NEWSDATA_KEY) throw new Error("NEWSDATA_API_KEY is missing in Supabase Edge Function secrets");
  const url=new URL("https://newsdata.io/api/1/"+path);
  url.searchParams.set("apikey",NEWSDATA_KEY);
  for(const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  const response=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"WRLDLINE-NEWS/1.0"},signal:AbortSignal.timeout(18000)});
  const body=await response.json().catch(()=>({status:"error",message:"Invalid JSON response"}));
  if(!response.ok || body?.status==="error") {
    const message=String(body?.results?.message||body?.message||body?.error||"NewsData API request failed").slice(0,240);
    throw new Error("NewsData HTTP "+response.status+": "+message);
  }
  return body;
}
async function dbRequest(path: string,init: RequestInit = {}) {
  return await fetch(SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{...DB_HEADERS,...(init.headers||{})}});
}
async function authorize(req: Request) {
  const response=await dbRequest("rpc/verify_wrldline_cron_secret",{method:"POST",body:JSON.stringify({p_secret:req.headers.get("x-wrldline-cron-secret")||""})});
  return response.ok && (await response.json())===true;
}
async function health() {
  const body=await newsdataRequest("latest",{size:"10",category:"sports",language:"en"});
  const results=Array.isArray(body.results)?body.results:[];
  const dates=results.map((x:any)=>Date.parse(x.pubDate||"")).filter((x:number)=>Number.isFinite(x));
  const newest=dates.length?Math.max(...dates):null;
  return {
    mode:"health",api_key_valid:true,api_status:body.status||"success",
    returned_articles:results.length,total_results:body.totalResults??null,
    newest_article_age_minutes:newest===null?null:Math.max(0,Math.round((Date.now()-newest)/60000)),
    realtime_eligible:newest!==null && Date.now()-newest<=3600000,
    sample_categories:results.slice(0,3).map((x:any)=>x.category||[]),
    credits_metadata:body.credits_remaining??body.remaining_credits??body.credits??null
  };
}
async function syncNews() {
  const slot=Math.floor(Date.now()/900000)%CATEGORY_BATCHES.length;
  const categories=CATEGORY_BATCHES[slot];
  const body=await newsdataRequest("latest",{
    size:"10",category:categories.join(","),
    language:"ar,en",removeduplicate:"1"
  });
  const raw=Array.isArray(body.results)?body.results:[];
  const parsedRows=raw.filter((item:any)=>item && item.duplicate!==true && item.article_id && /^https?:\/\/[^/@\s]+(?:[/?#][^\s]*)?$/i.test(String(item.link||"")) && item.title && validRecentDate(item.pubDate)).map((item:any)=>{
    const cats=Array.isArray(item.category)?item.category:(item.category?[item.category]:[]);
    const title=String(item.title).slice(0,500);
    const summary=String(item.description||item.content||"").slice(0,5000);
    const language=resolveSourceLanguage(item.language,title+" "+summary);
    const category=providerTopic(cats);
    const promotion=isPromotion(title);
    const contentType=providerContentType(item.datatype,title);
    let publisherUrl=String(item.source_url||"");
    if(!publisherUrl) { try { publisherUrl=new URL(item.link).origin; } catch {} }
    return {
      url:String(item.link).slice(0,2000),guid:item.article_id||null,
      newsdata_article_id:item.article_id||null,
      title,summary,
      image_url:item.image_url||null,author:item.creator||null,
      lang:language.language,source_language:language.language,language_detection:language.detection,
      category,newsdata_categories:cats,content_type:contentType,
      taxonomy_version:TAXONOMY_VERSION,classification_reason:category==="uncategorized"?"newsdata_topic_unspecified":"newsdata_provider_topic",
      newsdata_ai_tags:Array.isArray(item.ai_tag)?item.ai_tag:(item.ai_tag?[item.ai_tag]:[]),
      newsdata_keywords:Array.isArray(item.keywords)?item.keywords:[],
      newsdata_ai_summary:item.ai_summary||null,
      newsdata_regions:Array.isArray(item.ai_region)?item.ai_region:(item.ai_region?[item.ai_region]:[]),
      newsdata_organizations:Array.isArray(item.ai_org)?item.ai_org:(item.ai_org?[item.ai_org]:[]),
      newsdata_symbols:Array.isArray(item.symbol)?item.symbol:(item.symbol?[item.symbol]:[]),
      newsdata_sentiment_stats:item.sentiment_stats||null,
      newsdata_source_priority:Number.isFinite(Number(item.source_priority))?Number(item.source_priority):null,
      newsdata_sentiment:item.sentiment||null,
      newsdata_datatype:item.datatype||null,
      newsdata_fetched_at:item.fetched_at||new Date().toISOString(),
      source_country:providerSourceCountry(item.country),country:null,event_country:null,
      source_name:String(item.source_name||"NewsData.io").slice(0,180),
      source_url:publisherUrl||"https://newsdata.io",
      verification:"unconfirmed",published_at:validRecentDate(item.pubDate),
      editorial_status:promotion?"review":"published",
      // A provider headline alone is not enough for an urgent alert, especially
      // when the timestamp shows that the story arrived after the news window.
      is_breaking:false
    };
  });
  const rows=[...new Map(parsedRows.map((item:any)=>[item.url,item])).values()];
  let saved=0;
  if(rows.length) {
    const response=await dbRequest("articles?on_conflict=url",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},body:JSON.stringify(rows)});
    if(!response.ok) throw new Error("Database insert HTTP "+response.status+": "+(await response.text()).slice(0,300));
    const returned=await response.json().catch(()=>[]);
    saved=Array.isArray(returned)?returned.length:rows.length;
  }
  return {mode:"sync",category_batch:categories,api_results:raw.length,eligible_within_48h:rows.length,saved_or_updated:saved,discarded_old_or_duplicate:raw.length-rows.length,provider_total:body.totalResults??null,provider_delay_note:"NewsData results are restricted to the latest 48 hours; no external LLM is called by this function."};
}
async function discoverSources() {
  const body=await newsdataRequest("sources",{category:"politics,sports,business,technology,health",language:"ar,en"});
  const sources=Array.isArray(body.results)?body.results:[];
  const rows=sources.map((x:any)=>{
    const id=typeof x==="string"?x:(x.source_id||x.id||x.domain||x.domainurl||x.source_url||x.url||"");
    if(!id) return null;
    return {
      source_id:String(id),source_name:String(x.source_name||x.name||x.domain||id),
      source_url:x.source_url||x.url||(String(id).includes(".")?"https://"+id:null),
      country:providerSourceCountry(x.country),
      language:Array.isArray(x.language)?x.language[0]:(x.language||null),
      categories:Array.isArray(x.category)?x.category:(Array.isArray(x.categories)?x.categories:(x.category?[x.category]:[])),
      updated_at:new Date().toISOString()
    };
  }).filter(Boolean);
  if(rows.length) {
    const response=await dbRequest("newsdata_sources?on_conflict=source_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)});
    if(!response.ok) throw new Error("Sources catalog upsert HTTP "+response.status+": "+(await response.text()).slice(0,250));
  }
  return {mode:"sources",sources_received:sources.length,sources_saved:rows.length,sample_source_keys:rows.length?undefined:Object.keys(sources[0]||{})};
}
Deno.serve(async (req: Request) => {
  if(req.method!=="POST") return Response.json({error:"POST required"},{status:405});
  if(!SERVICE_KEY) return Response.json({error:"Supabase service key missing"},{status:500});
  if(!await authorize(req)) return Response.json({error:"Unauthorized"},{status:401});
  try {
    const body=await req.json().catch(()=>({}));
    const mode=body?.mode||"health";
    const result=mode==="health"?await health():mode==="sync"?await syncNews():mode==="sources"?await discoverSources():null;
    if(!result) return Response.json({error:"mode must be health, sync, or sources"},{status:400});
    console.log("NEWSDATA_SUMMARY "+JSON.stringify(result));
    return Response.json({ok:true,...result});
  } catch(error:any) {
    const message=String(error?.message||error).slice(0,400);
    console.error("NEWSDATA_ERROR",message);
    return Response.json({ok:false,error:message},{status:502});
  }
});
