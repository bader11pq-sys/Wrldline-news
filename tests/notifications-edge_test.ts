import { createECDH } from "node:crypto";
import { articlePath, choices, hash, matchesPush, previousPeriod, ready, tokenFor, validPushEndpoint, validSubscription } from "../supabase/functions/_shared/notifications/core.ts";
import { adapters, DeliveryError } from "../supabase/functions/_shared/notifications/adapters.ts";
import { health, resolveEnv, type DB, type Env } from "../supabase/functions/_shared/notifications/server.ts";
import { createHandler as center } from "../supabase/functions/notification-center/index.ts";
import { createHandler as dispatch, deliver } from "../supabase/functions/notification-dispatch/index.ts";
function assert(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(a: unknown,b: unknown) { assert(JSON.stringify(a) === JSON.stringify(b),`Expected ${JSON.stringify(a)} = ${JSON.stringify(b)}`); }
const user = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000002", articleId = "30000000-0000-4000-8000-000000000003";
const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
const env: Env = { SITE_URL:"https://example.invalid", SUPABASE_URL:"https://mock.supabase.invalid", SUPABASE_SERVICE_ROLE_KEY:"fixture-private-key", NOTIFICATIONS_ENABLED:"true", VAPID_PUBLIC_KEY:ecdh.getPublicKey().toString("base64url"), VAPID_PRIVATE_KEY:ecdh.getPrivateKey().toString("base64url"), VAPID_SUBJECT:"https://example.invalid/contact.html", NOTIFICATION_TOKEN_SECRET:"fixture-token-secret-not-for-production-123", RESEND_API_KEY:"fixture-resend", NEWSLETTER_FROM:"WRLDLINE <news@example.invalid>" };
const subscription = {endpoint:"https://fcm.googleapis.com/mock/fixture",keys:{p256dh:"A".repeat(87),auth:"A".repeat(22)}};
// All database methods are in-memory fixtures. Tests run without --allow-net.
// deno-lint-ignore no-explicit-any
function mock(overrides: Record<string,any> = {}) {
  const calls: {table?:string;operation?:string;filters?:unknown;name?:string;args?:unknown}[]=[];
  const tables: Record<string,unknown[]>={notification_runtime:[{id:1,push_enabled:true,email_enabled:true,enabled_at:new Date().toISOString()}],push_subscriptions:[],newsletter_optins:[],...overrides.tables};
  const auth={getUser:(token:string)=>Promise.resolve({data:{user:token==="verified-fixture"?{id:user}:null},error:token==="verified-fixture"?null:{message:"invalid JWT"}})};
  // deno-lint-ignore no-explicit-any
  function from(table:string):any {
    let op="select",payload:unknown=null;const filters: [string,unknown][]=[];
    const query={select:()=>query,eq:(key:string,value:unknown)=>{filters.push([key,value]);return query;},in:()=>query,limit:()=>query,
      insert:(value:unknown)=>{op="insert";payload=value;return query;},upsert:(value:unknown)=>{op="upsert";payload=value;return query;},update:(value:unknown)=>{op="update";payload=value;return query;},delete:()=>{op="delete";return query;},
      maybeSingle:()=>execute(true),single:()=>execute(true),then:(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown)=>execute(false).then(resolve,reject)};
    async function execute(single:boolean){
      calls.push({table,operation:op,filters});
      if(overrides.errorTable===table)return {data:null,error:{message:"fixture error with no secrets"}};
      // deno-lint-ignore no-explicit-any
      const rows=(tables[table]||[]).filter((row:any)=>filters.every(([k,v])=>row[k]===v));
      if(op==="insert"||op==="upsert")tables[table]=[...(tables[table]||[]),payload];
      if(op==="delete")tables[table]=(tables[table]||[]).filter(row=>!rows.includes(row));
      return {data:single?rows[0]||null:rows,error:null};
    }
    return query;
  }
  async function rpc(name:string,args:Record<string,unknown>={}){
    calls.push({name,args});
    if(overrides.rpc)return overrides.rpc(name,args);
    if(name==="notification_runtime_config")return {data:overrides.vault||{},error:null};
    if(name==="notification_rate_limit")return {data:overrides.rateAllowed!==false,error:null};
    if(name==="verify_wrldline_cron_secret")return {data:args.p_secret==="fixture-cron",error:null};
    if(name==="notification_confirm")return {data:overrides.confirmResult!==false,error:null};
    if(name==="notification_unsubscribe"||name==="notification_finish")return {data:true,error:null};
    if(name==="notification_prepare_delivery")return {data:args.p_content,error:null};
    if(name==="notification_claim"||name==="notification_request_optin"||name==="notification_digest_articles")return {data:[],error:null};
    return {data:0,error:null};
  }
  return {db:{from,rpc,auth} as unknown as DB,calls,tables};
}
function post(body:unknown,token?:string,path="notification-center") {return new Request("https://edge.invalid/"+path,{method:"POST",headers:{"Content-Type":"application/json",Origin:env.SITE_URL,...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify(body)});}
Deno.test("Push endpoint SSRF validation is exact-host HTTPS only",()=>{
  assert(validPushEndpoint(subscription.endpoint)); assert(validPushEndpoint("https://web.push.apple.com/Q/abc"));
  for(const u of ["http://fcm.googleapis.com/x","https://127.0.0.1/x","https://localhost/x","https://fcm.googleapis.com.evil.invalid/x","https://evilfcm.googleapis.com/x","https://fcm.googleapis.com@evil.invalid/x","https://user:pass@fcm.googleapis.com/x","https://fcm.googleapis.com:8443/x","https://fcm.googleapis.com/x#token","https://fcm.googleapis.com/"])assert(!validPushEndpoint(u),u);
});
Deno.test("Subscription keys and bounded preferences are validated",()=>{
  assert(validSubscription(subscription)); assert(!validSubscription({...subscription,keys:{p256dh:"bad",auth:"bad"}}));
  equal(choices(["politics","politics"]),["politics"]);let failed=false;try{choices(["<script>"]);}catch{failed=true;}assert(failed);
});
Deno.test("Push filters combine country topic breaking and disabled preference",()=>{
  const a={id:articleId,title:"Fixture",published_at:new Date().toISOString(),category:"politics",country:"السعودية",topics:["diplomacy"],is_breaking:true};
  const p={browser_notifications:true,notify_breaking:true,notify_categories:["diplomacy"],notify_countries:["السعودية"]};
  assert(matchesPush(a,p));assert(!matchesPush(a,{...p,notify_countries:["مصر"]}));assert(!matchesPush(a,{...p,notify_breaking:false}));assert(!matchesPush(a,{...p,browser_notifications:false}));
  assert(!matchesPush({...a,is_breaking:false},{...p,notify_categories:[],notify_countries:[]}));
});
Deno.test("Article paths reject external URLs and non UUID identifiers",()=>{
  equal(articlePath(articleId),"/news/"+articleId);let failed=false;try{articlePath("//evil.invalid");}catch{failed=true;}assert(failed);
});
Deno.test("Newsletter tokens purpose-separated deterministic and stored only as SHA256 hashes",async()=>{
  const confirm=await tokenFor(env.NOTIFICATION_TOKEN_SECRET,user,other,"confirm"),unsub=await tokenFor(env.NOTIFICATION_TOKEN_SECRET,user,other,"unsubscribe");
  assert(confirm!==unsub);equal(confirm.length,43);equal(await tokenFor(env.NOTIFICATION_TOKEN_SECRET,user,other,"confirm"),confirm);assert(await hash(confirm)!==confirm);
});
Deno.test("Daily weekly periods are prior complete UTC periods",()=>{
  equal(previousPeriod("daily",new Date("2026-11-15T23:00:00Z")),{start:"2026-11-14T00:00:00.000Z",end:"2026-11-15T00:00:00.000Z"});
  equal(previousPeriod("weekly",new Date("2026-11-15T23:00:00Z")),{start:"2026-11-02T00:00:00.000Z",end:"2026-11-09T00:00:00.000Z"});
});
Deno.test("Configuration absent credentials and switches fail closed",()=>{
  equal(ready({},{}),{push_ready:false,email_ready:false,vapid_public_key:null});
  assert(!ready({...env,RESEND_API_KEY:""},{push_enabled:true,email_enabled:true}).email_ready);
  assert(!ready({...env,NOTIFICATIONS_ENABLED:"false"},{push_enabled:true,email_enabled:true}).push_ready);
});
Deno.test("Vault fallback is private env-first and cached",async()=>{
  const m=mock({vault:{vapid_public_key:env.VAPID_PUBLIC_KEY,vapid_private_key:env.VAPID_PRIVATE_KEY,vapid_subject:env.VAPID_SUBJECT,notification_token_secret:env.NOTIFICATION_TOKEN_SECRET}});
  const partial={...env,VAPID_PUBLIC_KEY:"",VAPID_PRIVATE_KEY:"",VAPID_SUBJECT:"",NOTIFICATION_TOKEN_SECRET:""};
  const resolved=await resolveEnv(m.db,partial);equal(resolved.VAPID_PRIVATE_KEY,env.VAPID_PRIVATE_KEY);equal(resolved.NOTIFICATION_TOKEN_SECRET,env.NOTIFICATION_TOKEN_SECRET);
  await resolveEnv(m.db,partial);equal(m.calls.filter(c=>c.name==="notification_runtime_config").length,1);
  const publicConfig=await health(m.db,partial);assert(publicConfig.push_ready);assert(!JSON.stringify(publicConfig).includes(env.VAPID_PRIVATE_KEY));assert(!JSON.stringify(publicConfig).includes(env.NOTIFICATION_TOKEN_SECRET));
  equal((await resolveEnv(m.db,env)).VAPID_PUBLIC_KEY,env.VAPID_PUBLIC_KEY);
});
Deno.test("Center public config exposes public VAPID only",async()=>{
  const m=mock(),r=await center(env,m.db)(post({action:"config"}));equal(r.status,200);const data=await r.json();assert(data.push_ready);assert(!("vapid_private_key"in data));assert(!("notification_token_secret"in data));
});
Deno.test("Center push routes require verified JWT not decoded claims",async()=>{
  for(const action of ["push_subscribe","push_delete","push_status"]){const m=mock(),r=await center(env,m.db)(post({action,subscription,endpoint:subscription.endpoint,consent:true},"unsigned-fixture"));equal(r.status,401);assert(!m.calls.some(c=>c.table==="push_subscriptions"));}
});
Deno.test("Center push upsert cannot overwrite another account",async()=>{
  const m=mock({tables:{push_subscriptions:[{id:other,user_id:other,endpoint_hash:await hash(subscription.endpoint)}]}});
  const r=await center(env,m.db)(post({action:"push_subscribe",subscription,consent:true},"verified-fixture"));equal(r.status,409);assert(!m.calls.some(c=>c.operation==="update"));
});
Deno.test("Center valid opt-in owns subscription and delete is user-scoped",async()=>{
  const m=mock();equal((await center(env,m.db)(post({action:"push_subscribe",subscription,consent:true},"verified-fixture"))).status,200);
  equal((m.tables.push_subscriptions[0] as {user_id:string}).user_id,user);
  equal((await center(env,m.db)(post({action:"push_delete",endpoint:subscription.endpoint},"verified-fixture"))).status,200);
  const deletion=m.calls.find(c=>c.operation==="delete");assert(JSON.stringify(deletion?.filters).includes(user));
});
Deno.test("Center rate limits reject before protected database mutation",async()=>{
  const m=mock({rateAllowed:false});equal((await center(env,m.db)(post({action:"push_subscribe",subscription,consent:true},"verified-fixture"))).status,429);assert(!m.calls.some(c=>c.operation==="insert"));
});
Deno.test("Center refuses newsletter opt-in if credentials missing and does not write legacy interest rows",async()=>{
  const m=mock();const r=await center({...env,RESEND_API_KEY:""},m.db)(post({action:"newsletter_subscribe",email:"fixture@example.invalid",cadence:"daily",consent:true}));equal(r.status,503);assert(!m.calls.some(c=>c.table==="newsletter_optins"||c.table==="newsletter_subscribers"));
});
Deno.test("Newsletter explicit consent honeypot cadence enforced",async()=>{
  for(const body of [{consent:false},{website:"bot"},{cadence:"hourly"}]){const m=mock();equal((await center(env,m.db)(post({action:"newsletter_subscribe",email:"fixture@example.invalid",cadence:"daily",consent:true,...body}))).status,400);}
});
Deno.test("GET unsubscribe is inert no-referrer no-store confirmation only",async()=>{
  const m=mock();const r=await center(env,m.db)(new Request("https://edge.invalid/notification-center/unsubscribe?token="+"A".repeat(43)));equal(r.status,200);assert((await r.text()).includes('method="post"'));equal(r.headers.get("Referrer-Policy"),"no-referrer");assert(!m.calls.some(c=>c.name==="notification_unsubscribe"));
});
Deno.test("RFC one-click HTTPS POST hashes token and never logs raw tokens",async()=>{
  const m=mock(),token="A".repeat(43);const r=await center(env,m.db)(new Request("https://edge.invalid/notification-center/unsubscribe?token="+token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"List-Unsubscribe=One-Click"}));equal(r.status,200);const call=m.calls.find(c=>c.name==="notification_unsubscribe");equal(call?.args,{p_hash:await hash(token)});assert(!JSON.stringify(m.calls).includes(token));
});
Deno.test("Expired confirmation does not activate subscriber",async()=>{
  const m=mock({confirmResult:false});equal((await center(env,m.db)(post({action:"newsletter_confirm",token:"A".repeat(43)}))).status,400);
});
Deno.test("Dispatch requires existing service-only cron verifier",async()=>{
  const m=mock();const r=await dispatch(env,m.db,{email:()=>Promise.reject(),push:()=>Promise.reject()})(new Request("https://edge.invalid/notification-dispatch",{method:"POST",headers:{"x-wrldline-cron-secret":"wrong-fixture"}}));equal(r.status,401);assert(!m.calls.some(c=>c.name==="notification_claim"));
});
Deno.test("Dispatch reports verifier infrastructure errors as 503, not invalid credentials",async()=>{
  const m=mock({rpc:()=>({data:null,error:{message:"database unavailable"}})});
  const r=await dispatch(env,m.db,{email:()=>Promise.reject(),push:()=>Promise.reject()})(new Request("https://edge.invalid/notification-dispatch",{method:"POST",headers:{"x-wrldline-cron-secret":"fixture-cron"}}));
  equal(r.status,503);
  assert(!m.calls.some(c=>c.name==="notification_claim"));
});
Deno.test("Dispatch with no sending credentials reports zero and never claims",async()=>{
  const m=mock();const r=await dispatch({...env,NOTIFICATIONS_ENABLED:"false"},m.db,{email:()=>Promise.reject(),push:()=>Promise.reject()})(new Request("https://edge.invalid/notification-dispatch",{method:"POST",headers:{"x-wrldline-cron-secret":"fixture-cron"}}));equal(r.status,200);equal((await r.json()).sent,0);assert(!m.calls.some(c=>c.name==="notification_claim"));
});
Deno.test("Resend adapter uses HTTPS and same idempotency key on retry",async()=>{
  const seen:string[]=[];const fake:typeof fetch=(_input,options)=>{seen.push(new Headers(options?.headers).get("Idempotency-Key")||"");assert(options?.redirect==="error");return Promise.resolve(new Response(JSON.stringify({id:"mock-email"}),{status:200}));};
  const sender=adapters(env,fake);const mail={to:"fixture@example.invalid",subject:"Fixture",html:"fixture",text:"fixture"};await sender.email(mail,"stable-fixture");await sender.email(mail,"stable-fixture");equal(seen,["stable-fixture","stable-fixture"]);
});
Deno.test("Adapter fail closed before any network when unconfigured",async()=>{
  let calls=0;const fake:typeof fetch=()=>{calls++;throw new Error("network must not happen");};
  const sender=adapters({},fake);try{await sender.email({to:"x@example.invalid",subject:"x",html:"x",text:"x"},"x");}catch(e){assert(e instanceof DeliveryError);}
  try{await sender.push(subscription,{article_id:articleId});}catch(e){assert(e instanceof DeliveryError);}equal(calls,0);
});
Deno.test("Web Push gone prunes stale endpoint and preserves terminal delivery outcome",async()=>{
  const m=mock({tables:{push_subscriptions:[{id:other,user_id:user,endpoint:subscription.endpoint,...subscription.keys,disabled_at:null}],articles:[{id:articleId,title:"Fixture",published_at:new Date().toISOString(),editorial_status:"published",category:"politics",is_breaking:true}],user_preferences:[{user_id:user,notify_breaking:true,notify_categories:[],notify_countries:[],browser_notifications:true}]}});
  const outcome=await deliver(m.db,env,{id:user,kind:"push",lease_token:other,attempts:1,created_at:new Date().toISOString(),push_subscription_id:other,newsletter_id:"",article_id:articleId,token_nonce:"",period_start:"",period_end:"",content:null},{email:()=>Promise.reject(),push:()=>Promise.reject(new DeliveryError("push_gone",false,false,true))});equal(outcome,"failed");assert(m.calls.some(c=>c.table==="push_subscriptions"&&c.operation==="delete"));
});
Deno.test("Ambiguous push transport result is never retried",async()=>{
  const m=mock({tables:{push_subscriptions:[{id:other,user_id:user,endpoint:subscription.endpoint,...subscription.keys}],articles:[{id:articleId,title:"Fixture",published_at:new Date().toISOString(),editorial_status:"published",is_breaking:true}],user_preferences:[{user_id:user,notify_breaking:true,notify_categories:[],notify_countries:[],browser_notifications:true}]}});
  const outcome=await deliver(m.db,env,{id:user,kind:"push",lease_token:other,attempts:1,created_at:new Date().toISOString(),push_subscription_id:other,newsletter_id:"",article_id:articleId,token_nonce:"",period_start:"",period_end:"",content:null},{email:()=>Promise.reject(),push:()=>Promise.reject(new DeliveryError("push_unknown_result",false,true))});equal(outcome,"uncertain");
});

Deno.test("Maintained Web Push builds encrypted Deno-compatible request locally without sending",async()=>{
  const webpush=await import("npm:web-push@4.0.0");
  const peer=createECDH("prime256v1");peer.generateKeys();
  const localSub={endpoint:subscription.endpoint,keys:{p256dh:peer.getPublicKey().toString("base64url"),auth:btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"")}};
  const request=webpush.generateRequestDetails(localSub,JSON.stringify({article_id:articleId}),{vapidDetails:{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY},TTL:1800});
  assert(request.body && request.body.length>0);equal(request.endpoint,subscription.endpoint);
});
Deno.test("Request body size is bounded before any consent write",async()=>{
  const m=mock();const r=await center(env,m.db)(post({action:"newsletter_subscribe",email:"A".repeat(10000)}));equal(r.status,400);assert(!m.calls.some(c=>c.name==="notification_request_optin"));
});
Deno.test("Push missing or historical publication cancels without invoking sender",async()=>{
  for(const date of ["invalid",new Date(Date.now()-7*86400000).toISOString()]){
    const m=mock({tables:{push_subscriptions:[{id:other,user_id:user,endpoint:subscription.endpoint,...subscription.keys}],articles:[{id:articleId,title:"Fixture",published_at:date,editorial_status:"published",is_breaking:true}]}});let sent=0;
    const outcome=await deliver(m.db,env,{id:user,kind:"push",lease_token:other,attempts:1,created_at:new Date().toISOString(),push_subscription_id:other,newsletter_id:"",article_id:articleId,token_nonce:"",period_start:"",period_end:"",content:null},{email:()=>Promise.reject(),push:()=>{sent++;return Promise.resolve("mock");}});equal(outcome,"cancelled");equal(sent,0);
  }
});
Deno.test("Missing current newsletter consent cancels all queued mail without sending",async()=>{
  const m=mock({tables:{newsletter_optins:[{id:user,status:"unsubscribed",token_nonce:other}]}});let sent=0;
  const outcome=await deliver(m.db,env,{id:user,kind:"digest",lease_token:other,attempts:1,created_at:new Date().toISOString(),push_subscription_id:"",newsletter_id:user,article_id:"",token_nonce:other,period_start:"",period_end:"",content:null},{email:()=>{sent++;return Promise.resolve("mock");},push:()=>Promise.reject()});equal(outcome,"cancelled");equal(sent,0);
});
Deno.test("Confirmation delivery reconstructs token, snapshots choices, and retries with same key",async()=>{
  const token=await tokenFor(env.NOTIFICATION_TOKEN_SECRET,user,other,"confirm"),unsub=await tokenFor(env.NOTIFICATION_TOKEN_SECRET,user,other,"unsubscribe");
  const m=mock({tables:{newsletter_optins:[{id:user,email:"fixture@example.invalid",locale:"ar",cadence:"weekly",topics:["politics"],countries:["السعودية"],status:"pending",token_nonce:other,confirmation_hash:await hash(token),unsubscribe_hash:await hash(unsub),confirmation_expires_at:new Date(Date.now()+3600000).toISOString()}]}});
  let captured="";const outcome=await deliver(m.db,env,{id:user,kind:"confirmation",lease_token:other,attempts:1,created_at:new Date().toISOString(),push_subscription_id:"",newsletter_id:user,article_id:"",token_nonce:other,period_start:"",period_end:"",content:null},{email:(mail,key)=>{equal(key,"wrldline-"+user);assert(mail.text.includes("السعودية"));captured=mail.text;return Promise.reject(new DeliveryError("email_network",true,true));},push:()=>Promise.reject()});equal(outcome,"retry");assert(captured.includes("#confirm="+token));const snapshot=m.calls.find(c=>c.name==="notification_prepare_delivery");assert(!JSON.stringify(snapshot).includes(token));
});
