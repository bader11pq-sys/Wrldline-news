// Re-run the live Gemini key-source check whenever this script changes.
// Keep CI smoke tests aligned with live Edge Function typing fixes.
// Trigger provider-level classification and translation smoke tests after Gemini retry handling deployment.
const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!SUPABASE_URL||!SERVICE_KEY)throw new Error("Missing Supabase workflow secrets.");
const BAZAARLINK_API_KEY=process.env.BAZAARLINK_API_KEY;
if(!BAZAARLINK_API_KEY)throw new Error("Missing GitHub secret Bazaarlink_API_Key.");
async function testBazaarlink(key,source){
  const keyResponse=await fetch("https://api.bazaarlink.ai/v1/key",{headers:{Authorization:"Bearer "+key},signal:AbortSignal.timeout(12000)});
  if(!keyResponse.ok)throw new Error(source+" BazaarLink key verification HTTP "+keyResponse.status);
  const keyPayload=await keyResponse.json(),keyInfo=keyPayload?.data||keyPayload;
  if(keyInfo?.is_management_key===true)throw new Error(source+" key is management-only and cannot run model inference.");
  const model=process.env.BAZAARLINK_MODEL||"auto:free";
  const response=await fetch("https://api.bazaarlink.ai/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json","X-Free-Fallback":"false"},signal:AbortSignal.timeout(25000),body:JSON.stringify({model,messages:[{role:"system",content:"Return a valid JSON object only."},{role:"user",content:'Return exactly this JSON object: {"status":"ok"}'}],response_format:{type:"json_object"},temperature:0,max_tokens:80})});
  if(!response.ok)throw new Error(source+" BazaarLink inference HTTP "+response.status+": "+(await response.text()).slice(0,250));
  const payload=await response.json(),raw=payload.choices?.[0]?.message?.content;
  let parsed;try{parsed=JSON.parse(raw)}catch{throw new Error(source+" BazaarLink did not return valid JSON.")}
  if(parsed?.status!=="ok")throw new Error(source+" BazaarLink returned an unexpected response.");
  console.log(source+"_BAZAARLINK_CHECK passed; model="+(payload.model||model)+"; key_type="+(keyInfo?.is_free_tier===true?"free-tier":"standard"));
}
const response=await fetch(SUPABASE_URL+"/functions/v1/ai-provider-healthcheck",{method:"POST",headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json"},body:"{}"});
const result=await response.json().catch(()=>({}));
console.log("AI_PROVIDER_HEALTHCHECK "+JSON.stringify(result));
await testBazaarlink(BAZAARLINK_API_KEY,"GITHUB_SECRET");

if(!response.ok||!result.ok)process.exit(1);
const bazaarlink=(result.results||[]).find(item=>item.provider==="bazaarlink");
if(!bazaarlink||bazaarlink.status!=="passed"){
  console.error("SUPABASE_BAZAARLINK_CHECK_FAILED "+JSON.stringify({
    status:bazaarlink?.status||"missing",
    key_source:bazaarlink?.key_source||null,
    error:bazaarlink?.error||null
  }));
  process.exit(1);
}
console.log("SUPABASE_BAZAARLINK_CHECK passed; key_source="+(bazaarlink.key_source||"configured")+"; model="+(bazaarlink.model||"verified"));
const runtimeFirecrawl=(result.results||[]).find(item=>item.provider==="firecrawl");
if(!runtimeFirecrawl||runtimeFirecrawl.status!=="passed"){
  console.error("SUPABASE_FIRECRAWL_CHECK_FAILED "+JSON.stringify(runtimeFirecrawl||{status:"missing"}));
  process.exit(1);
}
const firecrawlKey=process.env.FIRECRAWL_API_KEY;
if(!firecrawlKey)throw new Error("Missing GitHub FIRECRAWL_API_KEY secret.");
const firecrawlResponse=await fetch("https://api.firecrawl.dev/v2/scrape",{
  method:"POST",
  headers:{Authorization:"Bearer "+firecrawlKey,"Content-Type":"application/json"},
  body:JSON.stringify({url:"https://www.firecrawl.dev/",formats:["markdown"],onlyMainContent:true}),
  signal:AbortSignal.timeout(30000)
});
if(!firecrawlResponse.ok){
  console.error("GITHUB_FIRECRAWL_CHECK_FAILED HTTP "+firecrawlResponse.status+" "+(await firecrawlResponse.text()).slice(0,250));
  process.exit(1);
}
const firecrawlPayload=await firecrawlResponse.json();
const markdown=String(firecrawlPayload?.data?.markdown||firecrawlPayload?.markdown||"").trim();
if(markdown.length<200)throw new Error("GitHub Firecrawl key returned no usable markdown.");
console.log("GITHUB_FIRECRAWL_CHECK passed; markdown_chars="+markdown.length+"; key_scope=GitHub_Actions");

