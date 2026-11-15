const SUPABASE_URL="https://vmaxbnogmmfyrcucapnq.supabase.co";
const ALLOWED_ORIGIN="https://al-ghaib.us.ci";
const ARTICLE_PATH="/rest/v1/articles";
function corsHeaders(){return {"Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"apikey, authorization, accept, accept-profile, range","Access-Control-Expose-Headers":"Content-Range, ETag, X-WRLDLINE-Cache","Vary":"Origin"};}
function jsonError(message,status){return new Response(JSON.stringify({error:message}),{status,headers:{...corsHeaders(),"Content-Type":"application/json","Cache-Control":"no-store"}});}
export default {async fetch(request,env){
 const startedAt=Date.now(),url=new URL(request.url);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders()});
 if(request.method!=="GET")return jsonError("Method not allowed",405);
 if(url.pathname!==ARTICLE_PATH)return jsonError("Not found",404);
 if(url.searchParams.get("editorial_status")!=="eq.published")return jsonError("Only published articles are available through this endpoint",403);
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