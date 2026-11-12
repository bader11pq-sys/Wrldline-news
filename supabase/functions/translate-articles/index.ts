import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const schema={type:"object",additionalProperties:false,properties:{title:{type:"string"},summary:{type:"string"}},required:["title","summary"]};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY");
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default}catch{return null}})();
 const openai=Deno.env.get("OPENAI_API_KEY");
 if(!url||!anon||!service)return json({error:"Supabase server configuration is incomplete."},500);
 if(!openai)return json({error:"OPENAI_API_KEY is not configured."},503);
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(token!==service){
  if(!token)return json({error:"Authentication required."},401);
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await auth.auth.getUser(token);
  if(error||!data.user)return json({error:"Invalid session."},401);
  if(!["admin","editor"].includes(data.user.app_metadata?.role))return json({error:"Editorial access required."},403);
 }
 let body:any;try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
 const ids=Array.isArray(body.article_ids)?[...new Set(body.article_ids.filter((x:unknown)=>typeof x==="string"))].slice(0,10):[];
 if(!ids.length)return json({error:"Send 1 to 10 article_ids."},400);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:articles,error}=await db.from("articles").select("id,title,summary,lang,url,source_name").in("id",ids);
 if(error)return json({error:"Could not load articles."},500);
 const results:any[]=[];
 for(const article of articles||[]){
  try{
   const target=/^en$/i.test(article.lang||"")||(!/[\u0600-\u06FF]/.test(article.title||"")&&/[A-Za-z]/.test(article.title||""))?"ar":"en";
   const existing=await db.from("article_translations").select("id").eq("article_id",article.id).eq("lang",target).maybeSingle();
   if(existing.data){results.push({id:article.id,status:"already_translated",lang:target});continue;}
   const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+openai,"Content-Type":"application/json"},body:JSON.stringify({
    model:"gpt-4o-mini",store:false,max_output_tokens:900,
    instructions:[
     "You are a professional news translator for a bilingual international newsroom.",
     "Translate the supplied headline and summary faithfully into "+(target==="ar"?"Modern Standard Arabic":"clear international English")+".",
     "Preserve all names, numbers, dates, quotations, attribution, uncertainty, allegations, and caveats exactly. Never add facts, omit important qualifications, or strengthen a claim.",
     "Do not translate publisher/brand names, URLs, or official product names unless there is a standard localized form.",
     "If the source is ambiguous, preserve its ambiguity. Return only the translated title and summary."
    ].join("\n"),
    input:[{role:"user",content:"Original language: "+(target==="ar"?"English or other non-Arabic":"Arabic or other non-English")+"\nPublisher: "+(article.source_name||"Unknown")+"\nOriginal URL: "+(article.url||"")+"\nTITLE:\n"+(article.title||"")+"\nSUMMARY:\n"+(article.summary||"")}],
    text:{format:{type:"json_schema",name:"wrldline_translation",strict:true,schema}}
   })});
   if(!response.ok)throw new Error("OpenAI "+response.status+": "+(await response.text()).slice(0,180));
   const payload=await response.json();const text=payload.output_text||(payload.output||[]).flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text;
   if(!text)throw new Error("No translation output");
   const translated=JSON.parse(text);
   const {error:upsertError}=await db.from("article_translations").upsert({article_id:article.id,lang:target,title:String(translated.title||"").slice(0,500),summary:String(translated.summary||"").slice(0,4000)},{onConflict:"article_id,lang"});
   if(upsertError)throw upsertError;
   results.push({id:article.id,status:"translated",lang:target});
  }catch(error){results.push({id:article.id,status:"failed",error:String(error).slice(0,180)});}
 }
 return json({processed:results.length,results});
});