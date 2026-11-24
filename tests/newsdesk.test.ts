import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dayKey,fresh,iso,uid} from '../shared/schema';
import worker,{app,mountedRequest} from '../worker';
import {demoSeed} from '../worker/demo';
import {ask,listModels,type Env} from '../worker/integrations';

const demo:Env={APP_MODE:'demo'};
const live:Env={APP_MODE:'live',SUPABASE_URL:'https://db.example.com',SUPABASE_PUBLISHABLE_KEY:'fixture-public',SUPABASE_SERVICE_ROLE_KEY:'fixture-db-secret',CEO_USER_ID:uid(),SITE_PUBLIC_URL:'https://al-ghaib.us.ci'};
const profile={provider:'groq',fast:'new/fast',editor:'new/editor',checker:'new/checker'} as const;
const json=(x:unknown)=>Response.json(x);

test('password login accepts pasted email and keeps the password exactly as entered',async t=>{
  const sent:{email:string;password:string}[]=[];
  t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
    assert.match(url,/\/auth\/v1\/token\?grant_type=password$/);
    sent.push(JSON.parse(String(init.body)));
    return json({access_token:'fixture-token',user:{id:live.CEO_USER_ID}});
  });
  const sign=(email:string,password:string)=>app.request('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})},live);
  const result=await sign(' \u200fEDITOR@EXAMPLE.COM\u200e ', ' كلمة السر ');
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{token:'fixture-token',demo:false});
  assert.deepEqual(sent,[{email:'editor@example.com',password:' كلمة السر '}]);
  const invalid=await sign('not-an-email','password');
  assert.equal(invalid.status,422);
  assert.match((await invalid.json() as {error:string}).error,/صيغة البريد/);
  assert.equal(sent.length,1);
});

test('recovery only requests mail for the CEO and uses the first-party redirect',async t=>{
  let mailed=0;
  t.mock.method(globalThis,'fetch',async(raw:string|URL,init:RequestInit)=>{
    const url=new URL(raw);
    if(url.pathname.startsWith('/auth/v1/admin/users/')){
      assert.equal(url.pathname,`/auth/v1/admin/users/${live.CEO_USER_ID}`);
      assert.equal(new Headers(init.headers).get('apikey'),live.SUPABASE_SERVICE_ROLE_KEY);
      return json({email:'editor@example.com'});
    }
    assert.equal(url.pathname,'/auth/v1/recover');
    assert.equal(url.searchParams.get('redirect_to'),'https://al-ghaib.us.ci/admin.html');
    assert.equal(new Headers(init.headers).get('apikey'),live.SUPABASE_PUBLISHABLE_KEY);
    assert.deepEqual(JSON.parse(String(init.body)),{email:'editor@example.com'});
    mailed++;return json({});
  });
  const recover=(email:string)=>app.request('/api/session/recover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})},live);
  const other=await recover('other@example.com');
  assert.equal(mailed,0);
  const ceo=await recover(' EDITOR@EXAMPLE.COM ');
  assert.equal(mailed,1);
  assert.equal(other.status,200);assert.equal(ceo.status,200);
  assert.deepEqual(await other.json(),await ceo.json());
});

test('mounted newsroom retains method, query, and body; chat does not commission a task',async()=>{
  const token=((await (await app.request('/api/session',{method:'POST'},demo)).json()) as {token:string}).token;
  const baseline=await (await app.request('/api/office/state',{headers:{authorization:`Bearer ${token}`}},demo)).json() as ReturnType<typeof fresh>;
  const req=new Request('https://office.example/ai-office/api/office/chat?keep=1',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({channel:'omar',text:'@ليلى ما الناقص للتحقق؟'})});
  const mapped=mountedRequest(req);
  assert.equal(new URL(mapped.url).search,'?keep=1');
  assert.equal(mapped.method,'POST');
  const res=await app.fetch(mapped,demo);
  assert.equal(res.status,200);
  const result=await res.json() as ReturnType<typeof fresh>;
  assert.deepEqual(result.tasks,baseline.tasks);
  assert.deepEqual(result.workflows,baseline.workflows);
  assert.equal(result.messages.at(-1)?.author,'layla');
  assert.equal(result.messages.at(-1)?.channel,'layla');
  const redirect=await worker.fetch(new Request('https://office.example/ai-office?keep=1'),demo,undefined);
  assert.equal(redirect.headers.get('location'),'https://office.example/ai-office/?keep=1');
});

test('model profile controls all tiers, and probes contain no desk chat or editorial notes',async t=>{
  const o=fresh(false);o.modelProfile=profile;
  o.messages.push({id:uid(),author:'ceo',channel:'layla',text:'private story memory',createdAt:iso()});
  const environment={...live,AI_PROVIDER:'openrouter' as const,OPENROUTER_API_KEY:'unused',GROQ_API_KEY:'fixture-groq-secret'};
  const models:string[]=[];
  t.mock.method(globalThis,'fetch',async (url:string,init:RequestInit)=>{
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer fixture-groq-secret');
    assert.match(url,/^https:\/\/api\.groq\.com\//);
    if(url.endsWith('/models'))return json({data:[{id:'valid/model-v1'},{id:'https://bad/?inject'}]});
    const body=JSON.parse(String(init.body));
    assert.doesNotMatch(JSON.stringify(body),/private story memory|fixture-groq-secret/);
    models.push(body.model);
    return json({choices:[{message:{content:'OK'}}],usage:{total_tokens:15}});
  });
  assert.deepEqual(await listModels(environment,'groq'),['valid/model-v1']);
  for(const employee of ['omar','sara','layla'] as const)assert.equal(await ask(environment,o,employee,'Connectivity probe','Reply OK.',16),'OK');
  assert.deepEqual(models,[profile.fast,profile.editor,profile.checker]);
});

test('saved model routing is session-protected; demo probe never contacts a provider',async t=>{
  t.mock.method(globalThis,'fetch',()=>{throw Error('Demo contacted the network');});
  const token=((await (await app.request('/api/session',{method:'POST'},demo)).json()) as {token:string}).token;
  const set=(path:string,method:string,body:unknown,auth=token)=>app.request(path,{method,headers:{...(auth?{authorization:`Bearer ${auth}`} :{}),'content-type':'application/json'},body:JSON.stringify(body)},demo);
  assert.equal((await set('/api/office/models','PUT',profile,'')).status,401);
  assert.equal((await set('/api/office/models','PUT',{...profile,fast:'invalid?model'})).status,422);
  assert.equal((await set('/api/office/models','PUT',profile)).status,200);
  const probe=await set('/api/office/models/test','POST',{tier:'checker'});
  assert.deepEqual(await probe.json(),{demo:true,status:'demo',provider:'groq',model:profile.checker});
});

test('Gemini routes distinct tiers, omits private probe context, hides thoughts and records token usage',async t=>{
  const o=fresh(false);
  o.messages.push({id:uid(),author:'ceo',channel:'layla',text:'private editorial context',createdAt:iso()});
  const environment={...live,AI_PROVIDER:'gemini' as const,GEMINI_API_KEY:'fixture-google'};
  const called:string[]=[];
  t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
    assert.equal(new Headers(init.headers).get('x-goog-api-key'),'fixture-google');
    assert.doesNotMatch(url,/fixture-google/);
    called.push(url);
    const body=JSON.parse(String(init.body));
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'minimal');
    assert.doesNotMatch(JSON.stringify(body),/private editorial context/);
    return json({candidates:[{content:{parts:[{text:'hidden',thought:true},{text:'جاهز'}]}}],usageMetadata:{totalTokenCount:17}});
  });
  for(const employee of ['omar','sara','layla'] as const){
    assert.equal(await ask(environment,o,employee,'Connectivity probe','Reply OK.',512),'جاهز');
    assert.equal(o.usage[dayKey()][employee],17);
  }
  assert.match(called[0],/\/gemini-3\.5-flash-lite:generateContent$/);
  assert.match(called[1],/\/gemini-3\.6-flash:generateContent$/);
  assert.equal(called[1],called[2]);
});

test('public feed and article lookup reject all nonpublished payloads and restrict cross-origin reads',async t=>{
  const published={...demoSeed().articles[0],id:uid(),demo:false,status:'published',publishedAt:iso()} as const;
  const stored=[published,{...published,id:uid(),status:'review'},{...published,id:uid(),status:'rejected'},
    {...published,id:uid(),demo:true},{...published,id:uid(),check:{...published.check,state:'blocked'}}];
  t.mock.method(globalThis,'fetch',async(url:string)=>{
    const db=new URL(url);
    assert.equal(db.searchParams.get('status'),'eq.published');
    assert.equal(db.searchParams.get('user_id'),`eq.${live.CEO_USER_ID}`);
    return json(stored.filter(a=>!db.searchParams.has('id')||db.searchParams.get('id')===`eq.${a.id}`).map(payload=>({payload})));
  });
  const publicGet=(suffix='',origin=live.SITE_PUBLIC_URL!,env=live)=>app.request(`/api/public/articles${suffix}`,{headers:{origin}},env);
  const response=await publicGet();
  assert.equal(response.headers.get('access-control-allow-origin'),live.SITE_PUBLIC_URL);
  assert.match(response.headers.get('vary')||'',/Origin/);
  const payload=await response.json() as {articles:{id:string;status:string}[]};
  assert.deepEqual(payload.articles.map(a=>[a.id,a.status]),[[published.id,'published']]);
  assert.equal((await publicGet(`/${published.id}`)).status,200);
  for(const a of stored.slice(1))assert.equal((await publicGet(`/${a.id}`)).status,404);
  assert.equal((await publicGet('', 'https://untrusted.example')).headers.get('access-control-allow-origin'),null);
  assert.equal((await publicGet(`/${published.id}`,live.SITE_PUBLIC_URL,{...live,APP_MODE:'demo'})).status,404);
  assert.equal((await app.request('/api/office/state',{headers:{origin:live.SITE_PUBLIC_URL!}},live)).headers.get('access-control-allow-origin'),null);
});
