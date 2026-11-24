import {randomBytes} from 'node:crypto';
import {appendFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const e=process.env;
const account='dd2f9ff1959d7f3cc9dbd1a433017be4';
const dir=e.RUNNER_TEMP;
function required(name){if(!e[name])throw Error(`Required deployment input missing: ${name}`);return e[name];}
async function get(url,options={}){return fetch(url,{...options,signal:AbortSignal.timeout(18000)});}
const die=message=>{throw Error(message);};
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
  const secrets={
    SUPABASE_URL:root,SUPABASE_SERVICE_ROLE_KEY:e.WF_SUPABASE_SERVICE_KEY,
    SUPABASE_PUBLISHABLE_KEY:required('WF_SUPABASE_PUBLISHABLE_KEY'), CEO_USER_ID:user.id,
    AI_PROVIDER:e.WF_GROQ_KEY?'groq':'openrouter',
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
  const origin='https://worldline-news-office.bader-11pq.workers.dev';
  const base=`${origin}/ai-office`;
  const ready=await get(`${base}/api/health`);
  const health=await ready.json();
  if(!ready.ok||health.demo!==false)die('Worker did not start in live mode.');
  const index=await get(`${base}/`);
  if(!index.ok||!(await index.text()).includes('assets/'))die('Mounted office HTML missing.');
  const denied=await get(`${base}/api/office/state`);
  if(denied.status!==401)die('Private endpoint did not reject an anonymous request.');
  const response=await get(`${base}/api/public/articles`);
  const feed=await response.json();
  if(!response.ok||feed.demo!==false||!Array.isArray(feed.articles))die('Supabase publication feed is not healthy.');
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
  const snapshot=await get(`${base}/api/office/state`,{headers});
  if(!snapshot.ok||!(await snapshot.json()).modelProfile)die('CEO cannot retrieve the office state.');
  if(!health.ai){console.log('No provider secret was configured.');return;}
  for(const tier of ['fast','editor','checker']){
    const r=await get(`${base}/api/office/models/test`,{method:'POST',headers,body:JSON.stringify({tier})});
    const result=await r.json();
    console.log(`Model ${tier}: ${result.status==='ok'?'verified':'not verified'}${result.model?` (${result.model})`:''}.`);
  }
}

try{await (process.argv[2]==='prepare'?prepare():process.argv[2]==='smoke'?smoke():die('Unknown commissioning command.'));}
catch(error){console.error(error instanceof Error?error.message:'Commissioning failed.');process.exitCode=1;}
