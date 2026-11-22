const SUPABASE_URL="https://vmaxbnogmmfyrcucapnq.supabase.co";
const SUPABASE_KEY="sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
const MEDIA_BUCKET="news-media";
let db=null;
const $=id=>document.getElementById(id);
const currentLang=()=>window.wrldlineLang||localStorage.getItem("wrldline:language")||"ar";
const t=(ar,en)=>currentLang()==="ar"?ar:en;
let cachedArticles=[];
let trustSchemaAvailable=false;
let editorialExtrasAvailable=false;
let activeArticle=null, editorLoadVersion=0;
const workspace=window.WLEditorWorkspace;
const editionEditor=window.WLEditorEditions;
let publishedNotice=null;
try{if(typeof BroadcastChannel==="function")publishedNotice=new BroadcastChannel("wrldline:publication");}catch{}
const listCore="id,title,category,country,event_country,source_name,source_url,published_at,url,image_url,editorial_status,is_breaking,correction_note,corrected_at,lang,source_language";
const editorExtra="media_type,content_type,sponsor_name,sponsor_url,ai_classification_status,ai_risk_level";
const countryLabel=value=>{if(!value)return "";const map={"السعودية":"Saudi Arabia","المملكة العربية السعودية":"Saudi Arabia","مصر":"Egypt","الصين":"China","دولي":"Unknown","الإمارات":"United Arab Emirates","قطر":"Qatar","الكويت":"Kuwait","البحرين":"Bahrain","عمان":"Oman","اليمن":"Yemen","الأردن":"Jordan","لبنان":"Lebanon","فلسطين":"Palestine","سوريا":"Syria","العراق":"Iraq","المغرب":"Morocco","الجزائر":"Algeria","تونس":"Tunisia","ليبيا":"Libya","السودان":"Sudan"};return currentLang()==="en"?(map[value]||value):value;};
const editorialLabel=value=>{const map={published:t("منشور","Published"),draft:t("مسودة","Draft"),review:t("قيد المراجعة","In review"),rejected:t("مرفوض","Rejected")};return map[value]||value;};
function message(text){$("status").textContent=text;}
async function ensureDb(){
 if(db)return db;
 if(!window.supabase?.createClient){
  const sources=["/vendor/supabase-2.119.0.js","https://unpkg.com/@supabase/supabase-js@2.119.0/dist/umd/supabase.js"];
  for(const src of sources){
   try{await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error("Could not load "+src));document.head.appendChild(script);});if(window.supabase?.createClient)break;}catch(error){console.warn("Supabase SDK fallback failed",String(error));}
  }
 }
 if(!window.supabase?.createClient)throw new Error("تعذر تحميل مكتبة الاتصال. تحقق من اتصال الإنترنت أو مانع المحتوى ثم أعد المحاولة.");
 db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 window.WRLDLINE_ADMIN_DB=db;
 window.WRLDLINE_NOTIFICATIONS?.observeAuth(db);
 db.auth.onAuthStateChange(event=>{if(event==="PASSWORD_RECOVERY"){$("loginPanel").classList.add("hidden");$("recoveryPanel").classList.remove("hidden");message("أدخل كلمة المرور الجديدة لإكمال الاستعادة.");}});
 return db;
}
const ADMIN_REDIRECT="https://al-ghaib.us.ci/admin.html";
$("magicLinkButton").addEventListener("click",async()=>{const email=$("email").value.trim();if(!email){message("اكتب بريد حساب المدير أولاً.");$("email").focus();return;}const button=$("magicLinkButton");button.disabled=true;let error=null;try{await ensureDb();({error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:ADMIN_REDIRECT,shouldCreateUser:false}}));}catch(e){error=e;}button.disabled=false;message(error?"تعذر إرسال رابط الدخول: "+error.message:"إذا كان البريد مسجلاً، أرسلنا رابط دخول آمن لمرة واحدة. افتحه للعودة إلى لوحة التحرير.");});
$("forgotPasswordButton").addEventListener("click",async()=>{
 const email=$("email").value.trim();
 if(!email){message("اكتب بريد حساب المدير أولاً ثم اضغط استعادة كلمة المرور.");$("email").focus();return;}
 const button=$("forgotPasswordButton");button.disabled=true;
 let error=null;try{await ensureDb();({error}=await db.auth.resetPasswordForEmail(email,{redirectTo:ADMIN_REDIRECT}));}catch(e){error=e;}
 button.disabled=false;
 message(error?"تعذر إرسال رابط الاستعادة: "+error.message:"إذا كان البريد مسجلاً، ستصلك رسالة استعادة. افتحها على نفس الجهاز للعودة إلى لوحة التحرير.");
});
$("recoveryForm").addEventListener("submit",async e=>{
 e.preventDefault();const password=$("newPassword").value;
 if(password.length<8){message("كلمة المرور يجب ألا تقل عن 8 أحرف.");return;}
 let error=null;try{await ensureDb();({error}=await db.auth.updateUser({password}));}catch(e){error=e;}
 if(error){message("تعذر تحديث كلمة المرور: "+error.message);return;}
 $("recoveryPanel").classList.add("hidden");$("loginPanel").classList.remove("hidden");
 $("password").value="";$("newPassword").value="";
 message("تم تحديث كلمة المرور. سجّل الدخول الآن.");
 await db.auth.signOut();
});

function syncContentType(){const editorial=$("contentType").value==="editorial";$("source").value=editorial?"WRLDLINE NEWS":"هيئة التحرير";$("source").readOnly=editorial;document.querySelector('label[for="summary"]').textContent=editorial?"نص المقال الكامل":"ملخص الخبر / نص الخبر";$("summary").placeholder=editorial?"اكتب المقال كاملًا، ويمكنك تقسيمه إلى فقرات...":"اكتب ملخص الخبر أو تفاصيله...";$("contentTypeHint").textContent=editorial?"سيظهر المقال في واجهة الموقع كمنشور تحريري، مع الحفاظ على فواصل الفقرات.":"اكتب ملخص الخبر أو نصه، ويمكنك استخدام عدة أسطر.";}
$("contentType").addEventListener("change",syncContentType);
function syncSponsorFields(){const sponsored=$("articleKind")?.value==="sponsored";const name=$("sponsorName"),url=$("sponsorUrl");if(name)name.closest("div")?.classList.toggle("hidden",!sponsored);if(url){url.classList.toggle("hidden",!sponsored);const label=document.querySelector('label[for="sponsorUrl"]');if(label)label.classList.toggle("hidden",!sponsored);}}
$("articleKind")?.addEventListener("change",syncSponsorFields);syncSponsorFields();
function setMediaPreview(url,type){
 const host=$("mediaPreview");host.replaceChildren();if(!url){host.hidden=true;return;}host.hidden=false;
 const el=document.createElement(type==="video"?"video":"img");el.src=url;el.style.cssText="display:block;max-width:100%;max-height:240px;border-radius:10px;margin-top:8px";
 if(type==="video"){el.controls=true;el.playsInline=true;}host.append(el);
}
$("mediaFile").addEventListener("change",()=>{
 const file=$("mediaFile").files&&$("mediaFile").files[0];if(!file){setMediaPreview($("imageUrl").value,$("mediaType").value);return;}
 setMediaPreview(URL.createObjectURL(file),file.type.startsWith("video/")?"video":"image");
});
async function uploadSelectedMedia(){
 const file=$("mediaFile").files&&$("mediaFile").files[0];if(!file)return null;
 const allowed=["image/jpeg","image/png","image/webp","image/gif","image/avif","video/mp4","video/webm","video/quicktime"];
 if(!allowed.includes(file.type))throw new Error("نوع الملف غير مدعوم. استخدم صورة أو MP4 أو WebM أو MOV.");
 const max=file.type.startsWith("video/")?100*1024*1024:20*1024*1024;
 if(file.size>max)throw new Error(file.type.startsWith("video/")?"حجم الفيديو يتجاوز 100 ميغابايت.":"حجم الصورة يتجاوز 20 ميغابايت.");
 const ext=(file.name.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"")||"bin";
 const path="articles/"+Date.now()+"-"+Math.random().toString(36).slice(2)+"."+ext;
 const uploaded=await db.storage.from(MEDIA_BUCKET).upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
 if(uploaded.error)throw uploaded.error;
 const pub=db.storage.from(MEDIA_BUCKET).getPublicUrl(uploaded.data.path);
 return {url:pub.data.publicUrl,type:file.type.startsWith("video/")?"video":"image",path:uploaded.data.path};
}
function resetForm(){
 activeArticle=null;editorLoadVersion++;
 resetTrustEditor();
 editionEditor?.attach(null,null);
 const original=$("originalArticleLanguage");
 original.disabled=false;
 original.querySelector("option[data-existing]")?.remove();
 $("articleForm").reset();$("articleId").value="";$("contentType").value="news";$("source").value="هيئة التحرير";$("source").readOnly=false;syncContentType();$("editorialStatus").value="published";$("articleKind").value="news";$("sponsorName").value="";$("sponsorUrl").value="";$("correctionNote").value="";syncSponsorFields();$("isBreaking").checked=false;$("mediaType").value="image";$("mediaFile").value="";setMediaPreview("");syncPublishButtons();
 workspace?.setBody("");workspace?.markClean();workspace?.showSavedDraft();
}
function syncPublishButtons(){
 const status=$("editorialStatus").value;
 $("saveButton").textContent=status==="published"?(activeArticle?.editorial_status==="published"?t("حفظ التعديلات","Save changes"):t("نشر الآن","Publish now")):t("حفظ الحالة المحددة","Save selected status");
 $("saveDraftButton").hidden=activeArticle?.editorial_status==="published";
}
$("editorialStatus").addEventListener("change",syncPublishButtons);
async function loadTranslationReview(){
 const list=$("translationReviewList");
 if(!list)return;
 list.textContent=t("جارٍ تحميل الترجمات...","Loading translations...");
 const {data,error}=await db.from("article_translations").select("id,article_id,lang,title,translation_status,translation_source,created_at,article:articles(id,title,source_name,source_url,url,editorial_status)").eq("translation_status","review").order("created_at",{ascending:false}).limit(50);
 if(error){list.textContent=t("تعذر تحميل الترجمات: ","Could not load translations: ")+error.message;return;}
 list.replaceChildren();
 const rows=data||[];
 if(!rows.length){const empty=document.createElement("p");empty.textContent=t("لا توجد ترجمات آلية تنتظر المراجعة.","No machine translations are waiting for review.");list.append(empty);return;}
 for(const row of rows){
  const item=document.createElement("div");item.className="item";
  const title=document.createElement("strong");title.textContent=(row.article?.title||row.article_id)+" · "+row.lang.toUpperCase();item.append(title);
  const meta=document.createElement("small");meta.textContent=[row.article?.source_name,row.translation_source,row.created_at?new Date(row.created_at).toLocaleString(currentLang()==="ar"?"ar-SA":"en-US"):""].filter(Boolean).join(" · ");item.append(meta);
  const reading=document.createElement("details");reading.className="translation-reading";
  const reveal=document.createElement("summary");reveal.textContent=t("افتح النص الأصلي والترجمة","Open original and translation");reading.append(reveal);
  const texts=document.createElement("div");reading.append(texts);item.append(reading);
  let originalUrl=null;for(const candidate of [row.article?.url,row.article?.source_url]){try{originalUrl=trustHttpUrl(candidate);if(originalUrl)break;}catch(_){}}
  if(originalUrl){const a=document.createElement("a");a.href=originalUrl;a.target="_blank";a.rel="noopener noreferrer";a.textContent=t("افتح المصدر الأصلي للمقارنة","Open original source to compare");a.style.color="var(--gold)";item.append(a);}
  const actions=document.createElement("div");actions.className="actions";
  const publish=document.createElement("button");publish.className="btn";publish.disabled=true;publish.textContent=t("نشر الترجمة","Publish translation");publish.addEventListener("click",()=>setTranslationStatus(row.id,"published"));actions.append(publish);
  let loaded=false,loading=false;
  reading.addEventListener("toggle",async()=>{
   if(!reading.open||loaded||loading)return;
   loading=true;texts.textContent=t("جارٍ تحميل النصّين…","Loading both texts…");
   try{
    const result=await db.from("article_translations").select("summary,article:articles(summary)").eq("id",row.id).eq("translation_status","review").single();
    if(result.error)throw result.error;
    texts.replaceChildren();
    for(const [label,value] of [[t("النص الأصلي","Original text"),result.data.article?.summary],[t("الترجمة","Translation"),result.data.summary]]){
     const caption=trustNode("strong",label),body=trustNode("p",value||"");body.dir="auto";texts.append(caption,body);
    }
    loaded=true;publish.disabled=false;
   }catch{texts.textContent=t("تعذّر تحميل النصّين. أغلق المعاينة وافتحها للمحاولة مجددًا.","Could not load both texts. Close and reopen to retry.");}
   finally{loading=false;}
  });
  const reject=document.createElement("button");reject.className="btn danger";reject.textContent=t("رفض","Reject");reject.addEventListener("click",()=>setTranslationStatus(row.id,"rejected"));actions.append(reject);
  item.append(actions);list.append(item);
 }
}
async function setTranslationStatus(id,status){
 const note=prompt(status==="published"?t("اكتب ما راجعته بشريًا بعد مقارنة النص بالمصدر:","Describe your human review after comparing against the source:"):t("سبب رفض الترجمة:","Reason for rejection:"));
 if(!note?.trim())return;
 const {error}=await db.rpc("review_article_translation",{p_translation_id:id,p_decision:status,p_note:note.trim()});
 if(error){message(t("تعذر تحديث الترجمة: ","Could not update translation: ")+error.message);return;}
 message(status==="published"?t("نُشرت الترجمة بعد المراجعة.","Translation published after review."):t("رُفضت الترجمة.","Translation rejected."));
 await loadTranslationReview();
}
async function showSession(){await ensureDb();const {data:{session}}=await db.auth.getSession();const role=session?.user?.app_metadata?.role;const allowed=["editor","admin"].includes(role);$("loginPanel").classList.toggle("hidden",!!session);$("accessPanel").classList.toggle("hidden",!session||allowed);$("editorPanel").classList.toggle("hidden",!allowed);workspace?.account(allowed?session.user.id:null,async draft=>{
 if(draft.id)return editArticle({id:draft.id},true);
 resetForm();return true;
});if(session&&allowed){$("userLabel").textContent=(session.user.email||"محرر مسجل")+" · "+role;void loadArticles();void loadTranslationReview();void loadOpsDashboard();if(opsRefreshTimer)clearInterval(opsRefreshTimer);opsRefreshTimer=setInterval(()=>{if(!document.hidden)loadOpsDashboard();},60000);}else{resetForm();if(opsRefreshTimer)clearInterval(opsRefreshTimer);opsRefreshTimer=null;if(session){message("تم تسجيل الدخول، لكن الحساب لا يحمل دوراً تحريرياً موثوقاً.");}}}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();message("جارٍ التحقق...");try{await ensureDb();const {error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error){message("تعذر تسجيل الدخول: "+error.message);return;}message("تم تسجيل الدخول.");await showSession();}catch(error){message("حدث خطأ أثناء الاتصال بخدمة الدخول: "+(error?.message||String(error)));}});
$("logoutButton").addEventListener("click",async()=>{try{workspace?.persist();await ensureDb();await window.WRLDLINE_NOTIFICATIONS?.beforeLogout(db);const {error}=await db.auth.signOut();if(error)throw error;message("تم تسجيل الخروج.");await showSession();}catch(error){message("تعذر تسجيل الخروج: "+error.message);}});
async function runProviderHealthcheck(){
 const button=$("runProviderHealthButton"),summary=$("providerHealthSummary"),host=$("providerHealthResults");
 button.disabled=true;button.textContent="جارٍ فحص المزودات...";summary.textContent="يتم الآن اختبار المصادقة والاتصال وطلب ترجمة/توليد حقيقي لكل مزود مُعدّ.";host.replaceChildren();
 try{
  const {data,error}=await db.functions.invoke("ai-provider-healthcheck",{body:{}});
  if(error)throw error;
  const results=Array.isArray(data?.results)?data.results:[];
  const labels={gemini:"Google Gemini",groq:"Groq",nvidia:"NVIDIA",openrouter:"OpenRouter",gonka:"Gonka",bazaarlink:"BazaarLink",deepl:"DeepL"};
  const states={passed:"ناجح",failed:"فشل",not_configured:"غير مُعدّ"};
  const colors={passed:"#1d8b62",failed:"#c64a52",not_configured:"#78879a"};
  const counts={passed:0,failed:0,not_configured:0};
  for(const item of results){
   const status=states[item.status]?item.status:"failed";counts[status]++;
   const row=document.createElement("div");row.className="item";
   const title=document.createElement("strong");title.textContent=(labels[item.provider]||item.provider)+" — "+states[status];title.style.color=colors[status];
   const detail=document.createElement("small");
   const extras=[];
   if(item.model)extras.push("النموذج: "+item.model);
   if(item.operation)extras.push("الاختبار: "+item.operation);
   if(item.characters_used!==undefined&&item.characters_used!==null)extras.push("الاستهلاك: "+item.characters_used+(item.character_limit!==null?"/"+item.character_limit:""));
   if(item.models_available!==undefined)extras.push("النماذج المتاحة: "+item.models_available);
   if(item.error)extras.push("السبب: "+item.error);
   if(item.key_source)extras.push("مصدر مفتاح Gemini: "+item.key_source);
   detail.textContent=extras.join(" · ")||(status==="not_configured"?"لم يتم ضبط مفتاح هذا المزود.":status==="passed"?"اكتمل الاختبار بنجاح.":"لم يكتمل الاختبار.");
   row.append(title,detail);host.append(row);
  }
  const stamp=data?.tested_at?new Date(data.tested_at).toLocaleString("ar-SA"):"";
  summary.textContent="النتيجة: "+counts.passed+" ناجح · "+counts.failed+" فاشل · "+counts.not_configured+" غير مُعدّ"+(stamp?" · آخر فحص: "+stamp:"");
  if(!results.length)summary.textContent="وصل رد غير متوقع من خدمة الفحص: "+JSON.stringify(data).slice(0,300);
 }catch(error){summary.textContent="تعذر تنفيذ الفحص: "+(error?.message||String(error))+" — تأكد من تسجيل الدخول بصلاحية محرر أو مدير.";}
 finally{button.disabled=false;button.textContent="إعادة فحص جميع المزودات";}
}
$("runProviderHealthButton").addEventListener("click",runProviderHealthcheck);
$("resetButton").addEventListener("click",()=>{if(editionEditor?.saving()||((workspace?.isDirty()||editionEditor?.isDirty())&&!confirm("هل تريد إغلاق النص الحالي وبدء نص جديد؟")))return;workspace?.persist();resetForm();workspace?.saved("");$("title").focus();});$("refreshButton").addEventListener("click",loadArticles);$("classifyButton").addEventListener("click",classifyPending);$("refreshTranslationsButton")?.addEventListener("click",loadTranslationReview);$("articleSearch").addEventListener("input",renderArticleList);$("statusFilter").addEventListener("change",renderArticleList);
async function loadArticles(){
 const query=fields=>db.from("articles").select(fields).order("published_at",{ascending:false}).limit(200);
 let result=await query(listCore+","+editorExtra);
 editorialExtrasAvailable=!result.error;
 if(result.error)result=await query(listCore);
 if(result.error){$("articleList").textContent=t("تعذر تحميل الأخبار: ","Could not load stories: ")+result.error.message;return;}
 cachedArticles=result.data||[];
 cachedArticles=cachedArticles.map(article=>({...article,country:window.WLEditorial.eventCountry(article)}));
 for(const field of ["articleKind","sponsorName","sponsorUrl"])if($(field))$(field).disabled=!editorialExtrasAvailable;
 $("classifyButton").disabled=!editorialExtrasAvailable;
 renderArticleList();
}
async function classifyPending(){
 const pending=cachedArticles.filter(a=>a.editorial_status==="published"&&a.ai_classification_status!=="classified"&&!/t\.me|telegram\.me|telegram/i.test([a.url,a.source_url,a.source_name].join(" "))).slice(0,10);
 if(!pending.length){message(t("لا توجد أخبار منشورة تنتظر التصنيف حالياً.","No published stories are waiting for classification."));return;}
 const button=$("classifyButton");button.disabled=true;button.textContent=t("جارٍ تحليل الأخبار...","Classifying stories...");
	 const {data,error}=await db.functions.invoke("classify-news",{body:{article_ids:pending.map(a=>a.id)}});
	 button.disabled=false;button.textContent=t("✦ تحليل 10 أخبار بالذكاء الاصطناعي","✦ AI-classify 10 stories");
	 if(error){message(t("تعذر تشغيل الذكاء الاصطناعي: ","Could not run AI classification: ")+error.message+t(" — تأكد من نشر الدالة وضبط أحد مزودي الذكاء الاصطناعي في أسرار Supabase."," — Make sure the function is deployed and at least one AI provider is configured in Supabase secrets."));return;}
 const ok=(data?.results||[]).filter(x=>x.status==="classified").length;
 const review=(data?.results||[]).filter(x=>x.status==="needs_review").length;
 const failed=(data?.results||[]).filter(x=>x.status==="failed").length;
 message(t("اكتمل التحليل: ","Classification complete: ")+ok+t(" مصنّف · "," classified · ")+review+t(" يحتاج مراجعة · "," need review · ")+failed+t(" تعذّر تحليله."," failed."));
 await loadArticles();
}
function renderArticleList(){
 const q=$("articleSearch").value.trim().toLocaleLowerCase(),status=$("statusFilter").value;
 const rows=cachedArticles.filter(a=>(status==="all"||a.editorial_status===status)&&(!q||[a.title,a.country,a.source_name].join(" ").toLocaleLowerCase().includes(q)));
 const result=document.createDocumentFragment();
 result.append(trustNode("p",currentLang()==="ar"?rows.length+" نتيجة · من أحدث "+cachedArticles.length:rows.length+" results · latest "+cachedArticles.length,"muted"));
 if(!rows.length)result.append(trustNode("p",t("لا توجد أخبار مطابقة.","No matching stories.")));
 for(const a of rows){
  const row=trustNode("article",null,"item editorial-list-item");
  const title=trustNode("strong",(a.is_breaking?t("عاجل · ","Breaking · "):"")+(a.title||t("بلا عنوان","Untitled")));title.dir="auto";
  const state=trustNode("span",editorialLabel(a.editorial_status),"editorial-status");state.dataset.state=a.editorial_status;
  const meta=trustNode("small",[a.source_name,countryLabel(a.country),"AI: "+(a.ai_classification_status||"pending"),t("الخطر: ","Risk: ")+(a.ai_risk_level||"unknown"),a.published_at?new Date(a.published_at).toLocaleString(currentLang()==="ar"?"ar-SA":"en-US"):""].filter(Boolean).join(" · "));
  const actions=trustNode("div",null,"actions");
  actions.append(trustButton(t("تعديل","Edit"),()=>editArticle(a)));
  if(a.editorial_status==="published")actions.append(trustButton(t("عرض الخبر","View story"),()=>window.open("/news/"+encodeURIComponent(a.id),"_blank","noopener")));
  else actions.append(trustButton(t("نشر الآن","Publish now"),()=>setArticleStatus(a.id,"published")));
  if(a.editorial_status!=="review")actions.append(trustButton(t("نقل إلى المراجعة","Move to review"),()=>setArticleStatus(a.id,"review")));
  const remove=trustButton(t("حذف","Delete"),()=>deleteArticle(a.id));remove.className="btn danger";actions.append(remove);
  row.append(state,title,meta,actions);result.append(row);
 }
 $("articleList").replaceChildren(result);
}
function announcePublication(id){
 const link="/news/"+encodeURIComponent(id);
 workspace?.saved(t("تم النشر على الموقع.","Published on the site."),link);
 publishedNotice?.postMessage({type:"published"});
}
async function setArticleStatus(id,status){
 const previous=cachedArticles.find(a=>a.id===id);
 if(!previous||previous.editorial_status===status)return;
 const values={editorial_status:status};
 if(status==="published")values.published_at=new Date().toISOString();
 const {error}=await db.from("articles").update(values).eq("id",id).eq("editorial_status",previous.editorial_status).select("id").single();
 if(error){message("تعذر تغيير حالة الخبر: "+error.message);return;}
 if(status==="published"){announcePublication(id);$("publishFeedback").scrollIntoView({block:"nearest"});}
 message(t("تم تحديث حالة الخبر إلى ","Story status updated to ")+editorialLabel(status)+".");void loadArticles();
}
async function editArticle(ref,restoring=false){
 const form=$("articleForm");
 if(form.inert||editionEditor?.saving()||(!restoring&&(workspace?.isDirty()||editionEditor?.isDirty())&&!confirm("هل تريد إغلاق النص الحالي وفتح مقال آخر؟")))return false;
 workspace?.persist();
 const version=++editorLoadVersion;
 workspace?.saved("جارٍ تحميل النص الكامل…");
 $("articleComposer").scrollIntoView({block:"start"});
 const fields=listCore+",summary"+(editorialExtrasAvailable?","+editorExtra:"");
 form.inert=true;
 $("restoreWorkingDraft").disabled=true;
 let result;
 try{result=await db.from("articles").select(fields).eq("id",ref.id).single();}
 catch(error){result={error};}
 finally{form.inert=false;$("restoreWorkingDraft").disabled=false;}
 if(version!==editorLoadVersion)return false;
 if(result.error){workspace?.saved("تعذّر فتح المقال: "+result.error.message);return false;}
 const a=result.data;
 a.country=window.WLEditorial.eventCountry(a);
 resetTrustEditor();
 activeArticle=a;
 const original=$("originalArticleLanguage"), lang=window.WLArticleEditions?.originalLanguage(a.source_language||a.lang,a.title)||"ar";
 const code=window.WLArticleEditions?.locale(lang)||lang;
 original.querySelector("option[data-existing]")?.remove();
 if(!["ar","en"].includes(code)){const option=new Option(lang,lang);option.dataset.existing="";original.add(option);}
 original.value=code;original.disabled=true;
 editionEditor?.attach(db,a);
 $("articleId").value=a.id;$("title").value=a.title||"";$("category").value=a.category||"uncategorized";$("country").value=a.country||"";$("contentType").value=a.source_name==="WRLDLINE NEWS"?"editorial":"news";syncContentType();$("sourceUrl").value=a.source_url||(/^https?:\/\//i.test(a.url||"")?a.url:"");$("source").value=a.source_name||"هيئة التحرير";$("imageUrl").value=a.image_url||"";$("mediaType").value=a.media_type||"image";$("mediaFile").value="";setMediaPreview(a.image_url||"",a.media_type||"image");$("editorialStatus").value=a.editorial_status||"published";$("articleKind").value=a.content_type||"news";$("sponsorName").value=a.sponsor_name||"";$("sponsorUrl").value=a.sponsor_url||"";$("correctionNote").value=a.correction_note||"";syncSponsorFields();$("isBreaking").checked=!!a.is_breaking;
 if(workspace)workspace.setBody(a.summary);else $("summary").value=a.summary||"";
 syncPublishButtons();workspace?.markClean();workspace?.showSavedDraft();workspace?.saved("");
 $("title").focus({preventScroll:true});
 void loadTrustContext(a.id,version);
 return true;
}
async function loadTrustContext(id,version){
 const columns="agency_name,agency_account_url,agency_statement_url,agency_narrative,trust_source_excerpt,editorial_trust_status,human_translation_status";
 const [core,notes]=await Promise.all([
  db.from("articles").select(columns).eq("id",id).single(),
  db.rpc("get_editor_article_trust",{p_article_ids:[id]})
 ]);
 if(version!==editorLoadVersion||activeArticle?.id!==id)return;
 trustSchemaAvailable=!core.error&&!notes.error;
 if(trustSchemaAvailable)Object.assign(activeArticle,core.data,notes.data?.[0]);
 void loadTrustEditor(id);
}
$("articleForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const id=$("articleId").value,button=$("saveButton"),draftButton=$("saveDraftButton");
  if(button.disabled||editionEditor?.saving()||(editionEditor?.isDirty()&&!confirm("هناك تغييرات غير محفوظة في النسخة الأخرى. هل تحفظ الأصل وتغلقها؟")))return;
  const previous=activeArticle?.id===id?activeArticle:null;
  const status=e.submitter===draftButton&&previous?.editorial_status!=="published"?"draft":$("editorialStatus").value;
  const title=$("title").value.trim(),summary=workspace?.getBody()??$("summary").value;
  const originalLang=$("originalArticleLanguage").value;
  if(!title||!summary.trim()||summary.length>1000000||!["published","draft","review","rejected"].includes(status)){
   workspace?.saved("تحقّق من العنوان والنص وحالة النشر. الحد الأقصى مليون حرف.");return;
  }
  button.disabled=true;draftButton.disabled=true;$("articleForm").inert=true;$("restoreWorkingDraft").disabled=true;
  button.textContent=t("جارٍ الحفظ…","Saving…");
  workspace?.saved(t("جارٍ الحفظ…","Saving…"));
  message(t("جارٍ حفظ الخبر في قاعدة البيانات...","Saving story to the database..."));
  let uploaded=null,saveCompleted=false;
  try{
   await ensureDb();
   uploaded=await uploadSelectedMedia();
   const imageUrl=uploaded?uploaded.url:($("imageUrl").value.trim()||null);
   const payload={title,summary,category:$("category").value,country:$("country").value.trim()||null,source_name:$("contentType").value==="editorial"?"WRLDLINE NEWS":$("source").value.trim(),url:$("sourceUrl").value.trim()||(!/^https?:\/\//i.test(previous?.url||"")&&previous?.url)||("editorial-"+Date.now()),image_url:imageUrl,media_type:uploaded?uploaded.type:(imageUrl?($("mediaType").value||"image"):null),editorial_status:status,is_breaking:$("isBreaking").checked,content_type:$("articleKind").value,sponsor_name:$("articleKind").value==="sponsored"?($("sponsorName").value.trim()||null):null,sponsor_url:$("articleKind").value==="sponsored"?($("sponsorUrl").value.trim()||null):null,correction_note:$("correctionNote").value.trim()||null,corrected_at:$("correctionNote").value.trim()?new Date().toISOString():null};
   payload.source_url=$("sourceUrl").value.trim()||null;payload.event_country=payload.country;
   if(previous&&previous.country===payload.event_country){delete payload.country;delete payload.event_country;}
   if(previous&&(previous.correction_note||null)===payload.correction_note)payload.corrected_at=previous.corrected_at||null;
   if(!editorialExtrasAvailable){for(const field of ["media_type","content_type","sponsor_name","sponsor_url"])delete payload[field];}
   if(id&&status==="published"&&previous?.editorial_status!=="published")payload.published_at=new Date().toISOString();
   const query=id?db.from("articles").update(payload).eq("id",id).eq("editorial_status",previous?.editorial_status||"draft").select("id").single():db.from("articles").insert({...payload,lang:originalLang,source_language:originalLang,published_at:new Date().toISOString()}).select("id").single();
   const result=await query;
   if(result.error)throw result.error;
   saveCompleted=true;
   message(status==="published"?"تم نشر الخبر.":status==="draft"?"حُفظت المسودة الخاصة.":"حُفظ الخبر دون نشره.");
   workspace?.clearSaved();resetForm();
   editionEditor?.attach(db,{id:result.data.id,title,lang:previous?.lang||originalLang,source_language:previous?.source_language||originalLang,editorial_status:status});
   if(status==="published")announcePublication(result.data.id);
   else workspace?.saved(status==="draft"?"حُفظت المسودة. يمكنك فتحها من غرفة المراجعة.":"تم الحفظ دون نشر.");
   // A list/dashboard refresh failure must never hide a successful database save.
   loadArticles().catch(refreshError=>{console.error("Article saved, but list refresh failed",refreshError);});
  }catch(error){
   console.error("WRLDLINE article save failed",error);
   message((saveCompleted?"تم الحفظ لكن حدث خطأ لاحق: ":"تعذّر نشر الخبر: ")+(error?.message||String(error)));
   if(!saveCompleted)workspace?.saved("تعذّر الحفظ. نصّك ما زال في المحرّر. "+(error?.message||""));
   if(uploaded&&!saveCompleted){try{await db.storage.from(MEDIA_BUCKET).remove([uploaded.path]);}catch(cleanupError){console.warn("Media cleanup failed",cleanupError);}}
  }finally{
   button.disabled=false;draftButton.disabled=false;$("articleForm").inert=false;$("restoreWorkingDraft").disabled=false;syncPublishButtons();
  }
 });
async function deleteArticle(id){if(!confirm("هل تريد حذف هذا الخبر نهائياً؟"))return;const {error}=await db.from("articles").delete().eq("id",id);if(error){message("فشل الحذف: "+error.message);return;}message("تم حذف الخبر.");await loadArticles();}
document.addEventListener("wrldline:language",()=>{renderArticleList();});

let opsRefreshTimer=null;
const opsFmt=value=>value?new Date(value).toLocaleString("ar-SA",{hour12:true}):"—";
const opsSafe=value=>String(value??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function opsLine(label,value,state=""){
 const row=document.createElement("div");row.className="ops-line";
 const a=document.createElement("span");a.textContent=label;
 const b=document.createElement("strong");b.textContent=value;b.className=state;
 row.append(a,b);return row;
}
async function loadOpsDashboard(){
 const status=$("opsStatus"),button=$("opsRefreshButton");
 if(!db||$("editorPanel").classList.contains("hidden"))return;
 button.disabled=true;status.textContent="جارٍ جلب المؤشرات من الخادم...";
 try{
  const {data,error}=await db.functions.invoke("ops-dashboard",{body:{}});
  if(error)throw error;
  if(!data||data.error)throw new Error(data?.error||"رد غير صالح من خدمة المراقبة");
  const f=data.feeds||{},ing=data.ingestion||{},c=data.content||{};
  $("opsFeeds").textContent=f.active??"—";
  $("opsFeedsHint").textContent=(f.failed||0)+" مصدر لديه خطأ · "+(f.stale||0)+" مصدر متأخر";
  $("opsFeedsHint").className=(f.failed||f.stale)?"ops-warn":"ops-ok";
  $("opsRuns").textContent=ing.runs_1h??"—";
  $("opsRunsHint").textContent=(ing.runs_24h||0)+" دورة خلال 24 ساعة";
  $("opsPublished").textContent=c.published_last_hour??"—";
  $("opsBreaking").textContent=(data.breaking_last_hour||0)+" خبر عاجل في آخر ساعة";
  $("opsPending").textContent=c.ai_pending??"—";
  $("opsTranslation").textContent=(c.translation_errors_24h||0)+" أخطاء ترجمة خلال 24 ساعة";
  $("opsUpdatedAt").textContent="آخر تحديث: "+opsFmt(data.generated_at);
  status.textContent="تم تحديث المؤشرات بنجاح.";
  status.style.color="#54c79a";
  const pipes=$("opsPipelines");pipes.replaceChildren();
  const entries=Object.entries(ing.pipelines||{});
  if(!entries.length)pipes.textContent="لا توجد دورات مسجلة في آخر 24 ساعة.";
  for(const [name,p] of entries){
   const rate=p.runs?Math.round(p.failed/p.runs):0;
   pipes.append(opsLine(name,p.runs+" دورة · "+p.parsed+" مقال · "+p.failed+" فشل",p.failed?"ops-warn":"ops-ok"));
  }
  const providers=$("opsProviders");providers.replaceChildren();
  const list=data.providers||[];
  if(!list.length)providers.textContent="لا توجد حالات توقف مسجلة حاليًا؛ هذا لا يغني عن فحص المزودات.";
  for(const p of list){
   const active=p.disabled_until&&new Date(p.disabled_until)>new Date();
   providers.append(opsLine(p.provider,active?"متوقف حتى "+opsFmt(p.disabled_until):"لا يوجد توقف مسجل",active?"ops-bad":"ops-ok"));
   if(p.reasons?.length){const note=document.createElement("small");note.textContent=p.reasons.join(" · ");note.style.color="var(--muted)";providers.append(note);}
  }
  const tbody=$("opsRunsTable");tbody.replaceChildren();
  for(const run of (ing.latest_runs||[]).slice(0,10)){
   const tr=document.createElement("tr");
   [run.pipeline,opsFmt(run.started_at),run.source_count??"—",run.successful_sources??"—",run.failed_sources??"—",run.parsed_items??"—"].forEach((v,i)=>{const td=document.createElement("td");td.textContent=v; if(i===4&&Number(v)>0)td.className="ops-bad";tr.append(td);});
   tbody.append(tr);
  }
  if(!tbody.children.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=6;td.textContent="لا توجد دورات مسجلة.";tr.append(td);tbody.append(tr);}
  const errors=$("opsFeedErrors");errors.replaceChildren();
  if(!(f.failed_samples||[]).length)errors.textContent="لا توجد أخطاء مسجلة على المصادر النشطة.";
  for(const feed of (f.failed_samples||[])){
   const box=document.createElement("div");box.className="ops-line";box.style.display="block";
   const name=document.createElement("strong");name.textContent=feed.name||"مصدر بلا اسم";
   const detail=document.createElement("small");detail.textContent=String(feed.last_error||"خطأ غير محدد").slice(0,240);detail.style.display="block";detail.style.color="var(--muted)";
   box.append(name,detail);errors.append(box);
  }
 }catch(error){
  status.textContent="تعذر تحديث لوحة المراقبة: "+(error?.message||String(error));
  status.style.color="#ed747c";
 }finally{button.disabled=false;}
}
$("opsRefreshButton")?.addEventListener("click",loadOpsDashboard);

showSession().catch(error=>message("تعذر تهيئة لوحة التحرير: "+(error?.message||String(error))));

// Editorial trust editor: protected table reads; never call public RPC for internal notes.
let activeTrustId=null;
let trustEvidence=[];
let trustClaims=[];
let trustLoadVersion=0;
const trustStatusLabel=value=>({confirmed:t("مؤكد بمراجعة بشرية","Human-reviewed confirmation"),unconfirmed:t("غير مؤكد","Unconfirmed"),disputed:t("متنازع عليه","Disputed")}[value]||t("غير مؤكد","Unconfirmed"));
function trustNotice(value){$("trustEditorStatus").textContent=value;}
function resetTrustEditor(){
 activeTrustId=null;trustLoadVersion++;trustEvidence=[];trustClaims=[];
 $("trustEditorControls").classList.add("hidden");
 trustNotice(t("اختر خبرًا محفوظًا لتحرير سجل المصداقية.","Select a saved story to edit its credibility context."));
}
function trustNode(tag,value,cls){const el=document.createElement(tag);if(value!=null)el.textContent=String(value);if(cls)el.className=cls;return el;}
function trustButton(label,handler){const button=trustNode("button",label,"btn secondary");button.type="button";button.addEventListener("click",handler);return button;}
function resetEvidenceForm(){for(const id of ["trustEvidenceId","trustEvidencePublisher","trustEvidenceUrl","trustEvidenceOrigin","trustEvidenceRationale","trustEvidenceNotes"])$(id).value="";$("trustEvidenceIndependent").checked=false;$("trustEvidenceType").value="independent_report";}
function resetClaimForm(){for(const id of ["trustClaimId","trustClaimText","trustClaimNote"])$(id).value="";$("trustClaimStatus").value="unconfirmed";renderTrustEvidenceChoices([]);}
function renderTrustEvidenceChoices(selected){
 const host=$("trustClaimEvidence");host.replaceChildren();
 for(const row of trustEvidence){const label=trustNode("label",null,"trust-evidence-choice"),input=trustNode("input");input.type="checkbox";input.value=row.id;input.checked=selected.includes(row.id);label.append(input,trustNode("span",row.publisher+" · "+row.evidence_type));host.append(label);}
 if(!trustEvidence.length)host.append(trustNode("small",t("أضف الأدلة أولًا.","Add evidence first.")));
}
async function loadTrustEditor(id){
 const version=++trustLoadVersion;activeTrustId=id;
 $("trustEditorControls").classList.add("hidden");
 if(!trustSchemaAvailable){trustNotice(t("يلزم تطبيق مهاجرة المصداقية قبل استخدام هذه الأدوات.","The editorial trust migration must be applied before these tools can be used."));return;}
 trustNotice(t("جارٍ تحميل الأدلة والادعاءات...","Loading evidence and claims..."));
 try{
  const results=await Promise.all([
   db.from("article_evidence").select("id,publisher,evidence_url,evidence_type,independent_source,notes,provenance_group,independence_note,independence_reviewed_at").eq("article_id",id).order("created_at",{ascending:true}).limit(100),
   db.from("article_claims").select("id,claim_text,status,supporting_evidence_ids,review_note,reviewed_at").eq("article_id",id).order("created_at",{ascending:true}).limit(100),
   db.from("article_change_log").select("changed_at,change_type,entity_type,public_note").eq("article_id",id).eq("public_safe",true).order("changed_at",{ascending:false}).limit(100)
  ]);
  if(version!==trustLoadVersion)return;
  for(const result of results)if(result.error)throw result.error;
  trustEvidence=results[0].data||[];trustClaims=results[1].data||[];
  const story=activeArticle?.id===id?activeArticle:null;if(!story)throw new Error("الخبر غير موجود في محرّر المقال.");
  for(const [input,column] of Object.entries({trustAgencyName:"agency_name",trustAgencyAccount:"agency_account_url",trustAgencyStatement:"agency_statement_url",trustAgencyNarrative:"agency_narrative",trustSourceExcerpt:"trust_source_excerpt",trustReviewNote:"trust_review_note",trustTranslationNote:"human_translation_note"}))$(input).value=story[column]||"";
  $("trustStoryStatus").value=story.editorial_trust_status||"unconfirmed";$("trustTranslationStatus").value=story.human_translation_status||"pending";
  $("trustCanonicalLink").href="/news/"+encodeURIComponent(id);
  const evidenceHost=$("trustEvidenceList");evidenceHost.replaceChildren();
  for(const row of trustEvidence){const box=trustNode("div",null,"trust-entry");box.append(trustNode("strong",row.publisher),trustNode("small",row.evidence_url));
   box.append(trustButton(t("تعديل الدليل","Edit evidence"),()=>{for(const [input,column] of Object.entries({trustEvidenceId:"id",trustEvidencePublisher:"publisher",trustEvidenceUrl:"evidence_url",trustEvidenceType:"evidence_type",trustEvidenceOrigin:"provenance_group",trustEvidenceRationale:"independence_note",trustEvidenceNotes:"notes"}))$(input).value=row[column]||"";$("trustEvidenceIndependent").checked=!!row.independent_source;}));
   box.append(trustButton(t("حذف الدليل","Remove evidence"),()=>trustOperation("trustSaveEvidence",async articleId=>{if(!confirm(t("سيبقى تغيير حذف الدليل في سجل التدقيق. هل تريد المتابعة؟","The evidence removal remains in the audit history. Continue?")))return false;const result=await db.from("article_evidence").delete().eq("id",row.id).eq("article_id",articleId);if(result.error)throw result.error;})));evidenceHost.append(box);
  }
  const claimsHost=$("trustClaimsList");claimsHost.replaceChildren();
  for(const row of trustClaims){const box=trustNode("div",null,"trust-entry");box.append(trustNode("strong",row.claim_text),trustNode("small",trustStatusLabel(row.status)));
   box.append(trustButton(t("تعديل الادعاء","Edit claim"),()=>{$("trustClaimId").value=row.id;$("trustClaimText").value=row.claim_text;$("trustClaimStatus").value=row.status;$("trustClaimNote").value=row.review_note||"";renderTrustEvidenceChoices(row.supporting_evidence_ids||[]);}));
   box.append(trustButton(t("حذف الادعاء","Remove claim"),()=>trustOperation("trustSaveClaim",async articleId=>{if(!confirm(t("سيبقى حذف الادعاء في سجل التدقيق. هل تريد المتابعة؟","The claim removal remains in the audit history. Continue?")))return false;const result=await db.from("article_claims").delete().eq("id",row.id).eq("article_id",articleId);if(result.error)throw result.error;})));claimsHost.append(box);
  }
  const history=$("trustEditorHistory");history.replaceChildren();
  for(const row of results[2].data||[]){const box=trustNode("div",null,"trust-entry");box.append(trustNode("small",new Date(row.changed_at).toLocaleString(currentLang()==="ar"?"ar-SA":"en-GB")+" · "+row.change_type+" · "+row.entity_type),trustNode("p",row.public_note||""));history.append(box);}
  resetEvidenceForm();resetClaimForm();$("trustEditorControls").classList.remove("hidden");
  trustNotice(trustStatusLabel(story.editorial_trust_status)+" · "+(story.trust_needs_review?t("يلزم تقييم جديد","Needs a new assessment"):t("سُجل قرار بشري","Human decision recorded"))+" · "+t("آخر مراجعة: ","Last review: ")+(story.trust_reviewed_at?new Date(story.trust_reviewed_at).toLocaleString():t("لم تُسجّل","Not recorded")));
 }catch(error){if(version===trustLoadVersion)trustNotice(t("تعذر تحميل طبقة المصداقية: ","Could not load trust context: ")+error.message);}
}
let trustWriting=false;
async function trustOperation(buttonId,operation){
 const id=activeTrustId,button=$(buttonId);
 if(trustWriting||!id||!trustSchemaAvailable||$("articleId").value!==id){trustNotice(t("اختر خبرًا محفوظًا وانتظر اكتمال أي عملية قائمة.","Select a saved story and wait for any active operation."));return;}
 trustWriting=true;button.disabled=true;
 try{
  const completed=await operation(id);if(completed===false)return;
  await loadArticles();
  if(activeTrustId===id&&$("articleId").value===id)await loadTrustEditor(id);
  message(t("سُجل التغيير. حفظ الأدلة والادعاءات لا يؤكد الخبر آليًا؛ سجل قرارك البشري بعد المراجعة.","Change recorded. Evidence and claim edits do not automatically confirm the story; record your human decision after review."));
 }catch(error){trustNotice(t("رفض الخادم العملية أو لم يكتمل الاتصال: ","The server rejected the operation or the connection failed: ")+error.message);}
 finally{trustWriting=false;button.disabled=false;}
}
function trustHttpUrl(value){if(!value)return null;try{const u=new URL(value);if(!["http:","https:"].includes(u.protocol)||u.username||u.password||/[\s\u0000-\u001f\u007f]/.test(value))throw new Error();return u.href;}catch(_){throw new Error(t("استخدم رابط HTTP(S) حقيقيًا دون بيانات دخول.","Use a real HTTP(S) URL without credentials."));}}
$("trustSaveContext").addEventListener("click",()=>trustOperation("trustSaveContext",async id=>{
 const payload={agency_name:$("trustAgencyName").value.trim()||null,agency_account_url:trustHttpUrl($("trustAgencyAccount").value.trim()),agency_statement_url:trustHttpUrl($("trustAgencyStatement").value.trim()),agency_narrative:$("trustAgencyNarrative").value.trim()||null,trust_source_excerpt:$("trustSourceExcerpt").value.trim()||null};
 const result=await db.from("articles").update(payload).eq("id",id);if(result.error)throw result.error;
}));
$("trustSaveEvidence").addEventListener("click",()=>trustOperation("trustSaveEvidence",async id=>{
 const payload={article_id:id,publisher:$("trustEvidencePublisher").value.trim(),evidence_url:trustHttpUrl($("trustEvidenceUrl").value.trim()),evidence_type:$("trustEvidenceType").value,independent_source:$("trustEvidenceIndependent").checked,provenance_group:$("trustEvidenceOrigin").value.trim()||null,independence_note:$("trustEvidenceRationale").value.trim()||null,notes:$("trustEvidenceNotes").value.trim()||null};
 if(payload.publisher.length<2||!payload.evidence_url)throw new Error(t("اسم الناشر ورابط الدليل مطلوبان.","Publisher and evidence URL are required."));
 if(payload.independent_source&&(!payload.provenance_group||!payload.independence_note))throw new Error(t("سجل أصل التقرير وسبب استقلاليته قبل تحديده كمصدر مستقل.","Record reporting origin and independence rationale first."));
 const eid=$("trustEvidenceId").value;
 const result=eid?await db.from("article_evidence").update(payload).eq("id",eid).eq("article_id",id):await db.from("article_evidence").insert(payload);if(result.error)throw result.error;
}));
$("trustSaveClaim").addEventListener("click",()=>trustOperation("trustSaveClaim",async id=>{
 const payload={article_id:id,claim_text:$("trustClaimText").value.trim(),status:$("trustClaimStatus").value,supporting_evidence_ids:Array.from($("trustClaimEvidence").querySelectorAll("input:checked"),input=>input.value),review_note:$("trustClaimNote").value.trim()||null};
 if(payload.claim_text.length<3)throw new Error(t("اكتب ادعاءً محددًا.","Enter a specific claim."));
 const cid=$("trustClaimId").value;
 const result=cid?await db.from("article_claims").update(payload).eq("id",cid).eq("article_id",id):await db.from("article_claims").insert(payload);if(result.error)throw result.error;
}));
$("trustReviewStory").addEventListener("click",()=>trustOperation("trustReviewStory",async id=>{
 const note=$("trustReviewNote").value.trim(),translationStatus=$("trustTranslationStatus").value,translationNote=$("trustTranslationNote").value.trim();
 if(!note||(translationStatus==="reviewed"&&!translationNote))throw new Error(t("سجل ملاحظة القرار ومراجعة الترجمة عند اعتمادها.","Record the decision note and translation review note when approving it."));
 if(!confirm(t("هذا إقرار بأنك راجعت الأدلة ومضمون النص بشريًا، وليس اعتمادًا على ثقة الذكاء الاصطناعي. متابعة؟","This records your human review of the evidence and text, not AI confidence. Continue?")))return false;
 const result=await db.rpc("review_article_trust",{p_article_id:id,p_status:$("trustStoryStatus").value,p_note:note,p_translation_status:translationStatus,p_translation_note:translationNote||null});if(result.error)throw result.error;
}));
$("trustResetEvidence").addEventListener("click",resetEvidenceForm);
$("trustResetClaim").addEventListener("click",resetClaimForm);
