/* Isolated browser fixture. Only preview builds and tests insert this script. */
(() => {
  const id="10000000-0000-4000-8000-000000000001";
  const seed={
    id,title:"خطة جديدة لتوسيع الوصول إلى المكتبات العامة",summary:"تستعرض ورلدلاين كيف تساعد المساحات العامة على الوصول إلى المعرفة.\n\nيتضمن هذا المثال تفاصيل تحريرية تجريبية ولا يمثّل خبرًا فعليًا.",
    category:"culture",source_name:"WRLDLINE NEWS",source_url:null,author:"هيئة التحرير",content_type:"news",
    published_at:new Date(Date.now()-3_600_000).toISOString(),editorial_status:"published",source_language:"ar",lang:"ar",
    event_country:"السعودية",editorial_trust_status:"unconfirmed",trust_needs_review:true,version:"1"
  };
  const defaultRole=new URLSearchParams(location.search).get("previewRole") || "admin";
  let role=defaultRole, records={}, reviews={}, failures=0;
  const listeners=new Set();
  const safeStorage={
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key,value) { try { localStorage.setItem(key,value); } catch {} }
  };
  try { records=JSON.parse(safeStorage.get("wl-editor-fixture-records")||"{}"); reviews=JSON.parse(safeStorage.get("wl-editor-fixture-reviews")||"{}"); } catch {}
  const rows = () => Object.values({[id]:seed,...records});
  const persist=()=>{safeStorage.set("wl-editor-fixture-records",JSON.stringify(records));safeStorage.set("wl-editor-fixture-reviews",JSON.stringify(reviews));};
  const session=()=>role==="visitor"?null:{user:{id:"20000000-0000-4000-8000-000000000001",email:"preview@example.test",app_metadata:{role}}};
  const ok=data=>({data,error:null});
  const denied=()=>({data:null,error:{code:"42501",message:"Admin access required"}});
  const api=async (name,args={})=>{
    if(name!=="site_editor")return ok([]);
    if(role!=="admin")return denied();
    const {p_action:action,p_id:story,p_version:version,p_values:values={}}=args;
    const previous=rows().find(row=>row.id===story);
    if(action==="access")return ok(true);
    if(action==="queue")return ok(rows().filter(row=>row.editorial_status!=="published"&&row.title.toLowerCase().includes((values.query||"").toLowerCase())));
    if(action==="load")return previous?ok(previous):{error:{code:"P0002"}};
    const review=reviews[story] || {evidence:[],claims:[],editions:[]};
    if(action==="review_tools")return ok(review);
    if(failures>0){failures--;return {error:{code:"503"}};}
    if(story&&version!==previous?.version)return {error:{code:"40001"}};
    if(action==="trust") {
      Object.assign(previous,{editorial_trust_status:values.status,trust_needs_review:false});
    } else if(action==="edition") {
      const edition={id:values.id||crypto.randomUUID(),lang:values.lang,title:values.title,summary:values.summary,
        translation_status:values.publish?"published":"review",translation_source:"editorial",version:String(Date.now())};
      review.editions=review.editions.filter(e=>e.lang!==values.lang).concat(edition);
    } else if(action==="evidence"||action==="claim") {
      const key=action==="evidence"?"evidence":"claims";
      review[key]=review[key].filter(e=>e.id!==values.id).concat({...values,id:values.id||crypto.randomUUID()});
    }
    const result={...(previous||{}),...(action==="save"?values:{}),id:story||crypto.randomUUID(),version:String(Number(previous?.version||0)+1)};
    if(!result.published_at)result.published_at=new Date().toISOString();
    records[result.id]=result;
    if(story)reviews[story]=review;
    persist();return ok(result);
  };
  const chain={
    select:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>chain,upsert:()=>chain,
    single:async()=>ok(null),maybeSingle:async()=>ok({followed_categories:[],followed_countries:[]}),
    then:(resolve,reject)=>Promise.resolve(ok([])).then(resolve,reject)
  };
  const realtime={on:()=>realtime,subscribe:()=>realtime};
  const client={
    auth:{getSession:async()=>ok({session:session()}),onAuthStateChange(fn){listeners.add(fn);queueMicrotask(()=>fn("INITIAL_SESSION",session()));return {data:{subscription:{unsubscribe(){listeners.delete(fn);}}}};},signOut:async()=>{role="visitor";for(const fn of listeners)fn("SIGNED_OUT",null);return ok(null);}},
    rpc:api,from:()=>chain,channel:()=>realtime,removeChannel:async()=>{},functions:{invoke:async()=>ok({})}
  };
  safeStorage.set("sb-vmaxbnogmmfyrcucapnq-auth-token","fixture");
  window.supabase={createClient:()=>client};
  const originalFetch=window.fetch.bind(window);
  window.fetch=(input,init)=>{
    const url=new URL(input instanceof Request?input.url:input,location.href);
    if(url.hostname.endsWith(".supabase.co")) {
      const values=(()=>{try{return JSON.parse(init?.body||"{}");}catch{return {};}})();
      const list=rows().filter(a=>a.editorial_status==="published"&&(!values.p_is_breaking||a.is_breaking)&&(!values.p_is_exclusive||a.is_exclusive));
      const story=rows().find(a=>a.id===values.p_id&&a.editorial_status==="published");
      const result=url.pathname.includes("public_home_news")?list:url.pathname.includes("public_article_reading")&&story?
        [{article_id:story.id,body:story.summary,lang:story.lang,complete:true}]:[];
      return Promise.resolve(new Response(JSON.stringify(result),{headers:{"content-type":"application/json"}}));
    }
    return originalFetch(input,init);
  };
  window.WLSiteEditorFixture={get rows(){return rows();},failNext(){failures++;},setRole(next){role=next;for(const fn of listeners)fn("SIGNED_IN",session());}};
  if(document.querySelector('meta[name="wl-editor-preview"]')) {
    document.addEventListener("DOMContentLoaded",()=>{
      const box=document.createElement("aside");
      box.className="editor-demo";
      box.textContent="معاينة مستقلة • بيانات تجريبية لا تُنشر على الموقع";
      for(const [key,label] of [["admin","حساب المدير"],["reader","حساب قارئ"],["editor","محرر عادي"]]){
        const button=document.createElement("button");button.type="button";button.textContent=label;
        button.classList.toggle("active",role===key);button.setAttribute("aria-pressed",String(role===key));
        button.onclick=()=>{window.WLSiteEditorFixture.setRole(key);box.querySelectorAll("button").forEach(el=>{el.classList.toggle("active",el===button);el.setAttribute("aria-pressed",String(el===button));});};
        box.append(button);
      }
      document.body.prepend(box);
      for(const consent of document.querySelectorAll('[data-choice="denied"]')) {
        if(consent.getClientRects().length)consent.click();
      }
    });
  }
})();
