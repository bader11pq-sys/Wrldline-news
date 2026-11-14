// Trigger provider-level classification and translation smoke tests after Gemini retry handling deployment.
const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!SUPABASE_URL||!SERVICE_KEY)throw new Error("Missing Supabase workflow secrets.");
const response=await fetch(SUPABASE_URL+"/functions/v1/ai-provider-healthcheck",{method:"POST",headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json"},body:"{}"});
const result=await response.json().catch(()=>({}));
console.log("AI_PROVIDER_HEALTHCHECK "+JSON.stringify(result));

if(!response.ok||!result.ok)process.exit(1);
const gemini=(result.results||[]).find(item=>item.provider==="gemini");
if(!gemini||gemini.status!=="passed"||gemini.key_source!=="GEMINI_API_KEY"){
  console.error("SUPABASE_GEMINI_CHECK_FAILED "+JSON.stringify({
    status:gemini?.status||"missing",
    key_source:gemini?.key_source||null,
    error:gemini?.error||null
  }));
  process.exit(1);
}
console.log("SUPABASE_GEMINI_CHECK passed; key_source=GEMINI_API_KEY; model="+(gemini.model||"verified"));
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

