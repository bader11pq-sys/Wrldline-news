const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!SUPABASE_URL||!SERVICE_KEY){console.log("Translation worker skipped: configure Supabase URL and service role key.");process.exit(0);}
const headers={apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY};
async function main(){
 const q=new URLSearchParams({select:"id,title,summary,ai_summary,lang,url,source_url,source_name,article_translations(lang,ai_summary,title,summary)",editorial_status:"eq.published",order:"published_at.desc",limit:"300"});
 const res=await fetch(SUPABASE_URL+"/rest/v1/articles?"+q,{headers});
 if(!res.ok)throw new Error("Could not load articles: "+res.status+" "+(await res.text()).slice(0,200));
 const rows=await res.json();
 const pending=rows.filter(a=>{const target=/^en$/i.test(a.lang||"")||(!/[\u0600-\u06FF]/.test(a.title||"")&&/[A-Za-z]/.test(a.title||""))?"ar":"en";const translation=(a.article_translations||[]).find(t=>t.lang===target);const tickerOnly=/t\.me|telegram\.me|telegram/i.test([a.url,a.source_url,a.source_name].filter(Boolean).join(" "));return tickerOnly||!translation||!translation.title||!translation.summary||(!!a.ai_summary&&!translation.ai_summary);}).slice(0,30);
 if(!pending.length){console.log("All recent published articles already have their counterpart translation.");return;}
 let total=0;
 for(let i=0;i<pending.length;i+=10){
  const response=await fetch(SUPABASE_URL+"/functions/v1/translate-articles",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({article_ids:pending.slice(i,i+10).map(a=>a.id)})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error("Translator failed HTTP "+response.status+": "+JSON.stringify(body).slice(0,400));
  const ok=(body.results||[]).filter(x=>x.status==="translated"||x.status==="already_translated").length;total+=ok;
  console.log("Translation batch "+(i/10+1)+": "+ok+" ready, "+((body.results||[]).filter(x=>x.status==="failed").length)+" failed.");
  for(const item of (body.results||[]).filter(x=>x.status==="failed"))console.error("Translation failed for "+item.id+": "+(item.error||"No error detail returned."));
 }
 console.log("Translated "+total+" articles this run.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});