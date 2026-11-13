const SUPABASE_URL="https://vmaxbnogmmfyrcucapnq.supabase.co";
const SUPABASE_KEY="sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
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

function resetForm(){$("articleForm").reset();$("articleId").value="";$("source").value="هيئة التحرير";$("editorialStatus").value="published";$("verification").value="unconfirmed";$("isBreaking").checked=false;$("saveButton").textContent=t("حفظ الخبر","Save story");}
async function showSession(){await ensureDb();const {data:{session}}=await db.auth.getSession();const role=session?.user?.app_metadata?.role;const allowed=["editor","admin"].includes(role);$("loginPanel").classList.toggle("hidden",!!session);$("accessPanel").classList.toggle("hidden",!session||allowed);$("editorPanel").classList.toggle("hidden",!allowed);if(session&&allowed){$("userLabel").textContent=(session.user.email||"محرر مسجل")+" · "+role;await loadArticles();}else if(session){message("تم تسجيل الدخول، لكن الحساب لا يحمل دوراً تحريرياً موثوقاً.");}}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();message("جارٍ التحقق...");try{await ensureDb();const {error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error){message("تعذر تسجيل الدخول: "+error.message);return;}message("تم تسجيل الدخول.");await showSession();}catch(error){message("حدث خطأ أثناء الاتصال بخدمة الدخول: "+(error?.message||String(error)));}});
$("logoutButton").addEventListener("click",async()=>{try{await ensureDb();await db.auth.signOut();message("تم تسجيل الخروج.");await showSession();}catch(error){message("تعذر تسجيل الخروج: "+error.message);}});
$("resetButton").addEventListener("click",resetForm);$("refreshButton").addEventListener("click",loadArticles);$("classifyButton").addEventListener("click",classifyPending);$("articleSearch").addEventListener("input",renderArticleList);$("statusFilter").addEventListener("change",renderArticleList);
async function loadArticles(){const {data,error}=await db.from("articles").select("id,title,summary,category,country,source_name,source_url,published_at,url,image_url,editorial_status,is_breaking,verification,verification_independent_count,verification_field_count,verification_official_count,ai_classification_status,ai_risk_level,ai_confidence,article_translations(*)").order("published_at",{ascending:false}).limit(200);if(error){$("articleList").textContent=t("تعذر تحميل الأخبار: ","Could not load stories: ")+error.message;return;}cachedArticles=data||[];renderArticleList();}
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
function editArticle(a){$("articleId").value=a.id;$("title").value=a.title||"";$("summary").value=a.summary||"";$("category").value=a.category||"world";$("country").value=a.country||"";$("source").value=a.source_name||"هيئة التحرير";$("sourceUrl").value=a.url||"";$("imageUrl").value=a.image_url||"";$("editorialStatus").value=a.editorial_status||"published";$("isBreaking").checked=!!a.is_breaking;$("saveButton").textContent="حفظ التعديلات";window.scrollTo({top:0,behavior:"smooth"});}
$("articleForm").addEventListener("submit",async e=>{e.preventDefault();const id=$("articleId").value;const payload={title:$("title").value.trim(),summary:$("summary").value.trim(),category:$("category").value,country:$("country").value.trim()||"دولي",source_name:$("source").value.trim(),url:$("sourceUrl").value.trim()||("editorial-"+Date.now()),image_url:$("imageUrl").value.trim()||null,editorial_status:$("editorialStatus").value,is_breaking:$("isBreaking").checked};const button=$("saveButton");button.disabled=true;const result=id?await db.from("articles").update(payload).eq("id",id):await db.from("articles").insert({...payload,lang:currentLang(),published_at:new Date().toISOString()});button.disabled=false;if(result.error){message("فشل الحفظ: "+result.error.message);return;}message(id?"تم تحديث الخبر.":"تم نشر الخبر.");resetForm();await loadArticles();});
async function deleteArticle(id){if(!confirm("هل تريد حذف هذا الخبر نهائياً؟"))return;const {error}=await db.from("articles").delete().eq("id",id);if(error){message("فشل الحذف: "+error.message);return;}message("تم حذف الخبر.");await loadArticles();}
document.addEventListener("wrldline:language",()=>{renderArticleList();});
showSession().catch(error=>message("تعذر تهيئة لوحة التحرير: "+(error?.message||String(error))));
