import {randomBytes} from 'node:crypto';
import {appendFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const e=process.env;
const account='dd2f9ff1959d7f3cc9dbd1a433017be4';
const dir=e.RUNNER_TEMP;
function required(name){if(!e[name])throw Error(`Required deployment input missing: ${name}`);return e[name];}
async function get(url,options={}){return fetch(url,{...options,signal:AbortSignal.timeout(18000)});}
const die=message=>{throw Error(message);};
async function chooseModels(){
  const options=[
    ...[...new Set([e.WF_GEMINI_KEY,e.WF_GEMINI_FALLBACK_KEY].filter(Boolean))].map(key=>({provider:'gemini',key,fast:'gemini-3.5-flash-lite',strong:'gemini-3.6-flash'})),
    ...(e.WF_GROQ_KEY?[{provider:'groq',key:e.WF_GROQ_KEY,fast:'openai/gpt-oss-20b',strong:'openai/gpt-oss-120b'}]:[]),
    ...(e.WF_OPENROUTER_KEY?[{provider:'openrouter',key:e.WF_OPENROUTER_KEY,fast:'openai/gpt-oss-20b:free',strong:'openai/gpt-oss-120b:free'}]:[])
  ];
  const attempts=await Promise.all(options.map(async option=>{
    const {provider,key,fast,strong}=option;
    const results=await Promise.all([fast,strong].map(async model=>{
      try{
        const gemini=provider==='gemini',text='أجب بكلمة جاهز فقط. هذا اختبار اتصال.';
        const endpoint=gemini?`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`:`${provider==='groq'?'https://api.groq.com/openai/v1':'https://openrouter.ai/api/v1'}/chat/completions`;
        const response=await get(endpoint,{method:'POST',headers:{'content-type':'application/json',...(gemini?{'x-goog-api-key':key}:{authorization:`Bearer ${key}`})},body:JSON.stringify(gemini?{contents:[{role:'user',parts:[{text}]}],generationConfig:{thinkingConfig:{thinkingLevel:'minimal'},maxOutputTokens:512}}:{model,max_tokens:512,...(provider==='groq'?{reasoning_effort:'low'}:{}),messages:[{role:'user',content:text}]})});
        const payload=await response.json().catch(()=>null);
        const answer=gemini?payload?.candidates?.[0]?.content?.parts?.find(x=>!x.thought&&x.text)?.text:payload?.choices?.[0]?.message?.content;
        const ok=response.ok&&typeof answer==='string'&&!!answer.trim();
        console.log(`Provider ${provider} / ${model}: ${ok?'verified':`no usable response (HTTP ${response.status})`}.`);
        return ok;
      }catch{console.log(`Provider ${provider} / ${model}: timed out or unavailable.`);return false;}
    }));
    return results.every(Boolean)?option:null;
  }));
  return attempts.find(Boolean);
}
const input=()=>{
  const root=required('WF_SUPABASE_URL').replace(/\/$/,'');
  if(root!=='https://vmaxbnogmmfyrcucapnq.supabase.co')die('Wrong Supabase project. Refusing to provision.');
  const key=required('WF_SUPABASE_SERVICE_KEY');
  return {root,headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'}};
};

async function prepare(){
  if(!dir||!e.GITHUB_ENV)die('Expected a GitHub Actions runner.');
  const cloudKey=required('WF_CLOUDFLARE_KEY');
  const url=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts`;
  const bearer=await get(url,{headers:{authorization:`Bearer ${cloudKey}`}});
  if(bearer.ok)appendFileSync(e.GITHUB_ENV,`CLOUDFLARE_API_TOKEN=${cloudKey}\n`);
  else{
    const email=required('WF_CLOUDFLARE_EMAIL');
    const global=await get(url,{headers:{'x-auth-email':email,'x-auth-key':cloudKey}});
    if(!global.ok)die(`Cloudflare credentials cannot list this account's Workers (HTTP ${bearer.status}/${global.status}).`);
    appendFileSync(e.GITHUB_ENV,`CLOUDFLARE_API_KEY=${cloudKey}\nCLOUDFLARE_EMAIL=${email}\n`);
  }
  const {root,headers}=input();
  const email=required('WF_CEO_EMAIL').trim().toLowerCase();
  let user;
  for(let p=1;p<=30&&!user;p++){
    const response=await get(`${root}/auth/v1/admin/users?page=${p}&per_page=200`,{headers});
    if(!response.ok)die(`Cannot read Supabase Auth directory (HTTP ${response.status}).`);
    const {users}=await response.json();
    if(!Array.isArray(users))die('Unexpected Auth directory response.');
    user=users.find(u=>u.email?.toLowerCase()===email);
    if(users.length<200)break;
    if(p===30&&!user)die('Auth directory exceeded the bounded lookup.');
  }
  let password;
  if(!user){
    password=`Wl9!${randomBytes(30).toString('base64url')}`;
    const created=await get(`${root}/auth/v1/admin/users`,{method:'POST',headers,body:JSON.stringify({email,password,email_confirm:true})});
    if(!created.ok)die(`CEO account could not be provisioned (HTTP ${created.status}).`);
    user=await created.json();
  }
  if(!/^[0-9a-f-]{36}$/i.test(user.id||''))die('No usable CEO identity.');
  const officeUser=await get(`${root}/rest/v1/wrldline_office_users?on_conflict=id`,{method:'POST',headers:{...headers,prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({id:user.id,role:'ceo',name:'رئيس التحرير'})});
  if(!officeUser.ok)die(`Cannot bind CEO to the isolated office tables (HTTP ${officeUser.status}).`);
  const selected=await chooseModels();
  const geminiKey=selected?.provider==='gemini'?selected.key:e.WF_GEMINI_KEY||e.WF_GEMINI_FALLBACK_KEY;
  if(!selected&&(geminiKey||e.WF_GROQ_KEY||e.WF_OPENROUTER_KEY))die('No configured provider verified both model roles. Keeping the current live deployment.');
  console.log(selected?`Default live model profile: ${selected.provider}.`:'No AI provider key was supplied. Editorial generation will not use mock responses.');
  const secrets={
    SUPABASE_URL:root,SUPABASE_SERVICE_ROLE_KEY:e.WF_SUPABASE_SERVICE_KEY,
    SUPABASE_PUBLISHABLE_KEY:required('WF_SUPABASE_PUBLISHABLE_KEY'), CEO_USER_ID:user.id,
    AI_PROVIDER:selected?.provider??(geminiKey?'gemini':e.WF_GROQ_KEY?'groq':'openrouter'),
    ...(selected?{MODEL_FAST:selected.fast,MODEL_EDITOR:selected.strong,MODEL_CHECKER:selected.strong}:{}),
    ...(geminiKey?{GEMINI_API_KEY:geminiKey}:{}),
    ...(e.WF_GROQ_KEY?{GROQ_API_KEY:e.WF_GROQ_KEY}:{}),
    ...(e.WF_OPENROUTER_KEY?{OPENROUTER_API_KEY:e.WF_OPENROUTER_KEY}:{}),
    ...(e.WF_IMAGE_KEY?{IMAGE_API_KEY:e.WF_IMAGE_KEY}:{})
  };
  writeFileSync(join(dir,'worldline-office-secrets.json'),JSON.stringify(secrets),{mode:0o600});
  if(password)writeFileSync(join(dir,'worldline-office-bootstrap.json'),JSON.stringify({email,password}),{mode:0o600});
  console.log('Cloudflare and Supabase credentials verified; CEO assigned to the isolated newsroom only.');
}

async function smoke(){
  const {readFileSync,existsSync}=await import('node:fs');
  const origin='https://al-ghaib.us.ci';
  const base=`${origin}/ai-office`;
  const ready=await get(`${base}/api/health`);
  const health=await ready.json();
  if(!ready.ok||health.demo!==false)die('Worker did not start in live mode.');
  const index=await get(`${base}/`);
  if(!index.ok||!(await index.text()).includes('assets/'))die('Mounted office HTML missing.');
  const denied=await get(`${base}/api/office/state`);
  if(denied.status!==401)die('Private endpoint did not reject an anonymous request.');
  const loginPost={method:'POST',headers:{'content-type':'application/json'}};
  for(let attempt=0;attempt<6;attempt++){
    const malformed=await get(`${base}/api/session`,{...loginPost,body:JSON.stringify({email:'not-an-email',password:'fixture'})});
    if(malformed.status===422&&((await malformed.json()).error||'').includes('صيغة البريد'))break;
    if(attempt===5)die('Expected the new sign-in validation on the live site after propagation.');
    await new Promise(resolve=>setTimeout(resolve,3500));
  }
  const padded=await get(`${base}/api/session`,{...loginPost,body:JSON.stringify({email:' \u200Foffice-smoke@example.invalid ',password:'incorrect-probe-password'})});
  if(padded.status!==401)die(`Padded email did not reach the live password provider (HTTP ${padded.status}).`);
  const dryRecover=await get(`${base}/api/session/recover`,{...loginPost,body:JSON.stringify({email:'office-smoke@example.invalid'})});
  if(!dryRecover.ok||!(await dryRecover.json()).ok)die('Live recovery failed to handle an ineligible address without sending email.');
  console.log('Verified login email normalization and private recovery endpoint without sending an email.');
  let feed, feedStatus;
  for(let attempt=0;attempt<12;attempt++){
    const response=await get(`${base}/api/public/articles`);
    feedStatus=response.status;
    feed=await response.json().catch(()=>null);
    if(response.ok&&feed?.demo===false&&Array.isArray(feed.articles))break;
    if(attempt<11)await new Promise(resolve=>setTimeout(resolve,3000));
    else die(`Supabase publication feed is not healthy after deployment propagation (HTTP ${feedStatus}).`);
  }
  console.log(`Live public feed is healthy: ${feed.articles.length} published items; protected office rejects anonymous requests.`);
  const bootstrap=join(dir,'worldline-office-bootstrap.json');
  let session;
  if(existsSync(bootstrap))session=await get(`${base}/api/session`,{method:'POST',headers:{'content-type':'application/json'},body:readFileSync(bootstrap,'utf8')});
  else{
    const {root,headers}=input();
    const link=await get(`${root}/auth/v1/admin/generate_link`,{method:'POST',headers,body:JSON.stringify({type:'magiclink',email:required('WF_CEO_EMAIL')})});
    if(!link.ok)die(`CEO verification link could not be generated (HTTP ${link.status}). No message was sent.`);
    const proof=await link.json(), hash=proof.hashed_token??proof.properties?.hashed_token;
    if(!hash)die('CEO verification link contained no token hash.');
    session=await get(`${root}/auth/v1/verify`,{method:'POST',headers:{apikey:required('WF_SUPABASE_PUBLISHABLE_KEY'),'content-type':'application/json'},body:JSON.stringify({type:'magiclink',token_hash:hash})});
  }
  if(!session.ok)die(`Fresh CEO could not sign in (HTTP ${session.status}).`);
  const sessionResult=await session.json(), token=sessionResult.token??sessionResult.access_token;
  if(!token)die('CEO verification did not yield a session.');
  const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
  const expected=JSON.parse(readFileSync(join(dir,'worldline-office-secrets.json'),'utf8'));
  const tiers=['fast','editor','checker'];
  let profile;
  for(let attempt=0;attempt<12;attempt++){
    const snapshot=await get(`${base}/api/office/state`,{headers});
    profile=snapshot.ok?(await snapshot.json()).modelProfile:null;
    if(profile&&(!expected.MODEL_FAST||(profile.provider===expected.AI_PROVIDER&&tiers.every(t=>profile[t]===expected[`MODEL_${t.toUpperCase()}`]))))break;
    if(attempt===11)die('The expected model profile did not reach the live office, or a saved CEO override differs from the deployment defaults.');
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  console.log('Verified an authenticated CEO session on the custom domain.');
  const sources=await get(`${base}/api/office/sources/status`,{headers});
  const intake=await sources.json().catch(()=>null);
  if(!sources.ok||intake?.eligibleGroups<2||!Number.isFinite(intake?.observed))die(`Live source intake did not find two eligible publisher groups (HTTP ${sources.status}, observed ${intake?.observed??0}, groups ${intake?.eligibleGroups??0}).`);
  console.log(`Live source intake verified: ${intake.observed} candidates; ${intake.eligibleGroups} eligible publisher groups.`);
  if(!expected.MODEL_FAST){console.log('No provider profile was commissioned.');return;}
  let allVerified=true;
  for(const tier of tiers){
    const r=await get(`${base}/api/office/models/test`,{method:'POST',headers,body:JSON.stringify({tier})});
    const result=await r.json();
    const ok=r.ok&&result.status==='ok'&&result.provider===profile.provider&&result.model===profile[tier];
    allVerified&&=ok;
    console.log(`Model ${tier}: ${ok?'verified':'not verified'} (${profile.provider}: ${profile[tier]}).`);
  }
  if(!allVerified)die('At least one live model role did not verify against the deployed profile.');
}

try{await (process.argv[2]==='prepare'?prepare():process.argv[2]==='smoke'?smoke():die('Unknown commissioning command.'));}
catch(error){console.error(error instanceof Error?error.message:'Commissioning failed.');process.exitCode=1;}
