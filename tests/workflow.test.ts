import {test} from 'node:test';
import assert from 'node:assert/strict';
import {agents,agentIds} from '../shared/agents';
import {dayKey,fresh,iso,uid} from '../shared/schema';
import {app} from '../worker';
import {demoSeed,fixtures} from '../worker/demo';
import {checkBrief} from '../worker/factcheck';
import {classify,decide,editorialFormat,metrics,order,ready,reports,step} from '../worker/engine';
import {ask,BudgetError,releaseRequest,SetupError,type Env} from '../worker/integrations';

const demo={APP_MODE:'demo'},p={'سياسة':1,'اقتصاد':0,'متنوع':0};
const drain=async(o:ReturnType<typeof fresh>)=>{for(let i=0;i<30&&await step(demo,o);i++){}};
const h=(bearer:string)=>({authorization:`Bearer ${bearer}`,'content-type':'application/json'});
const http=(path:string,method='GET',token='',data?:unknown,e:Env=demo)=>app.request(path,{method,headers:h(token),...(data?{body:JSON.stringify(data)}:{})},e);
const issue=async()=>((await (await http('/api/session','POST','',{})).json()) as {token:string}).token;
const input='Omar, prepare today’s edition, 5 politics, 3 economics, 1 attractive story.';
test('eight distinct agents with bounded permissions, tools and KPIs',()=>{
  assert.equal(new Set(Object.values(agents).map(x=>x.prompt)).size,8);
  assert.ok(Object.values(agents).every(a=>a.tools.length>0&&a.permission&&a.kpi));
});
for(const id of agentIds)test(`private chat @${id} routes to its own channel`,async()=>{
  const o=fresh(true);await order(demo,o,id==='omar'?'@omar prepare today’s edition':`@${id} Please review these details`, 'omar');await drain(o);
  assert.ok(o.messages.some(m=>m.channel===id&&m.author==='ceo'));
  assert.ok(o.workflows[0]);assert.ok(o.tasks.length>0);
  assert.ok(o.tasks.some(t=>t.owner===id));
});
test('Omar asks for clarification before planning an ambiguous order',async()=>{
  const o=fresh(true);await order(demo,o,'@Omar could you look into it?','omar');
  assert.equal(o.tasks.length,0);assert.equal(o.messages.at(-1)?.author,'omar');assert.match(o.messages.at(-1)?.text||'',/ما المطلوب/);
});
test('daily plan and no duplicated active workflow',async()=>{
  const o=fresh(true);await order(demo,o,input,'omar');await order(demo,o,input,'omar');
  assert.equal(o.workflows.length,1);assert.deepEqual(o.workflows[0].plan,{'سياسة':5,'اقتصاد':3,'متنوع':1});
  assert.equal(o.tasks.length,6);assert.ok(!ready(o,o.tasks[1]));
  await step(demo,o);assert.equal(o.tasks[0].status,'Waiting for Fact Check');assert.ok(ready(o,o.tasks[1]));
  await drain(o);assert.equal(o.articles.length,9);assert.ok(o.articles.every(a=>a.status==='review'));
});
test('blocked checking stops downstream tasks and creates no draft',async()=>{
  const o=fresh(true);await order(demo,o,'breaking one source','omar');await drain(o);
  assert.equal(o.articles.length,0);assert.equal(o.tasks.find(t=>t.owner==='layla')?.status,'Blocked');assert.ok(o.tasks.filter(t=>t.kind==='review').every(t=>t.status==='Blocked'));
});
test('approval rejects non-CEO, permits CEO exactly once',()=>{
  const o=demoSeed(),id=o.articles[0].id;
  for(const role of agentIds)assert.throws(()=>decide(o,role,role,id,'approved',''),/Only the CEO/);
  decide(o,'demo-ceo','ceo',id,'approved','');assert.equal(o.articles[0].status,'published');
  assert.throws(()=>decide(o,'demo-ceo','ceo',id,'approved',''),/no longer pending/);
  assert.equal(o.approvals.length,1);assert.ok(o.logs.some(l=>l.actor==='demo-ceo'&&l.action.includes('published')));
});
test('forged verdict with one source still cannot publish',()=>{
  const o=demoSeed(),a=o.articles[0];a.sources.splice(1);
  assert.throws(()=>decide(o,'ceo','ceo',a.id,'approved',''),/fact check/);
});
test('reject requires feedback and redoes edit with a new title',async()=>{
  const o=demoSeed(),a=o.articles[0];assert.throws(()=>decide(o,'ceo','ceo',a.id,'rejected','   '),/feedback/);
  decide(o,'ceo','ceo',a.id,'rejected','Change the headline');await drain(o);
  assert.equal(a.status,'rejected');const b=o.articles.find(x=>x.title.startsWith('متابعة تدريبية:'));assert.ok(b);assert.notEqual(b.id,a.id);
  assert.ok(o.tasks.some(t=>t.feedback==='Change the headline'&&t.attempt===2));
});
test('staging only first, deploy follows an explicit approval',async()=>{
  const o=fresh(true);await order(demo,o,'@Noura homepage is slow on mobile', 'omar');await drain(o);
  const review=o.tasks.find(t=>t.kind==='review')!;assert.equal(review.status,'Waiting for CEO Approval');assert.ok(o.workflows[0].release?.testsPassed);
  assert.ok(!o.logs.some(l=>l.action.includes('deployed')));
  assert.throws(()=>decide(o,'noura','noura',review.id,'approved',''),/Only/);
  decide(o,'ceo','ceo',review.id,'approved','');assert.equal(review.status,'Approved');assert.ok(!o.logs.some(l=>l.action==='Demo deploy simulated'));
  await drain(o);assert.ok(o.logs.some(l=>l.action==='Demo deploy simulated'));assert.equal(review.status,'Done');
});
test('staging missing provider fails closed and shows why',async()=>{
  const o=fresh(false);await order({APP_MODE:'live'},o,'@Noura slow homepage','noura');await step({APP_MODE:'live'},o);
  assert.equal(o.tasks[0].status,'Blocked');assert.match(o.tasks[0].output||'',/No release service/);
  assert.ok(!o.workflows[0].release);
});
test('morning report and three participant messages; report generated once',async()=>{
  const o=fresh(true);const r=await reports(demo,o,'morning');
  assert.equal(r.stories.length,10);assert.equal((await reports(demo,o,'morning')).id,r.id);
  assert.equal(o.messages.filter(m=>m.channel==='meeting').length,3);
  assert.match((await reports(demo,o,'evening')).text,/تقرير المساء/);
});
test('expected natural-language roles and budget constraints',()=>{
  assert.equal(classify('Idea Room','omar'),'ideas');assert.equal(classify('أعد النشرة','omar'),'edition');
  assert.equal(classify('تحقق من هذا الخبر','omar'),'verify');assert.equal(classify('Generate three images','omar'),'images');
  assert.equal(classify('مرحبا','omar'),undefined);
  const copy={title:'عنوان الخبر اليوم',summary:'خبر موثق ومنشور',body:[Array(150).fill('معلومة').join(' '),'فقرة ثانية']};
  assert.ok(editorialFormat(copy,true));assert.ok(!editorialFormat(copy,false));assert.ok(!editorialFormat({...copy,title:'BREAKING'},true));
});
test('HTTP endpoints enforce authorization, input validation, and public demo isolation',async()=>{
  assert.equal((await http('/api/office/state')).status,401);
  assert.equal((await http('/api/office/state','GET','issued-by-user')).status,401);
  const t=await issue();assert.equal((await http('/api/office/orders','POST',t,{text:'',channel:'omar'})).status,422);
  assert.equal((await http('/api/office/settings','PATCH',t,{dailyLimit:5})).status,422);
  const st=await (await http('/api/office/state','GET',t)).json() as ReturnType<typeof fresh>;
  assert.equal((await http('/api/office/approvals','POST',t,{ids:[st.articles[0].id,uid()],decision:'approved'})).status,404);
  const check=await (await http('/api/office/state','GET',t)).json() as ReturnType<typeof fresh>;
  assert.equal(check.articles[0].status,'review');
  assert.equal((await http('/api/office/approvals','POST',t,{ids:[st.articles[0].id],decision:'approved'})).status,200);
  assert.deepEqual(await (await http('/api/public/articles')).json(),{articles:[],demo:true});
  const isolated=await (await http('/api/office/state','GET',await issue())).json() as ReturnType<typeof fresh>;
  assert.ok(isolated.articles.every(a=>a.status==='review'));
});
test('live fails closed without auth or Supabase configuration',async()=>{
  assert.equal((await http('/api/office/state','GET','',undefined,{APP_MODE:'live'})).status,401);
  assert.equal((await http('/api/office/state','GET',uid(),undefined,{APP_MODE:'live'})).status,503);
  await assert.rejects(ask({APP_MODE:'live'},fresh(false),'omar','test',{}),SetupError);
});
test('credentialed AI sends correct model, charges usage, and stops at budget',async()=>{
  const original=globalThis.fetch;let count=0;
  try{
    globalThis.fetch=async (u,opts)=>{count++;assert.equal(u,'https://api.groq.com/openai/v1/chat/completions');assert.ok(new Headers(opts?.headers).get('authorization')?.startsWith('Bearer '));
      const req=JSON.parse(opts?.body as string);assert.equal(req.model,'test-final');assert.match(req.messages[0].content,/Editor in Chief/);
      return Response.json({choices:[{message:{content:'اختبار الاتصال'}}],usage:{total_tokens:170}});};
    const o=fresh(false);const e:Env={APP_MODE:'live',AI_PROVIDER:'groq',GROQ_API_KEY:'fixture-only',MODEL_EDITOR:'test-final'};
    assert.equal(await ask(e,o,'sara','simulate',{}),'اختبار الاتصال');assert.equal(o.usage[dayKey()].sara,170);
    o.dailyLimit=1000;await assert.rejects(ask(e,o,'sara','budget', 'x'.repeat(1000)),BudgetError);assert.equal(count,1);
  }finally{globalThis.fetch=original;}
});
test('live CEO identity comes from Supabase, not a supplied role',async()=>{
  const real=globalThis.fetch,e:Env={APP_MODE:'live',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',SUPABASE_PUBLISHABLE_KEY:'fixture',CEO_USER_ID:uid()};
  try {
    globalThis.fetch=async (u,opts)=>String(u).endsWith('/auth/v1/user')?Response.json({id:'not-the-ceo',role:'ceo'}):real(u,opts);
    assert.equal((await http('/api/office/approvals','POST','any-token',{ids:[uid()],decision:'approved'},e)).status,403);
  }finally{globalThis.fetch=real;}
});
test('live staging checks tested version, different token and deployment receipt',async()=>{
  const real=globalThis.fetch,e:Env={APP_MODE:'live',RELEASE_SERVICE_URL:'https://fixture.invalid/release',RELEASE_SERVICE_TOKEN:'stage-fixture',RELEASE_DEPLOY_TOKEN:'deploy-fixture'};
  const commit='e'.repeat(40);const observed:string[]=[];
  try{
    globalThis.fetch=async (_u, opts)=>{
      const data=JSON.parse(opts?.body as string),secret=new Headers(opts?.headers).get('authorization');
      assert.equal(secret,data.operation==='stage'?'Bearer stage-fixture':'Bearer deploy-fixture');observed.push(data.operation);
      return data.operation==='stage'?Response.json({commit,preview:'https://preview.invalid',report:'Fixture tests passed',testsPassed:true}):Response.json({commit:data.commit,deploymentUrl:'https://production.invalid'});
    };
    const o=fresh(false);await order(e,o,'@Noura homepage is slow on mobile','noura');await step(e,o);await step(e,o);await step(e,o);
    assert.deepEqual(observed,['stage']);const t=o.tasks.find(x=>x.kind==='review')!;decide(o,'actual-ceo','ceo',t.id,'approved','');await step(e,o);
    assert.deepEqual(observed,['stage','deploy']);assert.equal(o.workflows[0].release?.deploymentUrl,'https://production.invalid');
    globalThis.fetch=async()=>Response.json({commit:'a'.repeat(40),deploymentUrl:'https://production.invalid'});
    await assert.rejects(releaseRequest(e,'deploy','test','',commit),/did not match/);
  }finally{globalThis.fetch=real;}
});
test('credentialed editorial workflow uses RSS evidence, independent model verdicts and explicit CEO publication',async()=>{
  const real=globalThis.fetch,e:Env={APP_MODE:'live',OPENROUTER_API_KEY:'fixture-only'};
  const bbc='ورد في المحضر أن مجلس المدينة ناقش خطة النقل العام في جلسته اليوم';
  const jaz='تناول أعضاء المجلس مشروع النقل العام خلال اجتماع لم يشهد تصويتاً';
  const titles=['مجلس المدينة يناقش خطة النقل','مشروع النقل أمام المجلس'];
  const links=['https://www.bbc.com/arabic/articles/test','https://www.aljazeera.net/news/test'];
  const calls:string[]=[];
  const rss=(i:number)=>new Response(`<rss><channel><item><title>${titles[i]}</title><link>${links[i]}</link><pubDate>${new Date().toUTCString()}</pubDate><description>${[bbc,jaz][i]}</description></item></channel></rss>`);
  try {
    globalThis.fetch=async (u,opts)=>{
      if(String(u).startsWith('https://feeds.bbci'))return rss(0);
      if(String(u).startsWith('https://www.aljazeera.net/'))return rss(1);
      if(!String(u).includes('openrouter.ai'))return new Response('',{status:404});
      const parameters=JSON.parse(String(opts?.body)),{action,payload}=JSON.parse(parameters.messages[1].content);
      let output:unknown;
      if(action.startsWith('Research')){
        calls.push('research');
        output=[{headline:titles[0],topic:'سياسة',eventDate:dayKey(),claims:[{text:'ناقش مجلس المدينة خطة النقل العام في جلسة اليوم.',evidence:[{sourceId:payload.sources.find((s:{url:string})=>s.url===links[0]).id,quote:bbc},{sourceId:payload.sources.find((s:{url:string})=>s.url===links[1]).id,quote:jaz}]}],developing:[],conflict:false}];
      }else if(action.startsWith('Return only JSON object')){calls.push('check');output={state:'passed',reasons:['اختبار مصطنع']};}
      else if(action.startsWith('Return JSON object')){calls.push('edit');output={title:titles[0],summary:'هذا النص مخصص للاختبار الآلي فقط ولا يمثل خبراً حقيقياً.',body:Array.from({length:4},()=>Array(40).fill('اختبار').join(' '))};}
      else if(action.startsWith('Independently')){calls.push('recheck');output={passed:true};}
      else {calls.push('seo');output='تحسين ظهور مسودة الاختبار في البحث';}
      return Response.json({choices:[{message:{content:typeof output==='string'?output:JSON.stringify(output)}}],usage:{total_tokens:250}});
    };
    const o=fresh(false);await order(e,o,'breaking transport in the city','omar');
    for(let i=0;i<20&&await step(e,o);i++){}
    assert.deepEqual(calls,['research','check','edit','recheck','seo']);
    assert.equal(o.articles.length,1);assert.equal(o.articles[0].check.state,'passed');assert.equal(o.articles[0].status,'review');
    decide(o,'configured-ceo','ceo',o.articles[0].id,'approved','');
    assert.equal(o.articles[0].status,'published');
  } finally{globalThis.fetch=real;}
});
test('aggregated analytics does not invent views',()=>{
  const o=demoSeed(),articleId=o.articles[0].id;
  assert.equal(metrics(o).reads,0);
  const m=metrics(o,[{articleId,count:7,hour:19},{articleId,count:2,hour:20}]);
  assert.equal(m.reads,9);assert.equal(m.hours[19],7);assert.equal(m.top?.title,o.articles[0].title);
});

let seed=0x5170a526;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>9;};
const variations=['valid','one','same group','mismatched excerpt','date conflict','future','old','syndicated','wrong mode','duplicate quote','unknown source','non-Arabic'] as const;
for(let i=0;i<64;i++){
  const variant=variations[random()%variations.length],orderJitter=random()%12;
  test(`seeded workflow case ${i+1}: ${variant}`,()=>{
    const {briefs,sources}=fixtures(p);const b=briefs[0];
    if(variant==='one')b.claims[0].evidence.pop();
    if(variant==='same group')sources[1].group=sources[0].group;
    if(variant==='mismatched excerpt')b.claims[0].evidence[0].quote='this quote does not exist in the declared source';
    if(variant==='date conflict')b.conflict=true;
    if(variant==='future')b.eventDate='2099-01-01';
    if(variant==='old')b.eventDate='2001-01-01';
    if(variant==='syndicated')sources[1].untrusted=true;
    if(variant==='wrong mode')sources[1].demo=false;
    if(variant==='duplicate quote'){sources[1].text=sources[0].text;b.claims[0].evidence[1].quote=sources[0].text;}
    if(variant==='unknown source')b.claims[0].evidence[0].sourceId=uid();
    if(variant==='non-Arabic')b.headline='English only';
    if(orderJitter%2)sources.reverse();
    assert.equal(checkBrief(b,sources,true).state==='passed',variant==='valid');
  });
}
test('all independent-source gate variants are covered directly',()=>{
  const {briefs,sources}=fixtures(p),b=briefs[0];
  assert.equal(checkBrief(b,sources,true).state,'passed');
  assert.equal(checkBrief({...b,conflict:true},sources,true).state,'blocked');
  assert.equal(checkBrief(b,sources.slice(0,1),true).state,'incomplete');
  assert.equal(checkBrief(b,sources,false).state,'incomplete');
  assert.equal(checkBrief({...b,eventDate:'2026-02-30'},sources,true).state,'blocked');
  assert.equal(checkBrief({...b,claims:[]},sources,true).state,'incomplete');
  assert.ok(iso().endsWith('Z'));
});
