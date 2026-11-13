import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default}catch{return null}})();
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!serviceKey||token!==serviceKey)return json({ok:false,error:"Service authorization required"},401);
 const apiKey=Deno.env.get("GROQ_API_KEY");
 if(!apiKey)return json({ok:false,error:"GROQ_API_KEY is not available to this Edge Function"},503);
 try{
  const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{
   method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
   signal:AbortSignal.timeout(20000),
   body:JSON.stringify({model:"openai/gpt-oss-20b",messages:[{role:"system",content:"Return only a JSON object."},{role:"user",content:"Return exactly this JSON object: {\"status\":\"ok\"}"}],response_format:{type:"json_object"},temperature:0,max_completion_tokens:40})
  });
  if(!response.ok)return json({ok:false,provider:"groq",status:response.status,error:(await response.text()).slice(0,350)},502);
  const payload=await response.json(),content=payload.choices?.[0]?.message?.content;
  if(typeof content!=="string"||!content.trim())return json({ok:false,provider:"groq",error:"Provider returned an empty response"},502);
  let parsed:any;try{parsed=JSON.parse(content)}catch{return json({ok:false,provider:"groq",error:"Provider did not return valid JSON"},502)}
  if(parsed.status!=="ok")return json({ok:false,provider:"groq",error:"Unexpected test response"},502);
  return json({ok:true,provider:"groq",model:payload.model||"openai/gpt-oss-20b",response:parsed});
 }catch(error){return json({ok:false,provider:"groq",error:String(error).slice(0,300)},502)}
});