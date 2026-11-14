/* WRLDLINE privacy-first event layer. No PII, no analytics before consent. */
(function () {
  "use strict";
  const CONFIG = window.WRLDLINE_ANALYTICS_CONFIG || {};
  const CONSENT_KEY = "wrldline:analytics-consent";
  const SESSION_KEY = "wrldline:analytics-session";
  const ALLOWED = new Set(["page_view","view_article","outbound_source_click","search","market_view","newsletter_signup","sponsor_contact","plus_interest"]);
  const SAFE_KEYS = new Set(["article_id","content_type","category","source_domain","has_source_link","results_count","has_query","plan","page_path","device_type","locale","event_id","session_id"]);
  const queue = [];
  let consent = readConsent();
  let initialized = false;
  let pageViewSent = false;
  let bannerShown = false;

  function readConsent(){try{return localStorage.getItem(CONSENT_KEY)==="granted"?"granted":(localStorage.getItem(CONSENT_KEY)==="denied"?"denied":null);}catch{return null;}}
  function writeConsent(value){consent=value;try{localStorage.setItem(CONSENT_KEY,value);}catch{}}
  function sessionId(){try{let id=sessionStorage.getItem(SESSION_KEY);if(!id){id=randomId();sessionStorage.setItem(SESSION_KEY,id);}return id;}catch{return "";}}
  function randomId(){try{return crypto.randomUUID();}catch{return "s-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);}}
  function deviceType(){const ua=navigator.userAgent||"";if(/iPad|Tablet|Android(?!.*Mobile)/i.test(ua))return "tablet";if(/Mobi|iPhone|Android/i.test(ua))return "mobile";return "desktop";}
  function pagePath(){return location.pathname.replace(/\/index\.html$/,"/")||"/";}
  function sanitize(params={}){
    const out={};
    for(const [key,value] of Object.entries(params||{})){
      if(!SAFE_KEYS.has(key)||value===undefined||value===null)continue;
      if(typeof value==="boolean"||typeof value==="number"){out[key]=value;continue;}
      const text=String(value).replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,"[redacted]").replace(/\+?\d[\d\s()-]{6,}\d/g,"[redacted]").slice(0,120);
      if(text)out[key]=text;
    }
    out.page_path=pagePath();
    out.device_type=deviceType();
    out.locale=document.documentElement.lang||"ar";
    out.session_id=sessionId();
    return out;
  }
  function initGa4(){
    if(!CONFIG.ga4MeasurementId||initialized)return;
    initialized=true;
    window.dataLayer=window.dataLayer||[];
    window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
    window.gtag("js",new Date());
    window.gtag("config",CONFIG.ga4MeasurementId,{send_page_view:false,anonymize_ip:true});
    if(!document.querySelector('script[data-wrldline-ga4]')){
      const script=document.createElement("script");script.async=true;script.dataset.wrldlineGa4="true";script.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(CONFIG.ga4MeasurementId);document.head.appendChild(script);
    }
  }
  function send(name,params){
    if(consent!=="granted"||!ALLOWED.has(name))return;
    initGa4();
    const payload={event:name,...sanitize(params),event_id:randomId()};
    if(window.gtag)window.gtag("event",name,payload);
    if(CONFIG.endpoint){
      try{
        const body=JSON.stringify(payload);
        if(navigator.sendBeacon&&navigator.sendBeacon(CONFIG.endpoint,new Blob([body],{type:"application/json"})))return;
        fetch(CONFIG.endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body,keepalive:true}).catch(()=>{});
      }catch(error){console.warn("WRLDLINE analytics transport:",error);}
    }
  }
  function flush(){while(queue.length){const item=queue.shift();send(item.name,item.params||{});}}
  function track(name,params={}){
    if(!ALLOWED.has(name))return;
    if(consent==="granted"){send(name,params);return;}
    if(consent===null&&queue.length<20)queue.push({name,params});
  }
  function pageView(){
    if(pageViewSent)return;pageViewSent=true;
    const key="wrldline:analytics-pageview:"+pagePath();
    try{const last=Number(sessionStorage.getItem(key)||0);if(Date.now()-last<5000)return;sessionStorage.setItem(key,String(Date.now()));}catch{}
    track("page_view",{});
  }
  function banner(){
    if(consent!==null||bannerShown)return;
    bannerShown=true;
    const style=document.createElement("style");
    style.textContent='.wrldline-consent{position:fixed;inset-inline:14px;bottom:14px;z-index:300;width:calc(100% - 28px);max-width:620px;margin:auto;box-sizing:border-box;overflow-wrap:anywhere;background:#101b2d;color:#f3f6fb;border:1px solid #3b506a;border-radius:14px;padding:14px 16px;box-shadow:0 16px 50px #0006;font:13px/1.8 "IBM Plex Sans Arabic",sans-serif}.wrldline-consent p{margin:0 0 9px}.wrldline-consent a{color:#f0c36d}.wrldline-consent .actions{display:flex;gap:8px;flex-wrap:wrap}.wrldline-consent button{border:1px solid #3b506a;border-radius:8px;padding:7px 12px;background:#172941;color:#fff;font:700 12px inherit;cursor:pointer}.wrldline-consent button.primary{background:#e0b96f;color:#172234;border-color:#e0b96f}@media(max-width:520px){.wrldline-consent{inset-inline:8px;bottom:8px;padding:12px;width:calc(100vw - 16px);max-width:calc(100vw - 16px)}}@media(max-width:340px){.wrldline-consent{font-size:12px;line-height:1.65}.wrldline-consent .actions{gap:6px}.wrldline-consent button{padding:7px 9px;font-size:11px}}';
    document.head.appendChild(style);
    const el=document.createElement("aside");el.className="wrldline-consent";el.setAttribute("role","dialog");el.setAttribute("aria-label","إعداد القياس والخصوصية");
    el.innerHTML='<p><strong>الخصوصية أولًا.</strong> نستخدم قياسًا مجهولًا لمعرفة الصفحات والأحداث الأكثر استخدامًا. لا نرسل البريد أو الاسم أو نص البحث. يمكنك الرفض والمتابعة دون قياس.</p><div class="actions"><button type="button" class="primary" data-consent="granted">قبول القياس</button><button type="button" data-consent="denied">رفض</button><a href="privacy.html">سياسة الخصوصية</a></div>';
    el.addEventListener("click",event=>{const button=event.target.closest("[data-consent]");if(!button)return;writeConsent(button.dataset.consent);el.remove();if(consent==="granted"){initGa4();flush();pageView();}else{queue.length=0;}});
    document.body.appendChild(el);
  }
  window.WRLDLINE_ANALYTICS={track,consent:()=>consent,setConsent:value=>{if(value!=="granted"&&value!=="denied")return;writeConsent(value);if(value==="granted"){initGa4();flush();pageView();}},config:CONFIG};
  document.addEventListener("DOMContentLoaded",()=>{banner();if(consent==="granted"){initGa4();flush();pageView();}});
  if(document.readyState!=="loading"){banner();if(consent==="granted"){initGa4();flush();pageView();}}
})();
