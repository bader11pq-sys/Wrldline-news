import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {z} from 'zod';
import {agentIds} from '../shared/agents';
import {dayKey,uid,type Article} from '../shared/schema';
import {decide,discuss,log,metrics,OfficeError,order,ready,reports,step,type ViewCount} from './engine';
import {apiKey,ask,gather,listModels,limitTime,mode,modelProfile,safeUrl,SetupError,type Env} from './integrations';
import {assertLive,demoNew,load,mutate,supa} from './store';
import {officeBucket,officeResource} from './database';

const app=new Hono<{Bindings:Env;Variables:{actor:string}}>();
const id=z.uuid();
const channel=z.enum([...agentIds,'meeting'] as const);
async function body<T extends z.ZodType>(c:{req:{json():Promise<unknown>}},schema:T):Promise<z.infer<T>>{
  const data=schema.safeParse(await c.req.json().catch(()=>null));if(!data.success)throw new OfficeError('Invalid request. Check your inputs.',422);return data.data;
}
app.onError((err,c)=>{if(err instanceof OfficeError)return c.json({error:err.message},err.status as 400);if(err instanceof SetupError)return c.json({error:err.message},503);console.error(err.message);return c.json({error:'The office could not complete this request.'},500);});
app.use('/api/*',async(c,next)=>{await next();c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff');c.header('Referrer-Policy','no-referrer');});
app.use('/api/*',bodyLimit({maxSize:22000,onError:c=>c.json({error:'Request body too large.'},413)}));
app.get('/api/health',c=>c.json({ok:true,demo:mode(c.env),ai:!mode(c.env)&&!!(apiKey(c.env,'groq')||apiKey(c.env,'openrouter')),releases:!mode(c.env)&&!!c.env.RELEASE_SERVICE_URL,images:!mode(c.env)&&!!c.env.IMAGE_API_KEY,site:safeUrl(c.env.SITE_PUBLIC_URL||'https://al-ghaib.us.ci')?.origin}));
app.post('/api/session',async c=>{
  if(mode(c.env)){const token=uid();demoNew(token);return c.json({token,demo:true});}
  assertLive(c.env);
  if(c.env.LOGIN_LIMIT&&!(await c.env.LOGIN_LIMIT.limit({key:c.req.header('CF-Connecting-IP')||'unknown'})).success)throw new OfficeError('محاولات دخول كثيرة. أعد المحاولة بعد دقيقة.',429);
  const input=await body(c,z.object({email:z.email().max(200),password:z.string().min(1).max(200)}));
  const result=await fetch(`${c.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:c.env.SUPABASE_PUBLISHABLE_KEY!,'content-type':'application/json'},body:JSON.stringify(input),signal:limitTime()});
  if(!result.ok)throw new OfficeError('Login failed.',401);
  const data=await result.json() as {access_token:string;user:{id:string}};
  if(data.user.id!==c.env.CEO_USER_ID)throw new OfficeError('CEO access only.',403);
  return c.json({token:data.access_token,demo:false});
});
const publicData=(a:Article)=>({id:a.id,status:'published',title:a.title,topic:a.topic,summary:a.summary,body:a.body,facts:a.brief.claims.map(c=>c.text),developing:a.brief.developing,eventDate:a.brief.eventDate,publishedAt:a.publishedAt,author:'سارة',factChecker:'ليلى',demo:a.demo,breaking:a.breaking,image:a.selectedImage!==undefined&&a.images?.[a.selectedImage]?.url?`/public/articles/${a.id}/cover`:null,sources:a.sources.map(s=>({url:s.url,title:s.title,publisher:s.publisher,publishedAt:s.publishedAt}))});
const isPublic=(a:Article|undefined):a is Article=>!!a&&a.status==='published'&&a.demo===false&&a.check.state==='passed'&&!!a.publishedAt;
app.use('/api/public/articles/*',async(c,next)=>{
  await next();
  if(c.req.method!=='GET'||!c.env.SITE_PUBLIC_URL)return;
  c.header('Vary','Origin',{append:true});
  const origin=c.req.header('Origin');
  if(origin&&origin===safeUrl(c.env.SITE_PUBLIC_URL)?.origin)c.header('Access-Control-Allow-Origin',origin);
});
app.get('/api/public/articles', async c=>{
  if(mode(c.env))return c.json({articles:[],demo:true});
  const rows=await (await supa(c.env,`/rest/v1/${officeResource(c.env,'articles')}?user_id=eq.${encodeURIComponent(c.env.CEO_USER_ID!)}&status=eq.published&order=published_at.desc&select=payload&limit=100`)).json() as {payload:Article}[];
  return c.json({articles:rows.map(r=>r.payload).filter(isPublic).map(publicData),demo:false});
});
app.get('/api/public/articles/:id',async c=>{
  const target=id.safeParse(c.req.param('id'));if(!target.success||mode(c.env))throw new OfficeError('Article not found.',404);
  const rows=await (await supa(c.env,`/rest/v1/${officeResource(c.env,'articles')}?id=eq.${target.data}&user_id=eq.${encodeURIComponent(c.env.CEO_USER_ID!)}&status=eq.published&select=payload&limit=1`)).json() as {payload:Article}[];
  if(!isPublic(rows[0]?.payload)||rows[0].payload.id!==target.data)throw new OfficeError('Article not found.',404);
  return c.json({article:publicData(rows[0].payload),demo:false});
});
app.get('/api/public/articles/:id/cover',async c=>{
  const target=id.safeParse(c.req.param('id'));if(!target.success||mode(c.env))throw new OfficeError('Image not found.',404);
  const rows=await (await supa(c.env,`/rest/v1/${officeResource(c.env,'articles')}?id=eq.${target.data}&user_id=eq.${encodeURIComponent(c.env.CEO_USER_ID!)}&status=eq.published&select=payload&limit=1`)).json() as {payload:Article}[];
  const a=rows[0]?.payload,p=a?.selectedImage===undefined?undefined:a.images?.[a.selectedImage]?.url;
  if(!isPublic(a)||a.id!==target.data||!p||!/^[a-f0-9-]{36}\/[0-2]-[a-f0-9-]{36}\.webp$/.test(p))throw new OfficeError('Image not found.',404);
  const r=await supa(c.env,`/storage/v1/object/authenticated/${officeBucket(c.env)}/${p}`);
  return new Response(r.body,{headers:{'content-type':'image/webp'}});
});
const viewLast=new Map<string,number>();
app.post('/api/public/articles/:id/view',async c=>{
  const target=id.safeParse(c.req.param('id'));
  if(!target.success||mode(c.env))return c.json({ok:true});
  if(c.req.header('Sec-Fetch-Site')==='cross-site')throw new OfficeError('Cross-site submission denied.',403);
  const key=`${c.req.header('CF-Connecting-IP')||'local'}:${target.data}`,time=Date.now();
  if((viewLast.get(key)||0)>time-30000)return c.json({ok:true});
  if(viewLast.size>5000)viewLast.delete(viewLast.keys().next().value!);
  viewLast.set(key,time);
  await supa(c.env,`/rest/v1/rpc/${officeResource(c.env,'office_record_view')}`,{method:'POST',body:JSON.stringify({p_article:target.data})});
  return c.json({ok:true});
});
app.use('/api/office/*',async(c,next)=>{
  const token=c.req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if(!token)throw new OfficeError('Sign in to the office.',401);
  if(mode(c.env)){
    if(!id.safeParse(token).success)throw new OfficeError('Invalid demo session.',401);
    c.set('actor',token);
  }else{
    assertLive(c.env);
    const r=await fetch(`${c.env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:c.env.SUPABASE_PUBLISHABLE_KEY!,authorization:`Bearer ${token}`},signal:limitTime()});
    if(!r.ok)throw new OfficeError('Session expired. Sign in again.',401);
    const {id:userId}=await r.json() as {id:string};
    if(userId!==c.env.CEO_USER_ID)throw new OfficeError('CEO access only.',403);
    c.set('actor',userId);
  }
  await next();
});
const snapshot=async(e:Env,actor:string)=>{
  const state=await load(e,actor);
  const views:ViewCount[]=state.demo||!state.articles.some(a=>a.status==='published')?[]:await (await supa(e,`/rest/v1/rpc/${officeResource(e,'office_views')}`,{method:'POST',body:JSON.stringify({p_user:actor})})).json();
  return {...state,modelProfile:modelProfile(e,state),providers:{openrouter:!state.demo&&!!apiKey(e,'openrouter'),groq:!state.demo&&!!apiKey(e,'groq')},analytics:metrics(state,views)};
};
app.get('/api/office/state',async c=>c.json(await snapshot(c.env,c.get('actor'))));
app.post('/api/office/orders',async c=>{
  const data=await body(c,z.object({text:z.string().trim().min(1).max(3800),channel}));
  const actor=c.get('actor');await mutate(c.env,actor,o=>order(c.env,o,data.text,data.channel));return c.json(await snapshot(c.env,actor),201);
});
app.post('/api/office/chat',async c=>{
  const data=await body(c,z.object({text:z.string().trim().min(1).max(3800),channel}));
  const actor=c.get('actor');await mutate(c.env,actor,o=>discuss(c.env,o,data.text,data.channel));return c.json(await snapshot(c.env,actor));
});
const providerInput=z.enum(['openrouter','groq']),modelId=z.string().trim().regex(/^[a-z0-9_.:/-]{1,140}$/i);
app.get('/api/office/models/:provider',async c=>{
  const p=providerInput.safeParse(c.req.param('provider'));if(!p.success)throw new OfficeError('مزود غير مدعوم.',422);
  return c.json({models:await listModels(c.env,p.data),demo:mode(c.env)});
});
app.put('/api/office/models',async c=>{
  const profile=await body(c,z.object({provider:providerInput,fast:modelId,editor:modelId,checker:modelId})),actor=c.get('actor');
  await mutate(c.env,actor,o=>{o.modelProfile=profile;log(o,'Model routing saved',actor,profile.provider);});
  return c.json(await snapshot(c.env,actor));
});
app.post('/api/office/models/test',async c=>{
  const {tier}=await body(c,z.object({tier:z.enum(['fast','editor','checker'])}));
  const actor=c.get('actor');
  const result=await mutate(c.env,actor,async o=>{
    const profile=modelProfile(c.env,o);
    if(o.demo)return {demo:true,status:'demo',provider:profile.provider,model:profile[tier]};
    try {
      await ask(c.env,o,tier==='fast'?'omar':tier==='editor'?'sara':'layla','Connectivity probe','Reply OK only. Do not access or request editorial data.',16);
      log(o,'Model connection verified',actor,`${profile.provider} ${profile[tier]}`);
      return {demo:false,status:'ok',provider:profile.provider,model:profile[tier]};
    }catch(err){
      const message=err instanceof Error?err.message:'Model connection failed.';
      log(o,'Model connection failed',actor,message);
      return {demo:false,status:'error',provider:profile.provider,model:profile[tier],message};
    }
  });
  return c.json(result);
});
app.post('/api/office/advance',async c=>{
  const actor=c.get('actor'),state=await load(c.env,actor);
  if(state.tasks.some(t=>ready(state,t)||t.kind==='review'&&t.status==='Approved'))await mutate(c.env,actor,o=>step(c.env,o));
  return c.json(await snapshot(c.env,actor));
});
app.post('/api/office/approvals',async c=>{
  const data=await body(c,z.object({ids:z.array(id).min(1).max(20),decision:z.enum(['approved','rejected']),feedback:z.string().max(1500).default(''),imageIndex:z.number().int().min(0).max(2).optional()}));
  if(data.imageIndex!==undefined&&data.ids.length!==1)throw new OfficeError('Select covers per individual draft.',422);
  const actor=c.get('actor');await mutate(c.env,actor,o=>{for(const item of new Set(data.ids))decide(o,o.demo?'demo-ceo':actor,'ceo',item,data.decision,data.feedback,data.imageIndex);});return c.json(await snapshot(c.env,actor));
});
app.patch('/api/office/settings',async c=>{
  const data=await body(c,z.object({dailyLimit:z.number().int().min(1000).max(2000000)}));
  const actor=c.get('actor');await mutate(c.env,actor,o=>{o.dailyLimit=data.dailyLimit;});return c.json(await snapshot(c.env,actor));
});
app.post('/api/office/reports',async c=>{
  const data=await body(c,z.object({type:z.enum(['morning','evening'])})),actor=c.get('actor');
  await mutate(c.env,actor,o=>reports(c.env,o,data.type));return c.json(await snapshot(c.env,actor));
});
app.post('/api/office/picks',async c=>{
  const data=await body(c,z.object({reportId:id,ids:z.array(z.string()).min(1).max(5)})),actor=c.get('actor');
  await mutate(c.env,actor,async o=>{const r=o.reports.find(r=>r.id===data.reportId&&r.type==='morning'),stories=r?.stories.filter(s=>data.ids.includes(s.id));
    if(!stories?.length||stories.length!==new Set(data.ids).size)throw new OfficeError('Select between one and five briefing stories.',422);
    await order(c.env,o,`إعداد النشرة للقصص المختارة: ${stories.map(s=>s.title).join('؛ ')}`,'meeting',stories);
  });return c.json(await snapshot(c.env,actor));
});
app.post('/api/office/read',async c=>{
  const data=await body(c,z.object({id})),actor=c.get('actor');
  await mutate(c.env,actor,o=>{const a=o.articles.find(x=>x.id===data.id&&x.status==='published');if(!a)throw new OfficeError('Article not found.',404);
    o.reads.push({articleId:a.id,day:dayKey(),hour:Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',hour:'2-digit',hourCycle:'h23'}).format()),topic:a.topic});});
  return c.json({ok:true});
});
app.get('/api/office/images/:workflow/:file',async c=>{
  const {workflow,file}=c.req.param();
  if(!id.safeParse(workflow).success||!/^[0-2]-[a-f0-9-]{36}\.webp$/.test(file)||mode(c.env))throw new OfficeError('Image not found.',404);
  const state=await load(c.env,c.get('actor'));
  if(!state.workflows.some(w=>w.id===workflow&&[...(w.images||[]),...Object.values(w.imagesByStory||{}).flat()].some(i=>i.url===`${workflow}/${file}`)))throw new OfficeError('Image not found.',404);
  const r=await supa(c.env,`/storage/v1/object/authenticated/${officeBucket(c.env)}/${workflow}/${file}`);
  return new Response(r.body,{headers:{'content-type':'image/webp'}});
});
app.get('*',c=>c.env.ASSETS?c.env.ASSETS.fetch(c.req.raw):c.notFound());

export function mountedRequest(request:Request) {
  const url=new URL(request.url);
  if(url.pathname.startsWith('/ai-office/')){url.pathname=url.pathname.slice('/ai-office'.length);return new Request(url,request);}
  return request;
}

export {app};
export default {
  fetch(request:Request,e:Env,ctx:Parameters<typeof app.fetch>[2]){
    const url=new URL(request.url);
    if(url.pathname==='/ai-office'){url.pathname+='/';return Response.redirect(url,308);}
    return app.fetch(mountedRequest(request),e,ctx);
  },
  async scheduled(event:{cron:string},env:Env){
    if(mode(env))return;
    assertLive(env);
    const actor=env.CEO_USER_ID!;
    if(event.cron==='0 5 * * *'||event.cron==='0 18 * * *'){await mutate(env,actor,o=>reports(env,o,event.cron==='0 5 * * *'?'morning':'evening'));return;}
    const state=await load(env,actor);
    if(state.tasks.some(t=>ready(state,t)||t.status==='Approved'&&t.kind==='review')){await mutate(env,actor,o=>step(env,o));return;}
    if(env.AUTO_BREAKING==='true'&&apiKey(env,modelProfile(env,state).provider)&&new Date().getUTCMinutes()%5===0){
      const candidates=await gather(env);
      const candidate=candidates.find(s=>Date.parse(s.publishedAt)>Date.now()-30*60000&&/^(عاجل|breaking)\s*[:：|،-]/i.test(s.title)&&!state.workflows.some(w=>w.intent==='breaking'&&w.order.includes(s.title)));
      if(candidate)await mutate(env,actor,o=>order(env,o,`عاجل: ${candidate.title} ${candidate.url}`,'khalid'));
    }
  }
};
