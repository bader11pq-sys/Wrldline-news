// Trigger a fresh server-side probe after switching to a plain-text compatibility check.
const SUPABASE_URL=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!SUPABASE_URL||!KEY)throw new Error("Missing Supabase workflow secrets.");
const response=await fetch(SUPABASE_URL+"/functions/v1/groq-healthcheck",{method:"POST",headers:{apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"},body:"{}"});
const result=await response.json().catch(()=>({}));
if(!response.ok||!result.ok){console.error("GROQ_HEALTHCHECK_FAILED "+JSON.stringify({status:response.status,error:result.error||"No response"}));process.exit(1);}
console.log("GROQ_HEALTHCHECK_OK "+JSON.stringify({provider:result.provider,model:result.model,response:result.response}));
