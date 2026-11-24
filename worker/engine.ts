import {z} from 'zod';
import {agentIds,agents} from '../shared/agents';
import {dayKey,iso,uid,type AgentId,type Article,type Brief,type Channel,type Editorial,type Intent,type Office,type Source,type Task,type TaskKind,type Topic,type Workflow} from '../shared/schema';
import {fixtures,mockImages} from './demo';
import {checkBrief} from './factcheck';
import {ask,BudgetError,gather,imageOptions,parseJson,PendingRelease,releaseRequest,research,type Env} from './integrations';

export class OfficeError extends Error {constructor(message:string,public status=400){super(message);}}
export const log=(o:Office,action:string,actor:string,details:string)=>o.logs.push({id:uid(),action,actor,details,createdAt:iso()});
const say=(o:Office,channel:Channel,author:'ceo'|AgentId,text:string)=>o.messages.push({id:uid(),channel,author,text,createdAt:iso()});
const allPlan=(p=0,e=0,m=0):Record<Topic,number>=>({'سياسة':p,'اقتصاد':e,'متنوع':m});
const limits=(text:string):Record<Topic,number>|undefined=>{
  const s=text.replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  const find=(r:RegExp)=>{const v=s.match(r);return v?Math.min(Number(v[1]),8):0};
  const p=find(/(\d+)\s*(?:politic|سياس)/i),e=find(/(\d+)\s*(?:econom|اقتصاد)/i),m=find(/(\d+)\s*(?:attractive|feature|متنوع|قصة)/i);
  return p+e+m?allPlan(p,e,m):undefined;
};
export function classify(text:string,channel:Channel):Intent|undefined {
  if(channel==='meeting') return 'meeting';
  if(channel==='noura'||/homepage|website|staging|performance|bug|موقع|مرحلة تجريب|بطء/i.test(text)) return 'website';
  if(channel==='layla'||/\bverify\b|\bfact.check\b|is this news confirmed|تحقق|تأكد|تدقيق/.test(text.toLowerCase())) return 'verify';
  if(channel==='faisal'||/\b(image|images|thumbnail|illustration)\b|صورة|صور/.test(text.toLowerCase())) return 'images';
  if(channel==='mariam'||/analytics|reads|قراءات|تحليل البيانات/i.test(text)) return 'analytics';
  if(/idea room|ideas|أفكار/i.test(text)) return 'ideas';
  if(/briefing|morning meeting|اجتماع|إحاطة/i.test(text)) return 'meeting';
  if(/today.s edition|daily edition|جهز النشرة|أعد النشرة|نشرة|إصدار اليوم/i.test(text)) return 'edition';
  if(channel==='khalid'||/breaking|عاجل/i.test(text)) return 'breaking';
  if(channel!=='omar') return 'direct';
  return undefined;
}
const labels:Record<TaskKind,string>={research:'Research stories',check:'Fact-check claims',edit:'Edit Arabic copy',seo:'Prepare SEO & social',image:'Create image options',review:'CEO review',stage:'Prepare staging preview',ideas:'Develop story ideas',analytics:'Analyze readership',reply:'Respond to CEO'};
function createTask(o:Office,w:Workflow,kind:TaskKind,owner:AgentId,dependencies:string[]=[],attempt=1,feedback?:string) {
  const i=o.tasks.filter(t=>t.workflowId===w.id).length;
  const t:Task={id:uid(),workflowId:w.id,title:labels[kind],owner,kind,status:'Queued',priority:w.intent==='breaking'?'Urgent':w.intent==='website'?'High':'Normal',createdAt:iso(),dueAt:new Date(Date.now()+(w.intent==='breaking'?5:(i+1)*5)*60000).toISOString(),dependencies,inputs:{order:w.order},approval:'none',attempt,feedback};
  o.tasks.push(t);return t;
}
function newPlan(o:Office,w:Workflow) {
  const t=(k:TaskKind,a:AgentId,d:Task[]=[])=>createTask(o,w,k,a,d.map(a=>a.id));
  switch(w.intent){
    case 'edition':case 'breaking':case 'verify':{
      const r=t('research','khalid'), c=t('check','layla',[r]);if(w.intent==='verify') break;
      const s=t('edit','sara',[c]),seo=t('seo','adam',[s]),image=t('image','faisal',[s]);t('review','omar',[seo,image]);break;
    }
    case 'website': {const s=t('stage','noura');t('review','omar',[s]);break;}
    case 'ideas': {const s=t('ideas','adam');t('ideas','sara',[s]);break;}
    case 'meeting':t('research','khalid');break;
    case 'images':t('image','faisal');break;
    case 'analytics':t('analytics','mariam');break;
    case 'direct':t('reply',w.channel==='meeting'?'omar':w.channel);break;
  }
}
export async function order(e:Env,o:Office,text:string,channel:Channel,selection?:Source[]) {
  const mention=text.match(/@([a-z]+|[\u0600-\u06ff]+)/i)?.[1]?.toLowerCase();
  const target=agentIds.find(id=>id===mention||agents[id].ar===mention);
  if(target&&channel!=='meeting') channel=target;
  say(o,channel,'ceo',text);
  let intent=selection?'edition':classify(text,channel);
  const stripped=text.replace(/@\S+|omar|عمر|please|مرحبا|مرحباً/ig,'').trim();
  if(!intent&&!o.demo&&stripped.length>5){
    try {intent=z.enum(['edition','breaking','verify','website','meeting','ideas','images','analytics','direct']).safeParse(parseJson(await ask(e,o,'omar','Classify intent. Output only one JSON string: edition, breaking, verify, website, meeting, ideas, images, analytics, direct. If no actionable request choose direct.',text,45))).data;}catch(err){say(o,channel,'omar',err instanceof Error?err.message:'تعذر تصنيف الطلب.');return;}
  }
  if(!intent||(intent==='verify'&&!o.demo&&stripped.length<32)||intent==='direct'&&channel==='omar') {
    say(o,channel,channel==='layla'?'layla':'omar','ما المطلوب تحديداً؟ أرسل عنوان الخبر أو رابطه، أو اختر إعداد النشرة أو طلباً محدداً.');return;
  }
  const duplicate=o.workflows.find(w=>w.intent===intent&&w.order.toLowerCase()===text.toLowerCase()&&o.tasks.some(t=>t.workflowId===w.id&&['Queued','In Progress','Waiting for Fact Check','Waiting for CEO Approval'].includes(t.status)));
  if(duplicate){say(o,channel,'omar','هذا الطلب مسجل بالفعل. سأتابع مسار العمل الحالي دون إنشاء نسخة أخرى.');return;}
  const plan=selection?allPlan(selection.length,selection.length,selection.length):intent==='edition'?(limits(text)||allPlan(4,3,1)):intent==='meeting'?allPlan(5,4,1):allPlan(1);
  const w:Workflow={id:uid(),intent,order:text,channel,createdAt:iso(),plan,sources:selection,candidateIds:selection?.map(s=>s.id)};
  o.workflows.push(w);newPlan(o,w);
  const planText=o.tasks.filter(t=>t.workflowId===w.id).map(t=>`${agents[t.owner].ar}: ${t.title} (${new Date(t.dueAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit'})})`).join('\n');
  if(intent!=='direct') say(o,channel,'omar',`الخطة جاهزة${intent==='edition'?` (${plan['سياسة']} سياسة، ${plan['اقتصاد']} اقتصاد، ${plan['متنوع']} متنوع)` :''}. هذه أوقات الاستحقاق بتوقيت الرياض:\n${planText}\nلن يُنشر شيء من دون موافقتك.`);
  log(o,'Plan created','omar',text);
}
export const chatPrompts:Record<AgentId,string>={omar:'أساعدك على ترتيب الأولويات وتحديد من يستلم كل قصة. إذا رغبت بالتنفيذ، حوّل الرسالة إلى تكليف.',sara:'أرسل العنوان أو الفقرة التي تريد مناقشتها. سأوضح أين يمكن تبسيطها دون تغيير الوقائع.',khalid:'أرسل رابط الخبر أو المنطقة والوقت. سأوضح ما يلزم جمعه قبل بدء التغطية.',layla:'أرسل الادعاء والمصدر وتاريخه. أحتاج مصدرين مستقلين قبل وصفه بالمؤكد.',adam:'أرسل الملخص والجمهور المقصود لأقترح طريقة عرضه دون مبالغة.',noura:'أرسل رابط الصفحة، الجهاز والخطوات التي تكرر المشكلة. يبقى العمل الفعلي في بيئة التجربة.',faisal:'أرسل موضوع التغطية وأبعاد الصورة. أفضل رسماً تحريرياً واضحاً بدلاً من صورة توهم بأنها من الحدث.',mariam:'أستطيع مناقشة القراءات الفعلية المتاحة. المشاهدات لا تعني عدد القراء الفريدين.'};
export async function discuss(e:Env,o:Office,text:string,channel:Channel){
  const mention=text.match(/@([a-z]+|[\u0600-\u06ff]+)/i)?.[1]?.toLowerCase();
  const requested=agentIds.find(id=>id===mention||agents[id].ar===mention);
  const employee=requested??(channel==='meeting'?'omar':channel);
  const destination=channel==='meeting'?channel:employee;
  say(o,destination,'ceo',text);
  let reply=chatPrompts[employee];
  if(!o.demo){
    try {reply=await ask(e,o,employee,'Private discussion only; reply in clear Arabic, offer practical guidance from the supplied data, do not start tasks, do not claim work was executed. If evidence is insufficient say so.',{text,ownTasks:o.tasks.filter(s=>s.owner===employee).slice(-3).map(s=>({title:s.title,status:s.status})),analytics:employee==='mariam'?metrics(o):undefined},430);}
    catch(err){reply=err instanceof Error?`تعذّرت الإجابة الآن: ${err.message}`:'تعذّرت الإجابة الآن.';}
  }else reply=`${reply}\nهذه محادثة تجريبية ولا تبدأ عملاً تلقائياً.`;
  say(o,destination,employee,reply);log(o,'Private discussion',''+employee,agents[employee].ar);
}

export type ViewCount={articleId:string;hour:number;count:number};
export function metrics(o:Office,aggregated:ViewCount[]=[]){
  const articles:Record<string,number>={}, topics:Record<string,number>={}, hours=Array<number>(24).fill(0);
  for(const r of [...o.reads.map(x=>({articleId:x.articleId,hour:x.hour,count:1})),...aggregated]){
    const a=o.articles.find(a=>a.id===r.articleId);if(!a||r.hour<0||r.hour>23)continue;
    articles[r.articleId]=(articles[r.articleId]||0)+r.count;topics[a.topic]=(topics[a.topic]||0)+r.count;hours[r.hour]+=r.count;
  }
  const top=Object.entries(articles).sort((a,b)=>b[1]-a[1])[0];
  return {reads:hours.reduce((a,b)=>a+b,0),topics,hours,top:top?{title:o.articles.find(a=>a.id===top[0])?.title??'',count:top[1]}:null};
}
const refsFor=(w:Workflow,i:number)=>(w.sources||[]).filter(s=>w.briefs![i].claims.some(c=>c.evidence.some(ev=>ev.sourceId===s.id)));
const good=(w:Workflow)=>(w.briefs||[]).map((b,i)=>({b,i})).filter(({i})=>w.checks?.[i]?.state==='passed');
const editorialReady=(w:Workflow)=>good(w).filter(({i})=>w.edit?.[i]);
const editorialSchema=z.object({title:z.string().min(6).max(170),summary:z.string().min(20).max(850),body:z.array(z.string().min(20).max(1100)).min(2).max(22)});
export function editorialFormat(copy:Editorial,breaking:boolean,deep=false){
  const words=(copy.summary+' '+copy.body.join(' ')).trim().split(/\s+/).length;
  const [min,max]=breaking?[150,250]:deep?[1000,1500]:[500,800];
  const arabic=(s:string)=>/[؀-ۿ]/.test(s)&&!/[A-Za-z]{3,}/.test(s);
  return words>=min&&words<=max&&[copy.title,copy.summary,...copy.body].every(arabic);
}
async function finalEdit(e:Env,o:Office,w:Workflow,b:Brief,i:number,feedback:string):Promise<Editorial|null>{
  const deep=/deep analysis|تحليل معمق|تحليل عميق/i.test(w.order),breaking=w.intent==='breaking';
  const scope=breaking?'150 to 250':deep?'1000 to 1500':'500 to 800';
  const data={brief:b,sources:refsFor(w,i),feedback,previous:w.revisionOf?o.articles.find(x=>x.id===w.revisionOf)?.body:undefined};
  const text=await ask(e,o,'sara',`Return JSON object {title,summary,body:[short paragraphs]} in Arabic only, with ${scope} total words in summary and body. Never copy source sentences or introduce any new fact, quote, date or context unless it is in the independently checked claim list. If there is not enough evidence to reach the length naturally, return null, do not pad.`,data,deep?4500:breaking?1200:2700);
  const result=editorialSchema.safeParse(parseJson(text));
  if(!result.success||!editorialFormat(result.data,breaking,deep))return null;
  const reviewed=z.object({passed:z.boolean()}).safeParse(parseJson(await ask(e,o,'layla','Independently verify revised copy against ONLY the approved brief and evidence. Reject any added fact, implied conclusion, stale event presented as new, unattributed near-copy, or mismatch. Return only JSON {passed:boolean}.',{...data,copy:result.data},120)));
  return reviewed.success&&reviewed.data.passed?result.data:null;
}
function articleFor(o:Office,w:Workflow,i:number) {
  const brief=w.briefs![i], copy=w.edit?.[i];if(!copy)return;
  const article:Article={id:uid(),workflowId:w.id,...copy,topic:brief.topic,brief,check:w.checks![i],sources:refsFor(w,i),status:'review',author:'sara',factChecker:'layla',createdAt:iso(),demo:o.demo,seo:w.seo?.[i],images:w.imagesByStory?.[i]??w.images,breaking:w.intent==='breaking'};
  o.articles.push(article);
}

async function execute(e:Env,o:Office,w:Workflow,t:Task) {
  const demo=o.demo, feedback=t.feedback?`\nCEO feedback: ${t.feedback}`:'';
  switch(t.kind){
    case 'research':{
      if(w.intent==='meeting'){
        const report=await reports(e,o,'morning');
        t.output=report.text;break;
      }
      const maxSelected=w.candidateIds?.length||Infinity;
      const plans=w.candidateIds?.length&&demo?allPlan(Math.min(3,maxSelected),Math.max(0,maxSelected-3)):w.plan;
      const result=demo?fixtures(plans,w.intent==='verify'||/one source|single source|مصدر واحد/i.test(w.order)):await research(e,o,w.order+feedback,w.plan,w.candidateIds?.length?w.sources:undefined);
      result.briefs=result.briefs.slice(0,maxSelected);
      w.briefs=result.briefs;w.sources=result.sources;t.sources=result.sources;t.output=`مواد بحثية: ${result.briefs.length} | مصادر مرصودة: ${result.sources.length}`;
      t.status='Waiting for Fact Check';break;
    }
    case 'check':{
      if(w.briefs?.length){
        w.checks??=[];
        const batch=demo?w.briefs.entries():w.briefs.map((b,i)=>[i,b] as const).filter(([i])=>!w.checks?.[i]).slice(0,1);
        for(const [i,b] of batch){
          const passes=checkBrief(b,w.sources||[],demo);
          if(!demo&&passes.state==='passed'){
            try {
              const verdict=z.object({state:z.enum(['passed','incomplete','blocked']),reasons:z.array(z.string().max(250)).min(1).max(9)}).parse(parseJson(await ask(e,o,'layla','Return only JSON object {state,reasons}. Reject unless both distinct true primary origins entail every claim AND headline and event date, including dates/names and uncertainty. Excerpts alone can be insufficient. When in doubt choose incomplete.',{brief:b,sources:refsFor(w,i)},550)));
              passes.state=verdict.state;passes.reasons=verdict.reasons;
            } catch(err){if(err instanceof BudgetError)throw err;passes.state='incomplete';passes.reasons=['تعذر الحصول على حكم مستقل صالح من المدققة.'];}
          }
          w.checks[i]=passes;
        }
        if(w.checks.length<w.briefs.length){t.status='Queued';t.output=`Fact check ${w.checks.length}/${w.briefs.length}`;break;}
      }
      o.tasks.filter(x=>t.dependencies.includes(x.id)).forEach(x=>x.status='Done');
      t.output=good(w).length ? `اجتازت التدقيق ${good(w).length} مادة. `+(w.checks||[]).filter(c=>c.state!=='passed').flatMap(c=>c.reasons).join(' ') : `لم يتأكد بعد. ${(w.checks||[]).flatMap(c=>c.reasons).join(' ')||'لا توجد مواد ذات أدلة كافية.'}`;
      if(!good(w).length)t.status='Blocked';
      break;
    }
    case 'edit':{
      w.edit??={};
      const remaining=good(w).filter(({i})=>!(i in w.edit!));
      for(const {b,i} of demo?remaining:remaining.slice(0,1)){
        if(demo){const title=t.feedback?`متابعة تدريبية: ${b.headline}`:b.headline;w.edit[i]={title,summary:b.claims[0].text,body:[b.claims[0].text,'هذه صياغة تجريبية تشرح سير المراجعة، وليست خبراً حقيقياً.',...(t.feedback?['أعيد تحرير العنوان بعد مراجعة الرئيس التنفيذي.']:[])]};}
        else {try {w.edit[i]=await finalEdit(e,o,w,b,i,feedback);}catch(err){if(err instanceof BudgetError)throw err;w.edit[i]=null;}}
      }
      if(good(w).some(({i})=>!(i in w.edit!))){t.status='Queued';t.output=`Editorial review ${Object.keys(w.edit).length}/${good(w).length}`;break;}
      t.output=`${editorialReady(w).length} مادة جاهزة؛ ${good(w).length-editorialReady(w).length} غير مكتملة بعد مراجعة النص النهائي.`;
      if(!editorialReady(w).length)t.status='Blocked';
      break;
    }
    case 'seo':{
      w.seo??={};const left=editorialReady(w).filter(({i})=>!(i in w.seo!));
      for(const {b,i} of demo?left:left.slice(0,1))w.seo[i]=demo?`عنوان: ${b.headline}\nوصف: متابعة توضيحية لموضوع تجريبي.\nعنوان ٢: ماذا نعرف عن المقترح؟\nعنوان ٣: أبرز النقاط التي طُرحت للنقاش\nإكس: أبرز النقاط باختصار\nإنستغرام: ملخص بصري للمقترح\nواتساب: اقرأ ملخص المتابعة`:await ask(e,o,'adam','Produce Arabic SEO and social copy for this brief. Do not add facts.',b,450);
      if(editorialReady(w).some(({i})=>!(i in w.seo!)))t.status='Queued';
      t.output=Object.values(w.seo).join('\n\n');break;
    }
    case 'image':{
      if(w.intent==='images')w.images=demo?mockImages:await imageOptions(e,w.id,w.order);
      else {
        w.imagesByStory??={};const left=editorialReady(w).filter(({i})=>!(i in w.imagesByStory!));
        for(const {b,i} of demo||!e.IMAGE_API_KEY?left:left.slice(0,1)){
          try {w.imagesByStory[i]=demo?mockImages:await imageOptions(e,w.id,b.headline);}
          catch{w.imagesByStory[i]=[];log(o,'Image generation unavailable','faisal',b.headline);}
        }
        if(editorialReady(w).some(({i})=>!(i in w.imagesByStory!)))t.status='Queued';
      }
      const imageCount=w.images?.length??Object.values(w.imagesByStory||{}).reduce((a,b)=>a+b.length,0);
      t.output=imageCount?`${imageCount} خيارات توضيحية ${demo?'تدريبية':''}.`:'لم تُنشأ صور. راجع اتصال خدمة الصور.';
      break;
    }
    case 'stage': {
      if(demo) { w.release={commit:'d'.repeat(40),preview:'#staging',report:'تمرين محاكاة: لم يتم تعديل أي مستودع أو رفع أي إصدار.',testsPassed:true};}
      else {const r=await releaseRequest(e,'stage',w.id+':'+t.attempt,w.order+feedback);if(!('preview' in r))throw new Error('Invalid staging receipt');w.release=r;}
      t.output=w.release.report;if(!w.release.testsPassed)t.status='Blocked';break;
    }
    case 'review': {
      if(w.intent!=='website')editorialReady(w).forEach(({i})=>articleFor(o,w,i));
      t.output=w.intent==='website'?'Staging preview ready for CEO decision.':`${editorialReady(w).length} مادة بانتظار قرار الرئيس التنفيذي.`;
      t.status='Waiting for CEO Approval';t.approval='pending';break;
    }
    case 'ideas': {
      const previous=o.tasks.find(x=>x.workflowId===w.id&&x.kind==='ideas'&&x.owner==='adam')?.output;
      t.output=demo?'١. كيف يتغير التنقل اليومي؟\n٢. كلفة السلة الأسبوعية\n٣. من يراجع ميزانية الحي؟\n٤. كيف تقاس جودة الخدمات؟\n٥. حكايات المكتبات المحلية':await ask(e,o,t.owner,'Propose or refine exactly five original Arabic reporting ideas, each with verification approach.',{order:w.order,previous});
      break;
    }
    case 'analytics': {
      const rows:ViewCount[]=demo?[]:await (await fetch(`${e.SUPABASE_URL}/rest/v1/rpc/office_views`,{method:'POST',headers:{apikey:e.SUPABASE_SERVICE_ROLE_KEY!,authorization:`Bearer ${e.SUPABASE_SERVICE_ROLE_KEY!}`,'content-type':'application/json'},body:JSON.stringify({p_user:e.CEO_USER_ID}),signal:AbortSignal.timeout(10000)})).json();
      const m=metrics(o,rows);t.output=demo?`المكتب التدريبي: ${m.reads} مشاهدة مسجلة. لا تمثل المشاهدات زواراً فريدين.`:await ask(e,o,'mariam','Summarize measured readership over 30 days with one concrete recommendation and limitations.',m);break;
    }
    case 'reply':{
      t.output=demo?`وضع العرض: ${agents[t.owner].ar} هنا. ${t.owner==='sara'?'أرسل العنوان والنص المرجعي لأقترح صياغة عربية واضحة.':'سأساعدك ضمن صلاحياتي. لا ينشر أي موظف المواد.'}\nطلبك: ${w.order}`:await ask(e,o,t.owner,'Respond to CEO. Do not claim actions not present in tool results.',{message:w.order,feedback,ownTasks:o.tasks.filter(x=>x.owner===t.owner&&x.output).slice(-3).map(x=>x.output?.slice(0,350))});break;
    }
  }
}
export function ready(o:Office,t:Task){
  return t.status==='Queued'&&t.dependencies.every(id=>o.tasks.some(x=>x.id===id&&(x.status==='Done'||(t.kind==='check'&&x.status==='Waiting for Fact Check'))));
}
export async function step(e:Env,o:Office):Promise<boolean>{
  const releaseTask=o.tasks.find(t=>t.status==='Approved'&&t.kind==='review'&&o.workflows.some(w=>w.id===t.workflowId&&w.intent==='website'));
  if(releaseTask){
    const w=o.workflows.find(x=>x.id===releaseTask.workflowId)!;
    const a=o.approvals.findLast(x=>x.targetId===releaseTask.id&&x.decision==='approved');
    if(!a||!w.release?.testsPassed)throw new OfficeError('Deployment requires a tested staging receipt and CEO approval.',409);
    try {
      if(!o.demo){const r=await releaseRequest(e,'deploy',w.id+':'+releaseTask.attempt,w.order,w.release.commit);if(!('deploymentUrl' in r))throw new Error('No production receipt');w.release.deploymentUrl=r.deploymentUrl;}
      releaseTask.status='Done';releaseTask.output=o.demo?'Demo only: no production deployment.':w.release.deploymentUrl;
      log(o,o.demo?'Demo deploy simulated':'Production deployed',a.actor,`${w.release.commit}; approved at ${a.createdAt}`);
    } catch(err){if(err instanceof PendingRelease){releaseTask.output=err.message;return false;}releaseTask.status='Blocked';releaseTask.output=err instanceof Error?err.message:'Deploy failed';log(o,'Deployment failed','system',releaseTask.output);}
    return true;
  }
  const t=o.tasks.find(x=>x.priority==='Urgent'&&ready(o,x))||o.tasks.find(x=>ready(o,x));if(!t)return false;
  const w=o.workflows.find(x=>x.id===t.workflowId)!;t.status='In Progress';
  try {await execute(e,o,w,t);if(t.status==='In Progress')t.status='Done';}
  catch(err){
    const message=err instanceof Error?err.message:'Unknown task error';
    if(err instanceof PendingRelease){t.status='Queued';t.output=message;return false;}
    if(err instanceof BudgetError){t.status='Queued';if(t.output!==message){t.output=message;say(o,w.channel,'omar',message);log(o,'Budget pause','omar',message);}return false;}
    t.status='Blocked';t.output=message;
  }
  if(t.status==='Blocked'){
    const pending=[t.id];for(const x of o.tasks){if(x.status==='Queued'&&x.dependencies.some(id=>pending.includes(id))){x.status='Blocked';x.output='Dependency did not pass.';pending.push(x.id);}}
  }
  log(o,t.status,t.owner,`${t.title}${t.output?': '+t.output.slice(0,180):''}`);
  if(t.output&&!ready(o,t)&&(['reply','ideas','analytics','image','check'].includes(t.kind)||t.kind==='stage'&&t.status==='Blocked'))say(o,w.channel,t.owner,t.output);
  const open=o.tasks.some(x=>x.workflowId===w.id&&['Queued','In Progress','Waiting for Fact Check'].includes(x.status));
  if(!open&&!w.summarySent){w.summarySent=true;const a=o.articles.filter(a=>a.workflowId===w.id&&a.status==='review').length;
    if(w.intent!=='direct')say(o,w.channel,'omar',`انتهى العمل على الطلب. ${a?`${a} مسودة جاهزة لقرارك.`:t.status==='Blocked'?`توقف المسار: ${t.output}`:t.output||'يمكنك مراجعة سجل المهام.'}`);}
  return true;
}

export function decide(o:Office,actor:string,role:string,id:string,decision:'approved'|'rejected',feedback:string,imageIndex?:number) {
  if(role!=='ceo')throw new OfficeError('Only the CEO can make this decision.',403);
  if(decision==='rejected'&&!feedback.trim())throw new OfficeError('Add feedback for the revision.',422);
  const article=o.articles.find(x=>x.id===id), task=o.tasks.find(t=>t.id===id&&t.kind==='review'),w=o.workflows.find(x=>x.id===(article?.workflowId||task?.workflowId));
  if(!w||(!article&&!task))throw new OfficeError('Approval item not found.',404);
  if(article&&article.status!=='review'||!article&&(task?.status!=='Waiting for CEO Approval'||w.intent!=='website'))throw new OfficeError('This item is no longer pending.',409);
  if(decision==='approved'){
    if(article){
      if(article.check.state!=='passed'||checkBrief(article.brief,article.sources,o.demo).state!=='passed'||article.demo!==o.demo)throw new OfficeError('Independent fact check must pass before publication.',409);
      if(imageIndex!==undefined){if(!article.images?.[imageIndex])throw new OfficeError('Image selection not found.',422);article.selectedImage=imageIndex;}
      article.status='published';article.publishedAt=iso();log(o,o.demo?'Demo article published':'Article published',actor,article.title);
    } else {
      if(!w.release?.testsPassed)throw new OfficeError('Staging tests have not passed.',409);
      task!.status='Approved';task!.approval='approved';log(o,'Staging approved',actor,w.release.commit);
    }
  } else {
    if(article){
      article.status='rejected';
      const revised:Workflow={...w,id:uid(),revisionOf:article.id,order:`راجِع هذا الخبر: ${article.title}\nملاحظات الرئيس: ${feedback}`.slice(0,3900),createdAt:iso(),briefs:undefined,checks:undefined,edit:undefined,seo:undefined,images:undefined,imagesByStory:undefined,summarySent:false,plan:allPlan(+(article.topic==='سياسة'),+(article.topic==='اقتصاد'),+(article.topic==='متنوع'))};
      o.workflows.push(revised);newPlan(o,revised);o.tasks.filter(t=>t.workflowId===revised.id).forEach(t=>{t.feedback=feedback;t.attempt++;});
      say(o,w.channel,'sara',`وصلت ملاحظاتك. ستعود المادة إلى مسار التحرير والتدقيق: ${feedback}`);
    } else {
      task!.status='Rejected';task!.approval='rejected';task!.feedback=feedback;w.summarySent=false;w.release=undefined;
      const s=createTask(o,w,'stage','noura',[],task!.attempt+1,feedback);createTask(o,w,'review','omar',[s.id],task!.attempt+1,feedback);
      say(o,w.channel,'noura',`سأعيد تجهيز المعاينة وفق ملاحظاتك: ${feedback}`);
    }
    log(o,'CEO requested revision',actor,feedback);
  }
  if(article&&!o.articles.some(a=>a.workflowId===w.id&&a.status==='review')){
    const review=o.tasks.findLast(x=>x.workflowId===w.id&&x.kind==='review');
    if(review){review.status=o.articles.some(a=>a.workflowId===w.id&&a.status==='published')?'Done':'Rejected';review.approval=review.status==='Done'?'approved':'rejected';review.feedback=feedback;}
  }
  o.approvals.push({id:uid(),targetId:id,decision,feedback,actor,createdAt:iso()});
}

export async function reports(e:Env,o:Office,type:'morning'|'evening'){
  const day=dayKey(), prior=o.reports.find(x=>x.type===type&&x.day===day);if(prior)return prior;
  const stories=type==='morning'?(o.demo?fixtures(allPlan(5,3,2)).sources.filter(s=>s.group==='fixture-a'):await gather(e)).slice(0,10):[];
  const text=type==='morning'?`إحاطة الصباح: ${stories.length} عناوين مرصودة، غير معتمدة للنشر.`:`تقرير المساء: نُشر ${o.articles.filter(a=>a.publishedAt&&dayKey(new Date(a.publishedAt))===day).length}، تعطل ${o.tasks.filter(t=>t.status==='Blocked'&&dayKey(new Date(t.createdAt))===day).length}، وبقي ${o.tasks.filter(t=>t.status==='Queued').length} في قائمة الغد.`;
  const r={id:uid(),day,type,createdAt:iso(),text,stories};o.reports.push(r);
  if(type==='morning'){say(o,'meeting','omar',text);say(o,'meeting','khalid',stories.length?'العناوين في الإحاطة مرشحة للبحث وليست أخباراً معتمدة.':'لا توجد عناوين موثقة في الموجز الآن.');say(o,'meeting','sara','اختر ما يستحق المتابعة، وسأبدأ بعد اكتمال التدقيق.');}
  log(o,`${type==='morning'?'Morning briefing':'End-of-day report'} ready`,'omar',text);
  return r;
}
