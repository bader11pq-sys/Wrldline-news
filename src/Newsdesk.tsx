import {useState,type FormEvent} from 'react';
import {ArrowLeft,AudioLines,BookOpen,CalendarClock,CheckCircle2,ClipboardList,FileCheck2,Globe2,MessageSquare,Plug,Radio,ShieldCheck,SlidersHorizontal,Users} from 'lucide-react';
import {agentIds,agents,models} from '../shared/agents';
import type {AgentId,Article,ModelProfile,Office,ProviderId,Task} from '../shared/schema';
import type {TeamStatus} from './Floor';

export const names:Record<AgentId,string>={omar:'عمر',sara:'سارة',khalid:'خالد',layla:'ليلى',adam:'آدم',noura:'نورة',faisal:'فيصل',mariam:'مريم'};
export const roles:Record<AgentId,string>={omar:'مدير غرفة الأخبار',sara:'رئيسة التحرير',khalid:'مراسل الأخبار العاجلة',layla:'مدققة الحقائق',adam:'محرر العناوين والمنصات',noura:'مهندسة الموقع',faisal:'محرر الصور',mariam:'محللة الجمهور'};
export const stateAr:Record<string,string>={'Idle':'متاح','Working':'يعمل','Awaiting approval':'بانتظار الاعتماد','In meeting':'في الاجتماع','Queued':'في الطابور','In Progress':'قيد التنفيذ','Waiting for Fact Check':'بانتظار التحقق','Waiting for CEO Approval':'بانتظار اعتمادك','Approved':'معتمد','Rejected':'معاد للتحرير','Done':'مكتمل','Blocked':'متوقف'};
const styles=[
  ['#414039','#d29c72','#4e7261',0],['#382e2a','#d6a27b','#a56b57',1],['#292e28','#c99870','#557789',2],['#5d4657','#d49b80','#806a8f',3],
  ['#40372a','#deb592','#617990',4],['#3f625b','#d2a482','#52786d',3],['#403328','#ba865e','#957656',6],['#442c31','#d8a386','#a06870',7]
] as const;
export function Face({id}:{id:AgentId}){
  const [hair,skin,jacket,shape]=styles[agentIds.indexOf(id)];
  const scarf=shape===3,long=shape===1||shape===7;
  return <svg className="staff-face" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="31" fill={jacket} opacity=".22"/><path d="M3 56q16-20 28-17 24 0 30 20v5H3Z" fill={jacket}/>
    {(scarf||long)&&<path d="M16 33c-2-12 2-20 10-25 18-8 26 7 24 23l1 17-11 3-10-5-14 3Z" fill={hair}/>}
    <path d="M27 36h10v11l-5 4-5-4z" fill={skin}/><ellipse cx="32" cy="27" rx={shape===6?12:11} ry="14" fill={skin}/>
    {!scarf&&<path d={shape===2?'M20 25c-4-21 25-24 24-4l-12-5-8 8z':long?'M19 31c-3-16 7-24 16-21 8 1 12 10 10 17-3-5-7-9-12-12-4 6-8 10-14 13z':'M20 24c-1-12 7-18 16-15 8 2 11 9 8 15l-2-5c-8 0-12-2-16-4z'} fill={hair}/>}
    {scarf&&<path d="M20 32c-4-12 1-24 12-24 13 0 17 11 13 24l-3 8 4 6-16 4-8-5 9-5c-8-1-10-5-11-8zm3-10c-1 8 2 17 9 17 9 0 12-9 10-17-5-7-13-8-19 0z" fill={hair} fillRule="evenodd"/>}
    {(shape===0||shape===6)&&<path d="M23 31q3 4 8 4 7 0 10-4-2 11-9 11t-9-11" fill={hair} opacity=".82"/>}
    <path d="M27 27h1m8 0h1" stroke="#2e342d" strokeWidth="2" strokeLinecap="round"/><path d="M29 34q3 1.8 6 0" stroke="#8e5b52" fill="none" strokeLinecap="round"/>
    {(shape===4||shape===7)&&<path d="M22 25h8v5h-8zm12 0h8v5h-8zm-4 1h4" fill="none" stroke="#3d3939" strokeWidth="1"/>}
    {!scarf&&<path d="m22 45 10 7 10-7-2 18H25z" fill="#eae5ce" opacity=".76"/>}
  </svg>;
}
export const suggestions:Record<AgentId,{label:string;text:string;assignment?:boolean}[]>={
  omar:[{label:'جهّز نشرة اليوم',text:'يا عمر، جهّز نشرة اليوم: ٥ سياسة و٣ اقتصاد و١ قصة متنوعة.',assignment:true},{label:'ما الأولوية الآن؟',text:'يا عمر، ما أولويات الوردية الحالية؟'}],
  sara:[{label:'ناقشي صياغة عنوان',text:'يا سارة، اقترحي صياغة أبسط لهذا العنوان: '},{label:'أفكار تغطية',text:'نريد أفكار تغطية إخبارية قابلة للتحقق.',assignment:true}],
  khalid:[{label:'ابدأ تغطية عاجلة',text:'عاجل: ابحث عن تأكيد مستقل لهذا الخبر: ',assignment:true},{label:'ما المعلومات الناقصة؟',text:'يا خالد، ما المعلومات التي تحتاجها قبل البدء؟'}],
  layla:[{label:'تحققي من ادعاء',text:'تحققي من هذا الادعاء والمصادر: ',assignment:true},{label:'ما معيار التحقق؟',text:'يا ليلى، ما الذي أحتاج إرفاقه حتى تتمكني من التحقق؟'}],
  adam:[{label:'اقترح عنواناً للمنصات',text:'يا آدم، كيف نعرض هذا الخبر دون مبالغة؟ النص: '},{label:'أفكار للجمهور',text:'اقترح أفكاراً لمواد نخدم بها القراء.',assignment:true}],
  noura:[{label:'افحصي بطء الصفحة',text:'يا نورة، الصفحة الرئيسية بطيئة على الهاتف. افحصيها في المرحلة التجريبية.',assignment:true},{label:'ناقشي خللاً',text:'يا نورة، أريد مناقشة خلل قبل إنشاء مهمة. خطوات تكراره: '}],
  faisal:[{label:'جهّز خيارات صورة',text:'يا فيصل، جهز ثلاثة خيارات رسوم تحريرية لهذا الخبر: ',assignment:true},{label:'ناقش فكرة الغلاف',text:'يا فيصل، ما الأنسب لتصوير هذا الموضوع دون إيحاء مضلل؟ '}],
  mariam:[{label:'حللي القراءات',text:'يا مريم، تحليل البيانات والقراءات خلال الشهر الماضي.',assignment:true},{label:'ناقشي المؤشرات',text:'يا مريم، ما الفرق بين المشاهدات والقراء الفريدين؟'}]
};
export function Newsdesk({data,status,switchToChat,open,queue,onFloor}:{data:Office;status:TeamStatus;switchToChat:(id:AgentId)=>void;open:(type:'article'|'task',id:string)=>void;queue:(id:AgentId,text:string,assignment:boolean)=>void;onFloor:()=>void}){
  const latest=data.tasks.slice().reverse(),pending=data.articles.filter(a=>a.status==='review');
  const lanes=[{label:'تكليف وجمع',icon:Radio,items:latest.filter(t=>['research','stage','ideas'].includes(t.kind)&&['Queued','In Progress','Waiting for Fact Check'].includes(t.status))},{label:'تحقق وتحرير',icon:ShieldCheck,items:latest.filter(t=>['edit','check','seo','image'].includes(t.kind)&&['Queued','In Progress','Waiting for Fact Check','Blocked'].includes(t.status))}];
  return <div className="newsdesk" dir="rtl">
    <section className="shift-hero"><div><span className="desk-overline"><i/> غرفة التحرير · توقيت الرياض</span><h2>من التكليف إلى الاعتماد</h2><p>تابع ما يجمعه المراسل، وما توقف في التحقق، وما يحتاج قرارك قبل النشر.</p><div className="desk-actions"><button onClick={()=>queue('omar',suggestions.omar[0].text,true)}><ClipboardList size={16}/> تكليف جديد</button><button onClick={onFloor}><Users size={16}/> عرض مخطط المكتب</button></div></div><div className="desk-rings" aria-hidden="true"><i/><i/><Radio size={37}/></div></section>
    <section className="dispatch" aria-label="مسار الوردية">
      {lanes.map(({label,icon:Icon,items})=><article key={label} className="dispatch-lane"><header><Icon size={17}/><h3>{label}</h3><b>{items.length}</b></header>{items.slice(0,3).map(t=><button key={t.id} onClick={()=>open('task',t.id)}><strong>{roles[t.owner]}</strong><small>{stateAr[t.status]} · {t.priority==='Urgent'?'عاجل':names[t.owner]}</small></button>)}{!items.length&&<p>لا مهام مفتوحة</p>}</article>)}
      <article className="dispatch-lane"><header><FileCheck2 size={17}/><h3>قرار رئيس التحرير</h3><b>{pending.length}</b></header>{pending.slice(0,3).map(a=><button key={a.id} onClick={()=>open('article',a.id)}><strong>{a.title}</strong><small>{a.demo?'مسودة تجريبية':'اجتازت التحقق'}</small></button>)}{!pending.length&&<p>لا مواد بانتظارك</p>}</article>
    </section>
    <section className="staff-section"><div className="staff-heading"><div><span className="desk-overline">مناوبة التحرير</span><h2>فريق غرفة الأخبار</h2></div><span>{agentIds.length} اختصاصات · محادثة مباشرة</span></div><div className="staff-cards">{agentIds.map(id=><button key={id} onClick={()=>switchToChat(id)}><Face id={id}/><span><b>{names[id]}</b><small>{roles[id]}</small><em>{stateAr[status[id]]}</em></span><MessageSquare size={16}/></button>)}</div></section>
  </div>;
}
const tiers={fast:'المهام اليومية · عمر وبقية الفريق',editor:'التحرير النهائي · سارة',checker:'التحقق المستقل · ليلى'} as const;
export function ModelSettings({profile,providers,demo,save,loadModels,test}:{
  profile:ModelProfile;providers:Record<ProviderId,boolean>;demo:boolean;save:(profile:ModelProfile)=>Promise<boolean>;loadModels:(p:ProviderId)=>Promise<string[]>;test:(tier:keyof typeof tiers)=>Promise<{status:string;model:string;message?:string}>;
}){
  const [form,setForm]=useState(profile),[list,setList]=useState<string[]>([]),[tier,setTier]=useState<keyof typeof tiers>('fast'),[pending,setPending]=useState(false),[msg,setMsg]=useState('');
  const dirty=JSON.stringify(form)!==JSON.stringify(profile);
  const run=async(fn:()=>Promise<void>)=>{setPending(true);setMsg('');try{await fn();}catch(e){setMsg(e instanceof Error?e.message:'تعذر إتمام الطلب.');}finally{setPending(false);}};
  const submit=(e:FormEvent)=>{e.preventDefault();void run(async()=>{if(await save(form))setMsg('حُفظ توزيع النماذج. يمكنك الآن اختباره.');else setMsg('تعذّر حفظ التوزيع. راجع رسالة الخطأ.');});};
  return <section className="panel content-panel model-panel" dir="rtl"><div className="staff-heading"><div><span className="desk-overline"><Plug size={14}/> اتصال النماذج</span><h2>اربط الفريق بمزوّد الذكاء الاصطناعي</h2></div><span>{demo?'تجريبي بلا اتصال حقيقي':providers[profile.provider]?'المفتاح موجود؛ اختبر النموذج':'المفتاح غير مضاف'}</span></div>
  <ol className="setup-steps"><li><b>أنشئ مفتاحاً</b><span>من لوحة <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">OpenRouter</a> أو <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Groq</a>.</span></li><li><b>احفظه في الخادم فقط</b><span>Cloudflare → Worker → Settings → Variables and Secrets. لا تلصقه في المحادثة.</span></li><li><b>اجلب النماذج واحفظ ثم اختبر</b><span>اختبار الاتصال المباشر يرسل طلباً قصيراً وقد يُحتسب من الرصيد.</span></li></ol>
  <form onSubmit={submit}><label>المزوّد<select value={form.provider} onChange={e=>{const provider=e.target.value as ProviderId;setForm({provider,...models[provider]});setList([]);setMsg('');}}><option value="openrouter">OpenRouter</option><option value="groq">Groq</option></select></label><div className="model-secret">اسم سرّ الخادم: <code dir="ltr">{form.provider==='groq'?'GROQ_API_KEY':'OPENROUTER_API_KEY'}</code></div>
    <button className="soft" type="button" disabled={pending||(!demo&&!providers[form.provider])} onClick={()=>void run(async()=>{const result=await loadModels(form.provider);setList(result);setMsg(result.length?`تم العثور على ${result.length} نموذجاً${demo?' تجريبياً':''}.`:'لم يرجع المزوّد نماذج متاحة.');})}>جلب قائمة النماذج</button>
    <datalist id="model-ids">{list.map(id=><option key={id} value={id}/>)}</datalist>
    <div className="model-fields">{Object.entries(tiers).map(([key,label])=><label key={key}>{label}<input list="model-ids" dir="ltr" required maxLength={140} pattern={'[a-zA-Z0-9_.:\\/\\-]+'} value={form[key as keyof typeof tiers]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}</div>
    <button className="primary" disabled={pending||!dirty}><CheckCircle2 size={15}/> حفظ التوزيع</button>
  </form><div className="model-test"><label>اختبار المهمة<select value={tier} onChange={e=>setTier(e.target.value as keyof typeof tiers)}>{Object.entries(tiers).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label><button className="soft" disabled={pending||dirty||(!demo&&!providers[profile.provider])} onClick={()=>void run(async()=>{const r=await test(tier);setMsg(r.status==='demo'?'التجربة سليمة. لم يُرسل طلب حقيقي ولم يُحتسب رصيد.':r.status==='ok'?`استجاب النموذج بنجاح: ${r.model}`:r.message||'لم يستجب النموذج.');})}><SlidersHorizontal size={15}/> اختبار الاتصال</button></div>
  <p role="status" aria-live="polite">{msg}</p></section>;
}
