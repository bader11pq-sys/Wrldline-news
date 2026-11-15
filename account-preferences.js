/* WRLDLINE account preferences; push permission is not a subscription. */
(() => {
  "use strict";
  const categories = [["politics","سياسة"],["economy","اقتصاد وأسواق"],["security","أمن ودفاع"],["tech","تقنية"],["sports","رياضة"],["culture","ثقافة"],["health","صحة"],["science","علوم"],["environment","بيئة"],["society","مجتمع"],["world","حول العالم"]];
  const countries = [["الإمارات","الإمارات"],["السعودية","السعودية"],["قطر","قطر"],["الكويت","الكويت"],["البحرين","البحرين"],["عمان","عمان"],["مصر","مصر"],["فلسطين","فلسطين"],["لبنان","لبنان"],["الأردن","الأردن"],["سوريا","سوريا"],["العراق","العراق"],["المغرب","المغرب"],["الجزائر","الجزائر"],["تونس","تونس"],["الولايات المتحدة","الولايات المتحدة"],["المملكة المتحدة","المملكة المتحدة"],["الصين","الصين"],["روسيا","روسيا"],["دولي","العالم"]];
  const $ = id => document.getElementById(id);
  const state = { categories: [], countries: [] };
  const db = window.WRLDLINE_ACCOUNT_DB || null;
  const notifications = window.WRLDLINE_NOTIFICATIONS;
  let generation = 0;
  function status(message,type="") { const el=$("preferencesStatus"); if(el) { el.textContent=message; el.className="status preferences-status "+type; } }
  function chips(hostId,items,selected,type) {
    const host=$(hostId); if(!host) return; host.replaceChildren();
    const all=[...items,...selected.filter(value=>!items.some(item=>item[0]===value)).map(value=>[value,value])];
    all.forEach(([value,label])=>{ const b=document.createElement("button"); b.type="button"; b.className="pref-chip"+(selected.includes(value)?" is-selected":""); b.dataset.prefType=type; b.dataset.prefValue=value; b.setAttribute("aria-pressed",String(selected.includes(value))); b.textContent=label; host.append(b); });
  }
  function render() { chips("prefCategories",categories,state.categories,"category"); chips("prefCountries",countries,state.countries,"country"); }
  function reset() { generation++; state.categories=[]; state.countries=[]; $("prefBreaking").checked=false; $("prefBrowser").checked=false; render(); status(""); }
  async function load() {
    const run=++generation;
    if(!db) { status("تعذر تحميل خدمات الحساب.","error"); return; }
    const {data:{session}}=await db.auth.getSession(); if(!session) { reset(); return; }
    const {data,error}=await db.from("user_preferences").select("followed_categories,followed_countries,notify_breaking,notify_categories,notify_countries,browser_notifications").eq("user_id",session.user.id).maybeSingle();
    if(run!==generation) return;
    if(error) { status("تعذر تحميل التفضيلات حالياً.","error"); return; }
    state.categories=data?.followed_categories||[]; state.countries=data?.followed_countries||[];
    $("prefBreaking").checked=data?.notify_breaking!==false;
    const browserEnabled=!!data?.browser_notifications && !!notifications && await notifications.isEnabled(db);
    if(run!==generation) return;
    $("prefBrowser").checked=browserEnabled;
    render();
  }
  async function availability() {
    if(!notifications) { $("pushReadiness").textContent="خدمة الإشعارات غير مهيأة بعد."; $("prefBrowser").disabled=true; return; }
    const config=await notifications.readiness();
    $("prefBrowser").disabled=!config.push_ready || !notifications.supported() || notifications.iosNeedsInstall();
    $("pushReadiness").textContent=notifications.iosNeedsInstall()?"على iPhone وiPad: أضف الموقع إلى الشاشة الرئيسية من Safari ثم افتحه منها (iOS/iPadOS 16.4 أو أحدث).":!notifications.supported()?"هذا المتصفح لا يدعم Web Push؛ يمكنك حفظ تفضيلات القراءة أو الاشتراك بالنشرة.":config.push_ready?"Push متاح باختيارك فقط. قد تصل التنبيهات حتى عندما تكون الصفحة مغلقة، بحسب دعم الجهاز.":"خدمة Push غير مفعلة أو غير متاحة الآن. لن نطلب صلاحية أو نعرض أنها مفعلة قبل اكتمال الإعداد.";
  }
  async function save() {
    if(!db) throw new Error("خدمات الحساب غير متاحة.");
    const {data:{session}}=await db.auth.getSession(); if(!session) throw new Error("سجّل الدخول أولاً.");
    const run=++generation;
    const payload={user_id:session.user.id,followed_categories:[...state.categories],followed_countries:[...state.countries],notify_breaking:$("prefBreaking").checked,notify_categories:[...state.categories],notify_countries:[...state.countries],browser_notifications:false};
    let pushError=null, cleanup=null;
    if($("prefBrowser").checked && !$("prefBrowser").disabled) {
      try { if(!notifications) throw new Error("خدمة Push غير مهيأة."); payload.browser_notifications=await notifications.enable(db); } catch(e) { pushError=e; }
    } else if(notifications) cleanup=await notifications.disable(db,session);
    const {data:{session:latest}}=await db.auth.getSession();
    if(!latest || latest.user.id!==session.user.id || run!==generation) { await notifications?.disable(db,session); throw new Error("تغير الحساب أثناء الطلب. أعد المحاولة."); }
    const {error}=await db.from("user_preferences").upsert(payload,{onConflict:"user_id"});
    if(error) { await notifications?.disable(db,session); throw new Error("تعذر حفظ التفضيلات. لم نؤكد تفعيل Push."); }
    $("prefBrowser").checked=payload.browser_notifications;
    window.dispatchEvent(new CustomEvent("wrldline:preferences-updated",{detail:payload}));
    if(pushError) { status("تم حفظ تفضيلات القراءة، لكن Push لم يُفعّل: "+pushError.message,"error"); return; }
    status(payload.browser_notifications?"تم حفظ التفضيلات وتفعيل اشتراك Push على هذا الجهاز وفق اختياراتك.":"تم حفظ تفضيلات القراءة وإيقاف Push."+(cleanup?.server_removed===false?" أُوقف اشتراك الجهاز محلياً؛ تعذر حذف سجله من الخادم حالياً.":""),"ok");
  }
  function init() {
    if(!$("preferencesSection")) return;
    ["prefCategories","prefCountries"].forEach(id=>$(id)?.addEventListener("click",event=>{const b=event.target.closest("[data-pref-type]");if(!b)return;const key=b.dataset.prefType==="category"?"categories":"countries",value=b.dataset.prefValue;state[key]=state[key].includes(value)?state[key].filter(v=>v!==value):[...state[key],value];render();}));
    $("savePreferencesButton").addEventListener("click",async()=>{const b=$("savePreferencesButton");b.disabled=true;try{await save();}catch(e){$("prefBrowser").checked=false;status(e.message,"error");}finally{b.disabled=false;}});
    $("disablePushButton").addEventListener("click",async()=>{const b=$("disablePushButton");b.disabled=true;$("prefBrowser").checked=false;try{await save();}catch(e){status(e.message,"error");}finally{b.disabled=false;}});
    if(db) { notifications?.observeAuth(db); db.auth.onAuthStateChange((event)=>{ if(event==="SIGNED_OUT")reset(); else if(["SIGNED_IN","INITIAL_SESSION"].includes(event))setTimeout(()=>load(),0); }); }
    render();load();availability();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
