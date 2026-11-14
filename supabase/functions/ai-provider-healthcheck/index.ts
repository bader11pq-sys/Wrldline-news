import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors={"Access-Control-Allow-Origin":Deno.env.get("SITE_URL")||"https://al-ghaib.us.ci","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-wrldline-cron-secret","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Vary":"Origin"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const prompt="You are validating the WRLDLINE editorial classification pipeline. Source headline: 'Regional leaders meet to discuss trade'. Source summary: 'Officials met today and discussed regional trade cooperation.' Return one JSON object with exactly one top-level key: classification. It must contain category (one of politics,economy,security,tech,sports,culture,health,world), country, risk_level (one of unknown,low,guarded,elevated,high,critical), risk_score (integer 0-100), confidence (number 0-1), and summary (short string). Use neutral facts only; do not invent a location. Keep every value short.";
function valid(data:any){return !!data&&data.classification&&typeof data.classification==="object"&&["category","country","risk_level","risk_score","confidence","summary"].every(k=>data.classification[k]!==undefined);}
async function callGemini(key:string){
 let lastError="";
 for(let attempt=0;attempt<3;attempt++){
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},signal:AbortSignal.timeout(25000),body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",thinkingConfig:{thinkingLevel:"minimal"},maxOutputTokens:1200}})});
  if(r.ok){const p=await r.json(),raw=p.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("").trim();if(!raw)throw new Error("Gemini returned empty content");const data=JSON.parse(raw);if(!valid(data))throw new Error("Gemini response did not match classification schema");return {ok:true,model:"gemini-3.5-flash-lite",attempts:attempt+1};}
  lastError="Gemini HTTP "+r.status+": "+(await r.text()).slice(0,220);
  if(![429,500,502,503,504].includes(r.status)||attempt===2)throw new Error(lastError);
  await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
 }
 throw new Error(lastError||"Gemini temporarily unavailable");
}
async function callGroq(key:string){const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},signal:AbortSignal.timeout(25000),body:JSON.stringify({model:"openai/gpt-oss-20b",messages:[{role:"system",content:"Return exactly one valid JSON object, no Markdown."},{role:"user",content:prompt}],response_format:{type:"json_object"},temperature:0,max_completion_tokens:1800,reasoning_effort:"low"})});if(!r.ok)throw new Error("Groq HTTP "+r.status+": "+(await r.text()).slice(0,220));const p=await r.json(),raw=p.choices?.[0]?.message?.content;if(typeof raw!=="string"||!raw.trim())throw new Error("Groq returned empty content; finish_reason="+(p.choices?.[0]?.finish_reason||"unknown"));const data=JSON.parse(raw);if(!valid(data))throw new Error("Groq response did not match classification schema");return {ok:true,model:p.model||"openai/gpt-oss-20b"};}

async function callNvidia(key:string){
 const model="nvidia/nemotron-3.5-lightning-30b-a3b";
 const r=await fetch("https://integrate.api.nvidia.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},signal:AbortSignal.timeout(25000),body:JSON.stringify({model,messages:[{role:"system",content:"Return exactly one valid JSON object, no Markdown."},{role:"user",content:prompt}],chat_template_kwargs:{enable_thinking:false},temperature:0,max_tokens:1800})});
 if(!r.ok)throw new Error("NVIDIA model "+model+" HTTP "+r.status+": "+(await r.text()).slice(0,250));
 const p=await r.json(),choice=p.choices?.[0],raw=choice?.message?.content;
 if(typeof raw!=="string"||!raw.trim())throw new Error("NVIDIA returned empty content (finish_reason="+(choice?.finish_reason||"unknown")+", message_fields="+Object.keys(choice?.message||{}).join(",")+")");
 const data=JSON.parse(raw);if(!valid(data))throw new Error("NVIDIA response did not match classification schema");
 return {ok:true,model:p.model||model};
}
async function callOpenRouter(key:string){const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json","HTTP-Referer":"https://al-ghaib.us.ci","X-Title":"WRLDLINE NEWS"},signal:AbortSignal.timeout(25000),body:JSON.stringify({model:"openrouter/free",messages:[{role:"system",content:"Return exactly one valid JSON object, no Markdown."},{role:"user",content:prompt}],response_format:{type:"json_object"},temperature:0,max_tokens:1200})});if(!r.ok)throw new Error("OpenRouter HTTP "+r.status+": "+(await r.text()).slice(0,220));const p=await r.json(),raw=p.choices?.[0]?.message?.content;if(typeof raw!=="string"||!raw.trim())throw new Error("OpenRouter returned empty content");const data=JSON.parse(raw);if(!valid(data))throw new Error("OpenRouter response did not match classification schema");return {ok:true,model:p.model||"openrouter/free"};}
async function callGonka(key:string){
 const headers={"Authorization":"Bearer "+key,"Content-Type":"application/json"};
 const auth=await fetch("https://proxy.gonkabroker.com/v1/test-auth",{headers,signal:AbortSignal.timeout(12000)});
 let authStatus="passed";
 if(auth.status===404){authStatus="endpoint_unavailable_404; will verify through authenticated inference";}
 else if(!auth.ok)throw new Error("Gonka test-auth HTTP "+auth.status);
 else await auth.json();
 const mr=await fetch("https://proxy.gonkabroker.com/v1/models",{headers,signal:AbortSignal.timeout(12000)});
 if(!mr.ok)throw new Error("Gonka models HTTP "+mr.status);
 const mp=await mr.json(),ids=(mp.data||[]).map((m:any)=>m.id).filter((x:any)=>typeof x==="string");
 if(!ids.length)throw new Error("Gonka returned no available models");
 const configured=Deno.env.get("GONKA_MODEL");
 if(configured&&!ids.includes(configured))throw new Error("Configured GONKA_MODEL is not available");
 const model=configured||ids.find((id:string)=>/MiniMaxAI\/MiniMax-M2\.7/i.test(id))||ids.find((id:string)=>!/(bge|embed)/i.test(id))||ids[0];
 const testPrompt='Return exactly this JSON object and nothing else: {"classification":{"category":"economy","country":"غير محدد","risk_level":"unknown","risk_score":0,"confidence":0.99,"summary":"اختبار تصنيف"}}';
 const gen=await fetch("https://proxy.gonkabroker.com/v1/chat/completions",{method:"POST",headers,signal:AbortSignal.timeout(30000),body:JSON.stringify({model,messages:[{role:"system",content:"Follow the output format exactly. Return valid JSON only."},{role:"user",content:testPrompt}],temperature:0,max_tokens:300})});
 if(!gen.ok)throw new Error("Gonka generation HTTP "+gen.status+"; key_prefix_valid="+String(key.startsWith("gnk-prx-"))+"; model_count="+ids.length);
 const payload=await gen.json(),raw=payload.choices?.[0]?.message?.content;
 if(typeof raw!=="string"||!raw.trim())throw new Error("Gonka generation returned empty content");
 let data:any;
 try{data=JSON.parse(raw)}catch{const a=raw.indexOf("{"),b=raw.lastIndexOf("}");if(a<0||b<=a)throw new Error("Gonka generation did not return JSON");data=JSON.parse(raw.slice(a,b+1))}
 if(!valid(data))throw new Error("Gonka generation did not match the classification schema");
 return {ok:true,model,auth_status:authStatus,models_available:ids.length,generation:"passed"};
}

async function callBazaarlink(key: string) {
 const keyResponse=await fetch("https://api.bazaarlink.ai/v1/key",{headers:{"Authorization":"Bearer "+key},signal:AbortSignal.timeout(12000)});
 if(!keyResponse.ok)throw new Error("BazaarLink key verification HTTP "+keyResponse.status);
 const keyPayload=await keyResponse.json(),keyInfo=keyPayload?.data||keyPayload;
 if(keyInfo?.is_management_key===true)throw new Error("BazaarLink management keys cannot be used for model inference.");
 const model=Deno.env.get("BAZAARLINK_MODEL")||"auto:free";
 let response:Response|null=null,lastDetail="";
 for(let attempt=0;attempt<3;attempt++){
  response=await fetch("https://api.bazaarlink.ai/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json","X-Free-Fallback":"false"},signal:AbortSignal.timeout(25000),body:JSON.stringify({model,messages:[{role:"system",content:"Return a valid JSON object only."},{role:"user",content:'Return exactly this JSON object: {"status":"ok"}'}],response_format:{type:"json_object"},temperature:0,max_tokens:80})});
  if(response.ok)break;
  lastDetail=(await response.text()).slice(0,250);
  if(response.status===429&&/too many concurrent|in.?flight/i.test(lastDetail)&&attempt<2){await new Promise(resolve=>setTimeout(resolve,1500*(attempt+1)));continue;}
  throw new Error("BazaarLink inference HTTP "+response.status+": "+lastDetail);
 }
 if(!response?.ok)throw new Error("BazaarLink inference did not complete: "+lastDetail);
 const payload=await response.json(),raw=payload.choices?.[0]?.message?.content;
 if(typeof raw!=="string"||!raw.trim())throw new Error("BazaarLink returned an empty test response.");
 let parsed:any;try{parsed=JSON.parse(raw)}catch{throw new Error("BazaarLink did not return valid JSON.");}
 if(parsed.status!=="ok")throw new Error("BazaarLink returned an unexpected test response.");
 return {ok:true,model:payload.model||model,key_type:keyInfo?.is_free_tier===true?"free-tier":"standard",remaining_limit:typeof keyInfo?.limit_remaining==="number"?keyInfo.limit_remaining:undefined,key_source:Deno.env.get("Bazaarlink_API_Key")?"Bazaarlink_API_Key":"BAZAARLINK_API_KEY"};
}

async function callFirecrawl(key:string){
 const response=await fetch("https://api.firecrawl.dev/v2/scrape",{
  method:"POST",
  headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
  signal:AbortSignal.timeout(30000),
  body:JSON.stringify({url:"https://www.firecrawl.dev/",formats:["markdown"],onlyMainContent:true})
 });
 if(!response.ok)throw new Error("Firecrawl scrape HTTP "+response.status+": "+(await response.text()).slice(0,220));
 const payload=await response.json();
 const markdown=String(payload?.data?.markdown||payload?.markdown||"").trim();
 if(markdown.length<200)throw new Error("Firecrawl returned no usable page markdown");
 return {ok:true,operation:"scrape",characters:markdown.length,api:"v2"};
}

async function run(name:string,key:string|null,fn:(key:string)=>Promise<any>){if(!key)return {provider:name,status:"not_configured"};try{return {provider:name,status:"passed",...(await fn(key))};}catch(e){return {provider:name,status:"failed",error:String(e).slice(0,300)};}}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default}catch{return null}})();
 const authHeader=req.headers.get("Authorization")||"";
 const token=authHeader.startsWith("Bearer ")?authHeader.slice(7):authHeader;
 let authorized=!!serviceKey&&token===serviceKey;
 if(!authorized&&serviceKey){
  const cronSecret=req.headers.get("x-wrldline-cron-secret")||"";
  if(cronSecret.length>=32){
   try{
    const base=Deno.env.get("SUPABASE_URL")||"https://vmaxbnogmmfyrcucapnq.supabase.co";
    const check=await fetch(base+"/rest/v1/rpc/verify_wrldline_cron_secret",{method:"POST",headers:{"apikey":serviceKey,"Authorization":"Bearer "+serviceKey,"Content-Type":"application/json"},body:JSON.stringify({p_secret:cronSecret}),signal:AbortSignal.timeout(8000)});
    authorized=check.ok&&(await check.json())===true;
   }catch{}
  }
 }
 if(!authorized&&token){
  const base=Deno.env.get("SUPABASE_URL")||"https://vmaxbnogmmfyrcucapnq.supabase.co";
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
  if(anonKey){
   try{
    const userResponse=await fetch(base+"/auth/v1/user",{headers:{"apikey":anonKey,"Authorization":"Bearer "+token},signal:AbortSignal.timeout(8000)});
    if(userResponse.ok){
     const user=await userResponse.json();
     authorized=["admin","editor"].includes(user?.app_metadata?.role);
    }
   }catch{}
  }
 }
 if(!authorized)return json({ok:false,error:"Admin/editor authorization required"},401);
 const geminiApiKey=Deno.env.get("GEMINI_API_KEY")||Deno.env.get("GOOGLE_API_KEY")||null;
 const results=await Promise.all([
  run("gemini",geminiApiKey,callGemini),
  run("groq",Deno.env.get("GROQ_API_KEY") || null,callGroq),
  run("nvidia",Deno.env.get("NVIDIA_API_KEY") || null,callNvidia),
  run("openrouter",Deno.env.get("OPENROUTER_API_KEY") || null,callOpenRouter),
  run("gonka",Deno.env.get("GONKA_BROKER_API_KEY") || null,callGonka),
  run("bazaarlink",Deno.env.get("Bazaarlink_API_Key") || Deno.env.get("BAZAARLINK_API_KEY") || null,callBazaarlink),
  run("firecrawl",Deno.env.get("FIRECRAWL_API_KEY") || null,callFirecrawl)
 ]);
 const configured=results.filter(x=>x.status!=="not_configured");
 results[0].key_source=Deno.env.get("GEMINI_API_KEY")?"GEMINI_API_KEY":(Deno.env.get("GOOGLE_API_KEY")?"GOOGLE_API_KEY":null);
 return json({ok:configured.some(x=>x.status==="passed"),all_configured_passed:configured.length>0&&configured.every(x=>x.status==="passed"),tested_at:new Date().toISOString(),results});
});