import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const TELNYX = Deno.env.get("TELNYX_API_KEY") || "";
const VERIFY_PROFILE = Deno.env.get("TELNYX_VERIFY_PROFILE_ID") || "";
const MESSAGING_PROFILE = Deno.env.get("TELNYX_MESSAGING_PROFILE_ID") || "";
const FROM_NUMBER = Deno.env.get("TELNYX_FROM_NUMBER") || "";
const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") || "https://al-ghaib.us.ci", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Vary": "Origin" };
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: cors });
const e164 = (v: unknown) => typeof v === "string" && /^\+[1-9]\d{7,14}$/.test(v);
async function telnyx(path: string, body: unknown) {
  if (!TELNYX) throw new Error("TELNYX_API_KEY is not configured in Supabase Edge Function secrets");
  const r = await fetch("https://api.telnyx.com/v2/" + path, { method:"POST", headers:{Authorization:"Bearer "+TELNYX,"Content-Type":"application/json","Accept":"application/json"}, body:JSON.stringify(body), signal:AbortSignal.timeout(15000) });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error("Telnyx HTTP "+r.status+": "+JSON.stringify(data.errors || data).slice(0,300));
  return data.data || data;
}
async function authenticatedUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i,"");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
}
async function sendBreaking() {
  if (!MESSAGING_PROFILE || !FROM_NUMBER) throw new Error("TELNYX_MESSAGING_PROFILE_ID and TELNYX_FROM_NUMBER are required for SMS alerts");
  const { data: articles, error } = await db.from("articles").select("id,title,summary,url,source_name,published_at,lang").eq("is_breaking",true).is("sms_notification_sent_at",null).gte("published_at",new Date(Date.now()-30*60*1000).toISOString()).order("published_at",{ascending:false}).limit(20);
  if (error) throw error;
  if (!articles?.length) return {sent:0,articles:0};
  const { data: users, error: userError } = await db.from("user_sms_preferences").select("user_id,locale").eq("breaking_enabled",true);
  if (userError) throw userError;
  let sent=0, failed=0;
  for (const article of articles) {
    const { data: claimed, error: claimError } = await db.from("articles").update({sms_notification_sent_at:new Date().toISOString()}).eq("id",article.id).is("sms_notification_sent_at",null).select("id");
    if (claimError || !claimed?.length) continue;
    const title = String(article.title || "").slice(0,220);
    const link = String(article.url || "https://al-ghaib.us.ci").slice(0,300);
    for (const user of users || []) {
      const { data: phone } = await db.from("user_phone_verifications").select("phone_e164").eq("user_id",user.user_id).maybeSingle();
      if (!phone?.phone_e164) continue;
      const text = user.locale === "en" ? "WRLDLINE BREAKING: "+title+" "+link : "وردلاين | عاجل: "+title+" "+link;
      try {
        await telnyx("messages",{to:phone.phone_e164,from:FROM_NUMBER,messaging_profile_id:MESSAGING_PROFILE,text});
        sent++;
      } catch (e) { failed++; console.error("SMS_DELIVERY_FAILED",String(e).slice(0,200)); }
    }
  }
  return {sent,failed,articles:articles.length,recipients:users?.length||0};
}
Deno.serve(async (req) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if (req.method!=="POST") return json({error:"POST required"},405);
  if (!SERVICE) return json({error:"Supabase service key missing"},500);
  let body: any = {};
  try { body = await req.json(); } catch { return json({error:"Invalid JSON"},400); }
  const action = body.action;
  try {
    if (action==="health") {
      return json({ok:true,telnyx_key_configured:!!TELNYX,verify_profile_configured:!!VERIFY_PROFILE,messaging_profile_configured:!!MESSAGING_PROFILE,from_number_configured:!!FROM_NUMBER});
    }
    if (action==="dispatch_breaking") {
      const key = (req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
      if (!key || key!==SERVICE) return json({error:"Unauthorized"},401);
      return json({ok:true,...await sendBreaking()});
    }
    const user = await authenticatedUser(req);
    if (!user) return json({error:"Unauthorized"},401);
    if (action==="start_otp") {
      if (!e164(body.phone)) return json({error:"استخدم رقم الهاتف بصيغة دولية مثل +9665XXXXXXXX"},400);
      if (!VERIFY_PROFILE) return json({error:"TELNYX_VERIFY_PROFILE_ID is not configured"},503);
      await telnyx("verifications/sms",{phone_number:body.phone,verify_profile_id:VERIFY_PROFILE});
      return json({ok:true,message:"تم إرسال رمز التحقق."});
    }
    if (action==="verify_otp") {
      if (!e164(body.phone) || !/^\d{4,10}$/.test(String(body.code||""))) return json({error:"رقم الهاتف أو رمز التحقق غير صالح"},400);
      if (!VERIFY_PROFILE) return json({error:"TELNYX_VERIFY_PROFILE_ID is not configured"},503);
      await telnyx("verifications/by_phone_number/"+encodeURIComponent(body.phone)+"/actions/verify",{code:String(body.code),verify_profile_id:VERIFY_PROFILE});
      const {error}=await db.from("user_phone_verifications").upsert({user_id:user.id,phone_e164:body.phone,verified_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"user_id"});
      if (error) throw error;
      return json({ok:true,message:"تم تأكيد رقم الهاتف بنجاح."});
    }
    if (action==="set_preferences") {
      const {data:verified}=await db.from("user_phone_verifications").select("phone_e164").eq("user_id",user.id).maybeSingle();
      if (!verified?.phone_e164) return json({error:"تحقق من رقم هاتفك أولاً."},400);
      const enabled=body.breaking_enabled===true;
      const {error}=await db.from("user_sms_preferences").upsert({user_id:user.id,breaking_enabled:enabled,locale:body.locale==="en"?"en":"ar",consent_at:enabled?new Date().toISOString():null,updated_at:new Date().toISOString()},{onConflict:"user_id"});
      if(error) throw error;
      return json({ok:true,breaking_enabled:enabled});
    }
    if (action==="remove_phone") {
      await db.from("user_sms_preferences").delete().eq("user_id",user.id);
      await db.from("user_phone_verifications").delete().eq("user_id",user.id);
      return json({ok:true});
    }
    return json({error:"Unknown action"},400);
  } catch(e: unknown) {
    const message=e instanceof Error ? e.message : String(e);
    console.error("TELNYX_GATEWAY_ERROR",message.slice(0,500));
    return json({error:message.slice(0,300)},502);
  }
});
