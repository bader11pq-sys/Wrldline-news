// Trigger provider-level classification and translation smoke tests after auth fix deployment.
const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!SUPABASE_URL||!SERVICE_KEY)throw new Error("Missing Supabase workflow secrets.");
const response=await fetch(SUPABASE_URL+"/functions/v1/ai-provider-healthcheck",{method:"POST",headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json"},body:"{}"});
const result=await response.json().catch(()=>({}));
console.log("AI_PROVIDER_HEALTHCHECK "+JSON.stringify(result));
if(!response.ok||!result.ok)process.exit(1);
