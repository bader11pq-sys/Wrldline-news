const SUPABASE_URL="https://vmaxbnogmmfyrcucapnq.supabase.co";
const ALLOWED_ORIGIN="https://al-ghaib.us.ci";
const ARTICLE_PATH="/rest/v1/articles";
const ALLOWED_SELECTS = new Set([
 "id,title,summary,category,country,source_name,url,source_url,published_at,image_url,ai_risk_level,ai_country_code,is_breaking,content_type,editorial_status",
 "id,title,summary,category,country,event_country,source_scope,source_language,language_detection,source_name,url,source_url,published_at,received_at,lang,media_type,image_url,is_breaking,content_type,sponsor_name,sponsor_url,correction_note,corrected_at,editorial_status,verification,verification_source_count,verification_independent_count,verification_field_count,verification_official_count,verification_conflict_count,verification_correction_count,verification_retraction_count,verification_updated_at,verification_note,ai_country_code,ai_summary,ai_risk_level,ai_risk_score,ai_confidence,is_exclusive,exclusive_type,exclusive_reason,exclusive_confidence,newsdata_article_id,newsdata_categories,newsdata_ai_tags,newsdata_sentiment,newsdata_ai_summary,newsdata_fetched_at,newsdata_only,article_translations(lang,title,summary,ai_summary,translation_status,translation_source)"
]);
const ALLOWED_FILTERS = new Set(["select","editorial_status","newsdata_only","is_breaking","is_exclusive","published_at","order","limit"]);
function corsHeaders(){return {"Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"apikey, authorization, accept, accept-profile, range","Access-Control-Expose-Headers":"Content-Range, ETag, X-WRLDLINE-Cache","Vary":"Origin"};}
function jsonError(message,status){return new Response(JSON.stringify({error:message}),{status,headers:{...corsHeaders(),"Content-Type":"application/json","Cache-Control":"no-store"}});}
export default {async fetch(request,env){
 const startedAt=Date.now(),url=new URL(request.url);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders()});
 if(request.method!=="GET")return jsonError("Method not allowed",405);
 if(url.pathname!==ARTICLE_PATH)return jsonError("Not found",404);
 if(url.searchParams.get("editorial_status")!=="eq.published")return jsonError("Only published articles are available through this endpoint",403);
 if(!ALLOWED_SELECTS.has(url.searchParams.get("select")||""))return jsonError("Requested article fields are not allowed",400);
 for(const key of url.searchParams.keys())if(!ALLOWED_FILTERS.has(key))return jsonError("Unsupported query parameter",400);
 const requestedLimit=Number(url.searchParams.get("limit")||"1000");
 if(!Number.isInteger(requestedLimit)||requestedLimit<1||requestedLimit>1000)return jsonError("Invalid article limit",400);
 if(url.searchParams.has("order")&&url.searchParams.get("order")!=="published_at.desc")return jsonError("Unsupported article ordering",400);
 for(const key of ["newsdata_only","is_breaking","is_exclusive"])if(url.searchParams.has(key)&&!["eq.true","eq.false"].includes(url.searchParams.get(key)))return jsonError("Invalid article filter",400);
 if(url.searchParams.has("published_at")&&!/^gte\\.\\d{4}-\\d{2}-\\d{2}T/.test(url.searchParams.get("published_at")))return jsonError("Invalid publication date filter",400);
 if(!env.SUPABASE_ANON_KEY){console.error(JSON.stringify({event:"missing_supabase_key"}));return jsonError("News service is not configured",503);}
 const cacheable=!request.headers.has("Authorization"),cache=caches.default;
 const cacheKey=new Request(new URL(url.pathname+url.search,"https://wrldline-public-cache.internal").toString(),{method:"GET",headers:{Accept:request.headers.get("Accept")||"application/json"}});
 if(cacheable){const hit=await cache.match(cacheKey);if(hit){const h=new Headers(hit.headers);h.set("X-WRLDLINE-Cache","HIT");h.set("Access-Control-Allow-Origin",ALLOWED_ORIGIN);h.set("Access-Control-Expose-Headers","Content-Range, ETag, X-WRLDLINE-Cache");h.set("Vary","Origin");console.log(JSON.stringify({event:"news_cache",result:"hit",duration_ms:Date.now()-startedAt}));return new Response(hit.body,{status:hit.status,statusText:hit.statusText,headers:h});}}
 const upstreamHeaders=new Headers({apikey:env.SUPABASE_ANON_KEY,Accept:request.headers.get("Accept")||"application/json"});
 const auth=request.headers.get("Authorization");if(auth)upstreamHeaders.set("Authorization",auth);
 for(const name of ["accept-profile","range"]){const value=request.headers.get(name);if(value)upstreamHeaders.set(name,value);}
 try{
  const upstream=await fetch(SUPABASE_URL+ARTICLE_PATH+url.search,{method:"GET",headers:upstreamHeaders,signal:AbortSignal.timeout(12000)});
  const headers=new Headers(upstream.headers);for(const [k,v] of Object.entries(corsHeaders()))headers.set(k,v);
  headers.set("X-WRLDLINE-Cache",cacheable?"MISS":"BYPASS");
  if(cacheable&&upstream.status===200&&!headers.has("Set-Cookie")){const ttl=url.searchParams.get("is_breaking")==="eq.true"?5:20;headers.set("Cache-Control","public, max-age="+ttl);await cache.put(cacheKey,new Response(upstream.clone().body,{status:upstream.status,statusText:upstream.statusText,headers}));}
  else if(!cacheable)headers.set("Cache-Control","private, no-store");
  console.log(JSON.stringify({event:"news_upstream",status:upstream.status,cache:cacheable?"miss":"bypass",duration_ms:Date.now()-startedAt}));
  return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers});
 }catch(error){console.error(JSON.stringify({event:"news_upstream_error",message:String(error?.message||error).slice(0,180),duration_ms:Date.now()-startedAt}));return jsonError("News data provider is temporarily unavailable",502);}
}};