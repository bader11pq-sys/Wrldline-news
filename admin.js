const SUPABASE_URL="https://vmaxbnogmmfyrcucapnq.supabase.co";
const SUPABASE_KEY="sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
const MEDIA_BUCKET="news-media";
let db=null;
const $=id=>document.getElementById(id);
const currentLang=()=>window.wrldlineLang||localStorage.getItem("wrldline:language")||"ar";
const t=(ar,en)=>currentLang()==="ar"?ar:en;
const verificationText=value=>({unconfirmed:t("غير مؤكد","Unverified"),single:t("مصدر واحد","Single source"),multi:t("أكدته مصادر مستقلة","Multiple independent sources"),confirmed:t("مؤكد من مصادر مستقلة","Corroborated by independent sources"),official_confirmed:t("تأكيد رسمي + مصادر مستقلة","Official + independent confirmation"),field_confirmed:t("تأكيد ميداني + مصادر مستقلة","Field + independent confirmation"),disputed:t("متنازع عليه","Disputed"),corrected:t("صُحّح","Corrected"),retracted:t("مسحوب","Retracted")}[value]||t("غير مؤكد","Unverified"));
let cachedArticles=[];
const countryLabel=value=>{const map={"السعودية":"Saudi Arabia","المملكة العربية السعودية":"Saudi Arabia","مصر":"Egypt","الصين":"China","دولي":"International","الإمارات":"United Arab Emirates","قطر":"Qatar","الكويت":"Kuwait","البحرين":"Bahrain","عمان":"Oman","اليمن":"Yemen","الأردن":"Jordan","لبنان":"Lebanon","فلسطين":"Palestine","سوريا":"Syria","العراق":"Iraq","المغرب":"Morocco","الجزائر":"Algeria","تونس":"Tunisia","ليبيا":"Libya","السودان":"Sudan"};return currentLang()==="en"?(map[value]||value):value;};
const editorialLabel=value=>{const map={published:t("منشور","Published"),draft:t("مسودة","Draft"),review:t("قيد المراجعة","In review"),rejected:t("مرفوض","Rejected")};return map[value]||value;};
function message(text){$("status").textContent=text;}
async function ensureDb(){
 if(db)return db;
 if(!window.supabase?.createClient){
  const sources=["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js","https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js"];
  for(const src of sources){
   try{await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error("Could not load "+src));document.head.appendChild(script);});if(window.supabase?.createClient)break;}catch(error){console.warn("Supabase SDK fallback failed",String(error));}
  }
 }
 if(!window.supabase?.createClient)throw new Error("تعذر تحميل مكتبة الاتصال. تحقق من اتصال الإنترنت أو مانع المحتوى ثم أعد المحاولة.");
 db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
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
 $("articleForm").reset();$("articleId").value="";$("contentType").value="news";$("source").value="هيئة التحرير";$("source").readOnly=false;syncContentType();$("editorialStatus").value="published";$("verification").value="unconfirmed";$("isBreaking").checked=false;$("mediaType").value="image";$("mediaFile").value="";setMediaPreview("");$("saveButton").textContent=t("نشر الخبر","Publish story");
}
async function showSession(){await ensureDb();const {data:{session}}=await db.auth.getSession();const role=session?.user?.app_metadata?.role;const allowed=["editor","admin"].includes(role);$("loginPanel").classList.toggle("hidden",!!session);$("accessPanel").classList.toggle("hidden",!session||allowed);$("editorPanel").classList.toggle("hidden",!allowed);if(session&&allowed){$("userLabel").textContent=(session.user.email||"محرر مسجل")+" · "+role;await loadArticles();}else if(session){message("تم تسجيل الدخول، لكن الحساب لا يحمل دوراً تحريرياً موثوقاً.");}}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();message("جارٍ التحقق...");try{await ensureDb();const {error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error){message("تعذر تسجيل الدخول: "+error.message);return;}message("تم تسجيل الدخول.");await showSession();}catch(error){message("حدث خطأ أثناء الاتصال بخدمة الدخول: "+(error?.message||String(error)));}});
$("logoutButton").addEventListener("click",async()=>{try{await ensureDb();await db.auth.signOut();message("تم تسجيل الخروج.");await showSession();}catch(error){message("تعذر تسجيل الخروج: "+error.message);}});
async function runProviderHealthcheck(){
 const button=$("runProviderHealthButton"),summary=$("providerHealthSummary"),host=$("providerHealthResults");
 button.disabled=true;button.textContent="جارٍ فحص المزودات...";summary.textContent="يتم الآن اختبار المصادقة والاتصال وطلب ترجمة/توليد حقيقي لكل مزود مُعدّ.";host.replaceChildren();
 try{
  const {data,error}=await db.functions.invoke("ai-provider-healthcheck",{body:{}});
  if(error)throw error;
  const results=Array.isArray(data?.results)?data.results:[];
  const labels={gemini:"Google Gemini",groq:"Groq",nvidia:"NVIDIA",openrouter:"OpenRouter",gonka:"Gonka",deepl:"DeepL"};
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
$("resetButton").addEventListener("click",resetForm);$("refreshButton").addEventListener("click",loadArticles);$("classifyButton").addEventListener("click",classifyPending);$("articleSearch").addEventListener("input",renderArticleList);$("statusFilter").addEventListener("change",renderArticleList);
async function loadArticles(){const {data,error}=await db.from("articles").select("id,title,summary,category,country,source_name,source_url,published_at,url,image_url,media_type,editorial_status,is_breaking,verification,verification_independent_count,verification_field_count,verification_official_count,ai_classification_status,ai_risk_level,ai_confidence,article_translations(*)").order("published_at",{ascending:false}).limit(200);if(error){$("articleList").textContent=t("تعذر تحميل الأخبار: ","Could not load stories: ")+error.message;return;}cachedArticles=data||[];renderArticleList();}
async function classifyPending(){
 const pending=cachedArticles.filter(a=>a.editorial_status==="published"&&a.ai_classification_status!=="classified"&&!/t\.me|telegram\.me|telegram/i.test([a.url,a.source_url,a.source_name].join(" "))).slice(0,10);
 if(!pending.length){message(t("لا توجد أخبار منشورة تنتظر التصنيف حالياً.","No published stories are waiting for classification."));return;}
 const button=$("classifyButton");button.disabled=true;button.textContent=t("جارٍ تحليل الأخبار...","Classifying stories...");
 const {data,error}=await db.functions.invoke("classify-news",{body:{article_ids:pending.map(a=>a.id)}});
 button.disabled=false;button.textContent=t("✦ تحليل 10 أخبار بالذكاء الاصطناعي","✦ AI-classify 10 stories");
 if(error){message(t("تعذر تشغيل الذكاء الاصطناعي: ","Could not run AI classification: ")+error.message+t(" — تأكد من نشر الدالة وإضافة OPENAI_API_KEY."," — Make sure the function is deployed and OPENAI_API_KEY is configured."));return;}
 const ok=(data?.results||[]).filter(x=>x.status==="classified").length;
 const review=(data?.results||[]).filter(x=>x.status==="needs_review").length;
 const failed=(data?.results||[]).filter(x=>x.status==="failed").length;
 message(t("اكتمل التحليل: ","Classification complete: ")+ok+t(" مصنّف · "," classified · ")+review+t(" يحتاج مراجعة · "," need review · ")+failed+t(" تعذّر تحليله."," failed."));
 await loadArticles();
}
function renderArticleList(){const q=$("articleSearch").value.trim().toLocaleLowerCase(),status=$("statusFilter").value;const rows=cachedArticles.filter(a=>(status==="all"||a.editorial_status===status)&&(!q||[a.title,a.summary,a.country,a.source_name].join(" ").toLocaleLowerCase().includes(q)));const list=$("articleList");list.replaceChildren();const count=document.createElement("div");count.className="muted";count.textContent=currentLang()==="ar"?rows.length+" خبر · من أصل "+cachedArticles.length:rows.length+" stories · of "+cachedArticles.length;list.append(count);if(!rows.length){const empty=document.createElement("p");empty.textContent="لا توجد أخبار مطابقة.";list.append(empty);return;}for(const a of rows){const row=document.createElement("div");row.className="item";const title=document.createElement("strong");const translation=(a.article_translations||[]).find(x=>x.lang===currentLang());title.textContent=(a.is_breaking?t("🔴 عاجل · ","🔴 Breaking · "):"")+ (translation?.title||a.title||t("بلا عنوان","Untitled"));const meta=document.createElement("small");meta.textContent=[a.source_name,countryLabel(a.country),editorialLabel(a.editorial_status||"published"),t("التحقق: ","Verification: ")+verificationText(a.verification), "AI: "+(a.ai_classification_status||"pending"),t("الخطر: ","Risk: ")+(a.ai_risk_level||"unknown"),a.published_at?new Date(a.published_at).toLocaleString(currentLang()==="ar"?"ar-SA":"en-US"):""].filter(Boolean).join(" · ");const actions=document.createElement("div");actions.className="actions";const add=(label,cls,fn)=>{const b=document.createElement("button");b.className="btn "+cls;b.textContent=label;b.addEventListener("click",fn);actions.append(b);};add(t("تعديل","Edit"),"secondary",()=>editArticle(a));add(t("عرض الخبر","View story"),"secondary",()=>window.open("index.html?article="+encodeURIComponent(a.id),"_blank","noopener"));add("نشر","",()=>setArticleStatus(a.id,"published"));add("مراجعة","secondary",()=>setArticleStatus(a.id,"review"));add("مسودة","secondary",()=>setArticleStatus(a.id,"draft"));add("حذف","danger",()=>deleteArticle(a.id));row.append(title,meta,actions);list.append(row);}}
async function setArticleStatus(id,status){const {error}=await db.from("articles").update({editorial_status:status}).eq("id",id);if(error){message("تعذر تغيير حالة الخبر: "+error.message);return;}message(t("تم تحديث حالة الخبر إلى ","Story status updated to ")+editorialLabel(status)+".");await loadArticles();}
function editArticle(a){
 $("articleId").value=a.id;$("title").value=a.title||"";$("summary").value=a.summary||"";$("category").value=a.category||"world";$("country").value=a.country||"";$("contentType").value=a.source_name==="WRLDLINE NEWS"?"editorial":"news";$("source").value=a.source_name||"هيئة التحرير";$("source").readOnly=$("contentType").value==="editorial";syncContentType();$("sourceUrl").value=a.url||"";$("imageUrl").value=a.image_url||"";$("mediaType").value=a.media_type||"image";$("mediaFile").value="";setMediaPreview(a.image_url||"",a.media_type||"image");$("editorialStatus").value=a.editorial_status||"published";$("isBreaking").checked=!!a.is_breaking;$("saveButton").textContent="حفظ التعديلات";window.scrollTo({top:0,behavior:"smooth"});
}
$("articleForm").addEventListener("submit",async e=>{
 e.preventDefault();const id=$("articleId").value,button=$("saveButton");button.disabled=true;button.textContent=t("جارٍ رفع الوسائط والحفظ...","Uploading media and saving...");
 let uploaded=null;
 try{
  uploaded=await uploadSelectedMedia();
  const imageUrl=uploaded?uploaded.url:($("imageUrl").value.trim()||null);
  const payload={title:$("title").value.trim(),summary:$("summary").value.trim(),category:$("category").value,country:$("country").value.trim()||"دولي",source_name:$("contentType").value==="editorial"?"WRLDLINE NEWS":$("source").value.trim(),url:$("sourceUrl").value.trim()||("editorial-"+Date.now()),image_url:imageUrl,media_type:uploaded?uploaded.type:(imageUrl?($("mediaType").value||"image"):null),editorial_status:$("editorialStatus").value,is_breaking:$("isBreaking").checked};
  const result=id?await db.from("articles").update(payload).eq("id",id):await db.from("articles").insert({...payload,lang:currentLang(),published_at:new Date().toISOString()});
  if(result.error){if(uploaded)await db.storage.from(MEDIA_BUCKET).remove([uploaded.path]);throw result.error;}
  message(id?"تم تحديث الخبر ووسائطه.":"تم نشر الخبر ووسائطه.");resetForm();await loadArticles();
 }catch(error){message("فشل الحفظ: "+(error.message||String(error)));}
 finally{button.disabled=false;button.textContent=$("articleId").value?t("حفظ التعديلات","Save changes"):t("نشر الخبر","Publish story");}
});
async function deleteArticle(id){if(!confirm("هل تريد حذف هذا الخبر نهائياً؟"))return;const {error}=await db.from("articles").delete().eq("id",id);if(error){message("فشل الحذف: "+error.message);return;}message("تم حذف الخبر.");await loadArticles();}
document.addEventListener("wrldline:language",()=>{renderArticleList();});
showSession().catch(error=>message("تعذر تهيئة لوحة التحرير: "+(error?.message||String(error))));
