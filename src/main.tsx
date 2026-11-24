import React,{Component,Suspense,lazy,useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {Activity,ArrowDownRight,ArrowLeft,ArrowRight,ArrowUpRight,AudioLines,BarChart3,Box,CalendarDays,Check,ChevronDown,ChevronRight,CircleHelp,ClipboardList,Clock3,Command,DoorOpen,FileCheck2,FileText,Globe2,LayoutDashboard,LayoutGrid,Layers3,Menu,MessageSquare,Mic,Newspaper,Plus,Send,Settings2,ShieldCheck,Users,Volume2,X} from 'lucide-react';
import {agentIds,agents} from '../shared/agents';
import {dayKey,type AgentId,type Article,type Channel,type ModelProfile,type Office,type ProviderId,type Source,type Task} from '../shared/schema';
import Floor,{type TeamStatus} from './Floor';
import {Face,ModelSettings,Newsdesk,names,roles,stateAr,suggestions} from './Newsdesk';
import './style.css';

const Office3D=lazy(()=>import('./Office3D'));
type Snapshot=Office&{modelProfile:ModelProfile;providers:Record<ProviderId,boolean>;analytics:{reads:number;topics:Record<string,number>;hours:number[];top:{title:string;count:number}|null}};
type Page='desk'|'office'|'dashboard'|'approvals'|'tasks'|'meeting'|'activity'|'settings'|'news';
type Health={demo:boolean;ai:boolean;releases:boolean;images:boolean;site?:string};
type PublicArticle={id:string;title:string;topic:string;summary:string;body:string[];facts:string[];developing:string[];eventDate:string;publishedAt:string;author:string;factChecker:string;demo:boolean;image?:string;sources:{url:string;title:string;publisher:string;publishedAt:string}[]};
const raw=(window as Window&{__OFFICE_API__?:string}).__OFFICE_API__||'';
const base=raw.startsWith('__PORT_')?(location.pathname.startsWith('/ai-office/')?'/ai-office':''):raw.replace(/\/$/,'');
async function request<T>(path:string,token?:string,method='GET',data?:unknown):Promise<T>{
  const r=await fetch(`${base}/api${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  if(!r.ok){const j=await r.json().catch(()=>null);throw Object.assign(new Error(j?.error||`Request failed (HTTP ${r.status}).`),{status:r.status});}
  return r.json();
}
const time=(date:string|Date)=>new Date(date).toLocaleTimeString('en-GB',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit'});
const date=(value:string|Date)=>new Date(value).toLocaleDateString('ar-SA-u-ca-gregory',{timeZone:'Asia/Riyadh',day:'numeric',month:'short',year:'numeric'});
const active=(t:Task)=>['Queued','In Progress','Waiting for Fact Check','Approved'].includes(t.status);
const nav=[
  {id:'desk',name:'غرفة الأخبار',icon:LayoutDashboard},{id:'office',name:'مخطط المكتب',icon:LayoutGrid},{id:'dashboard',name:'لوحة القيادة',icon:BarChart3},{id:'tasks',name:'لوحة المهام',icon:ClipboardList},{id:'approvals',name:'قرارات النشر',icon:FileCheck2},{id:'meeting',name:'غرفة الاجتماع',icon:Users},{id:'activity',name:'سجل العمل',icon:Activity}
] as const;
const quick=[{title:'جهّز نشرة اليوم',detail:'من البحث إلى المراجعة',icon:Newspaper,text:suggestions.omar[0].text,agent:'omar'},{title:'تحقق من خبر',detail:'فرز الأدلة والمصادر',icon:ShieldCheck,text:suggestions.layla[0].text,agent:'layla'},{title:'افحص الموقع',detail:'في البيئة التجريبية فقط',icon:Layers3,text:suggestions.noura[0].text,agent:'noura'}] as const;
const cx=(...s:(string|false|undefined)[])=>s.filter(Boolean).join(' ');
const rtl=(s:string)=>/[\u0600-\u06ff]/.test(s);
const useWebGL=()=>{try{const c=document.createElement('canvas');const gl=c.getContext('webgl2',{failIfMajorPerformanceCaveat:true});gl?.getExtension('WEBGL_lose_context')?.loseContext();return !!gl;}catch{return false;}};
function Mark(){return <svg viewBox="0 0 28 28" aria-label="Worldline News mark"><circle cx="14" cy="14" r="11.1" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="m4 15 6-4 4 5 4-7 6 3M4 19l6-4 4 5 4-7 5 2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
function Avatar({id,small=false}:{id:AgentId;small?:boolean}){const a=agents[id];return <span className={cx('portrait',small&&'small')} style={{background:a.color}}><Face id={id}/></span>;}
function Dot({status='Idle'}:{status?:string}){return <span className={cx('dot',status==='Working'&&'work',status==='Awaiting approval'&&'wait',status==='In meeting'&&'meet')}/>;}
function Status({children}:{children:string}){return <span className={cx('status',children==='Blocked'&&'blocked',children.includes('Approval')&&'waiting',children==='Done'&&'done')}><span/> {stateAr[children]||children}</span>;}
function Empty({children}:{children:ReactNode}){return <div className="empty">{children}</div>;}
function useRoute(){
  const read=():Page=>{const s=location.hash.replace(/^#\/?/,'').split('/')[0] as Page;return ['desk','office','dashboard','approvals','tasks','meeting','activity','settings','news'].includes(s)?s:'desk';};
  const [page,go]=useState(read);
  useEffect(()=>{const f=()=>go(read());window.addEventListener('hashchange',f);return()=>window.removeEventListener('hashchange',f);},[]);
  return [page,(p:Page)=>{go(p);try{location.hash=`/${p}`;}catch{/* navigation works without URL access */}}] as const;
}
function Dialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close();},[]);
  return <dialog ref={ref} className="dialog" dir="rtl" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="dialog-inner"><header><h2>{title}</h2><button className="icon-btn" aria-label="إغلاق المراجعة" onClick={onClose}><X size={18}/></button></header>{children}</div></dialog>;
}
class RenderGuard extends Component<{fallback:()=>void;children:ReactNode},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.fallback();}
  render(){return this.state.failed?null:this.props.children;}
}
function ImageDraft({opt,token}:{opt:{label:string;url?:string;palette?:string[]};token:string}){
  const [src,setSrc]=useState('');
  useEffect(()=>{if(!opt.url)return;let dead=false,u='';fetch(`${base}/api/office/images/${opt.url}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>{if(!r.ok)throw Error();return r.blob();}).then(b=>{if(!dead){u=URL.createObjectURL(b);setSrc(u);}}).catch(()=>{});return()=>{dead=true;if(u)URL.revokeObjectURL(u);};},[opt.url,token]);
  return <figure className="image-draft">{opt.palette?<svg viewBox="0 0 180 96"><rect width="180" height="96" fill={opt.palette[0]}/><path d="M0 96 77 15l60 81m-43 0 43-57 43 57" fill={opt.palette[1]}/><circle cx="139" cy="25" r="15" fill={opt.palette[2]}/></svg>:src?<img src={src} alt={`رسم توضيحي: ${opt.label}`}/>:<span>Image unavailable</span>}<figcaption>{opt.label}</figcaption></figure>;
}
function ArticleCopy({a}:{a:Article|PublicArticle}){
  const facts='brief' in a?a.brief.claims.map(c=>c.text):a.facts,developing='brief' in a?a.brief.developing:a.developing,eventDate='brief' in a?a.brief.eventDate:a.eventDate;
  return <article className="article-copy" dir="rtl" lang="ar"><span className="article-meta">{a.topic} · {a.demo?'مادة خيالية للتدريب':'وورلدلاين نيوز'}</span><h2>{a.title}</h2><p className="article-meta">تاريخ الحدث {eventDate} · {a.publishedAt?`نُشر ${date(a.publishedAt)}، ${time(a.publishedAt)} الرياض`:'غير منشور'} · تحرير: سارة · تدقيق: ليلى</p>
    {'image' in a&&a.image&&<figure className="public-cover"><img src={`${base}/api${a.image}`} alt="رسم تحريري توضيحي" /><figcaption>رسم تحريري توضيحي</figcaption></figure>}<p>{a.summary}</p><h3>ما تأكد</h3><ul>{facts.map((f,i)=><li key={i}>{f}</li>)}</ul><h3>التفاصيل</h3>{a.body.map((p,i)=><p key={i}>{p}</p>)}
    <h3>ما لا يزال قيد المتابعة</h3>{developing.length?<ul>{developing.map((f,i)=><li key={i}>{f}</li>)}</ul>:<p>لا تفاصيل إضافية مؤكدة حتى الآن.</p>}
    <h3>المصادر</h3><ul>{a.sources.map((s,i)=><li key={i}>{a.demo?s.publisher:<a href={s.url} target="_blank" rel="noreferrer">{s.publisher} · {s.title}</a>} · {date(s.publishedAt)}</li>)}</ul>
  </article>;
}
function News(){const [list,setList]=useState<PublicArticle[]>([]),[choice,setChoice]=useState<PublicArticle>(),[error,setError]=useState('');
  useEffect(()=>{request<{articles:PublicArticle[]}>('/public/articles').then(r=>setList(r.articles)).catch(e=>setError(e.message));},[]);
  return <main className="public-news" dir="rtl" lang="ar"><a href="#/office">← مكتب التحرير</a><h1>وورلدلاين نيوز</h1><p>أخبار السياسة والاقتصاد</p>{error&&<p role="alert">{error}</p>}{choice?<><button className="soft" onClick={()=>setChoice(undefined)}>جميع الأخبار</button><ArticleCopy a={choice}/></>:list.length?list.map(a=><button className="news-card" key={a.id} onClick={()=>{setChoice(a);void fetch(`${base}/api/public/articles/${a.id}/view`,{method:'POST'}).catch(()=>{});}}><span>{a.topic}</span><strong>{a.title}</strong><p>{a.summary}</p></button>):<Empty>لا توجد أخبار منشورة حتى الآن. المواد التجريبية لا تظهر هنا.</Empty>}</main>;
}
function App(){
  const [page,go]=useRoute(),[health,setHealth]=useState<Health>(),[token,setToken]=useState(''),[data,setData]=useState<Snapshot>(),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<AgentId>('omar'),[text,setText]=useState(''),[mode,setMode]=useState<'2d'|'3d'>('2d'),[menu,setMenu]=useState(false),[preview,setPreview]=useState<{type:'article'|'release'|'task';id:string}>(),[reject,setReject]=useState(false),[feedback,setFeedback]=useState(''),[now,setNow]=useState(new Date()),[filter,setFilter]=useState('All'),[limit,setLimit]=useState('60000'),[picks,setPicks]=useState<string[]>([]);
  const [recovering,setRecovering]=useState(false),[loginNotice,setLoginNotice]=useState(''),[listening,setListening]=useState(false);
  const [cover,setCover]=useState<number>();
  const [assign,setAssign]=useState(false);
  const sendBox=useRef<HTMLTextAreaElement>(null),intervalBusy=useRef(false),chatEnd=useRef<HTMLDivElement>(null);
  const fail=(error:unknown)=>{const e=error as Error&{status?:number};setErr(e.message);if(e.status===401){setToken('');setData(undefined);}};
  const sign=async (auth?:{email:string;password:string})=>{const r=await request<{token:string}>('/session',undefined,'POST',auth??{});setToken(r.token);const s=await request<Snapshot>('/office/state',r.token);setData(s);setLimit(String(s.dailyLimit));};
  const submitLogin=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(busy)return;
    const form=new FormData(e.currentTarget),email=String(form.get('email')??'');
    const password=String(form.get('password')??'');setBusy(true);setErr('');setLoginNotice('');
    try{
      if(recovering){
        await request('/session/recover',undefined,'POST',{email});
        setLoginNotice('إذا كان هذا بريد حساب رئيس التحرير، سيصلك رابط لتعيين كلمة المرور. افحص الوارد والرسائل غير المرغوب فيها، ثم ارجع إلى المكتب.');
      }else await sign({email,password});
    }catch(e){fail(e);}finally{setBusy(false);}
  };
  useEffect(()=>{let live=true;request<Health>('/health').then(async h=>{if(!live)return;setHealth(h);if(h.demo)await sign();}).catch(fail);return()=>{live=false;};},[]);
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),15000);return()=>clearInterval(timer);},[]);
  const hasWork=!!data?.tasks.some(t=>active(t));
  useEffect(()=>{
    if(!token)return;
    const tick=async()=>{if(intervalBusy.current)return;intervalBusy.current=true;
      try{const s=await request<Snapshot>(hasWork?'/office/advance':'/office/state',token,hasWork?'POST':'GET');setData(prev=>!prev||s.revision>=prev.revision?s:prev);}
      catch(e){if((e as {status?:number}).status!==409)fail(e);}finally{intervalBusy.current=false;}};
    const timer=setInterval(tick,hasWork?(health?.demo?500:1350):9000);return()=>clearInterval(timer);
  },[token,hasWork,health?.demo]);
  const mutate=async (path:string,method:string,body:unknown,after?:()=>void)=>{
    if(busy)return false;setBusy(true);setErr('');
    try{const s=await request<Snapshot>(path,token,method,body);setData(prev=>!prev||s.revision>=prev.revision?s:prev);after?.();return true;}
    catch(e){fail(e);return false;}finally{setBusy(false);}
  };
  const navTo=(p:Page)=>{go(p);setMenu(false);setFilter('All');};
  const onSelect=(id:AgentId)=>{setSelected(id);setAssign(false);};
  const focusChat=()=>requestAnimationFrame(()=>{sendBox.current?.focus({preventScroll:true});if(window.innerWidth<1000)sendBox.current?.scrollIntoView({block:'center',behavior:'smooth'});});
  const directChat=(id:AgentId)=>{onSelect(id);focusChat();};
  const fallback=useCallback(()=>{setMode('2d');setErr('العرض ثلاثي الأبعاد غير متاح على هذا الجهاز. جميع الوظائف متاحة في العرض ثنائي الأبعاد.');},[]);
  const channel:Channel=page==='meeting'?'meeting':selected;
  const msg=data?.messages.filter(m=>m.channel===channel).slice(-22)||[];
  useEffect(()=>{const node=chatEnd.current?.parentElement;if(node)node.scrollTop=node.scrollHeight;},[msg.at(-1)?.id,channel]);
  const send=(e:FormEvent)=>{e.preventDefault();if(text.trim())void mutate(assign?'/office/orders':'/office/chat','POST',{text,channel},()=>{
    const match=text.match(/@([a-z]+|[\u0600-\u06ff]+)/i)?.[1]?.toLowerCase(),target=agentIds.find(id=>id===match||agents[id].ar===match);
    if(target&&channel!=='meeting')setSelected(target);setText('');
  });};
  const enableVoice=()=>{
    type Voice={lang:string;onresult:(e:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void;onerror:()=>void;onend:()=>void;start:()=>void};
    const w=window as Window&{SpeechRecognition?:new()=>Voice;webkitSpeechRecognition?:new()=>Voice};
    const C=w.SpeechRecognition||w.webkitSpeechRecognition;if(!C){setErr('Voice input is unavailable. You can still type an order.');return;}
    const r=new C();r.lang='ar-SA';r.onresult=e=>setText(s=>`${s} ${e.results[0][0].transcript}`.trim());r.onend=()=>setListening(false);r.onerror=()=>{setListening(false);setErr('Microphone access failed. You can still type.');};try{r.start();setListening(true);}catch{r.onerror();}
  };
  const say=(value:string)=>{if(!('speechSynthesis'in window)){setErr('Audio playback is unavailable.');return;}const u=new SpeechSynthesisUtterance(value);u.lang=rtl(value)?'ar-SA':'en-GB';speechSynthesis.cancel();speechSynthesis.speak(u);};
  const articles=data?.articles||[],tasks=data?.tasks||[],pending=articles.filter(a=>a.status==='review'),releases=tasks.filter(t=>t.kind==='review'&&t.status==='Waiting for CEO Approval'&&data?.workflows.find(w=>w.id===t.workflowId)?.intent==='website');
  const stats={active:tasks.filter(active).length,waiting:pending.length+releases.length,done:tasks.filter(t=>t.status==='Done'&&dayKey(new Date(t.createdAt))===dayKey(now)).length,published:articles.filter(a=>a.publishedAt&&dayKey(new Date(a.publishedAt))===dayKey(now)).length};
  const status=Object.fromEntries(agentIds.map(id=>[id,tasks.some(t=>t.owner===id&&active(t))?'Working':tasks.some(t=>t.owner===id&&t.status==='Waiting for CEO Approval')||id==='sara'&&pending.length?'Awaiting approval':page==='meeting'&&['omar','sara','khalid'].includes(id)?'In meeting':'Idle'])) as TeamStatus;
  const article=preview?.type==='article'?articles.find(a=>a.id===preview.id):undefined,task=preview&&preview.type!=='article'?tasks.find(t=>t.id===preview.id):undefined,workflow=task?data?.workflows.find(w=>w.id===task.workflowId):undefined;
  const open=(type:'article'|'release'|'task',id:string)=>{setReject(false);setFeedback('');setCover(undefined);setPreview({type,id});};
  const close=()=>{setPreview(undefined);setReject(false);};
  const decide=(ids:string[],decision:'approved'|'rejected',f='',imageIndex?:number)=>mutate('/office/approvals','POST',{ids,decision,feedback:f,imageIndex},close);
  const queue=(id:AgentId,text:string,assignment:boolean)=>{setSelected(id);setAssign(assignment);setText(text);focusChat();};
  const jump=(command:{text:string;agent:AgentId})=>queue(command.agent,command.text,true);
  const morning=data?.reports.find(x=>x.type==='morning'&&x.day===dayKey(now)),evening=data?.reports.find(x=>x.type==='evening'&&x.day===dayKey(now));
  if(page==='news')return <News/>;
  const heading=page==='desk'?['غرفة الأخبار','مكتب التحرير والإنتاج']:page==='office'?['مخطط المكتب','اختر مكتباً لفتح محادثة الموظف.']:page==='dashboard'?['لوحة القيادة','مؤشرات اليوم وملخصات الوردية.']:page==='tasks'?['لوحة المهام','تابع كل تكليف ومراحل العمل.']:page==='approvals'?['قرارات النشر','لا تُنشر مادة قبل قرارك.']:page==='meeting'?['غرفة الاجتماع','ناقش النشرة المقبلة مع الفريق.']:page==='activity'?['سجل العمل','كل إجراء مسجّل بتوقيت الرياض.']:['إعدادات المكتب','إدارة الاتصال والاستخدام.'];
  if(!data)return <div className="login-screen" dir="rtl"><section className="login-card">
    <div className="login-mark"><Mark/></div><p className="eyebrow" dir="ltr">WORLDLINE NEWS · AI OFFICE</p>
    <h1>{health&&!health.demo?(recovering?'استعادة كلمة المرور':'دخول رئيس التحرير'):'جارٍ فتح غرفة الأخبار'}</h1>
    <p>{health&&!health.demo?(recovering?'أدخل بريد حساب رئيس التحرير لتعيين كلمة مرور جديدة.':'الدخول متاح لحساب رئيس التحرير المعتمد فقط.'):'جارٍ الاتصال بمساحة التحرير.'}</p>
    {err&&<p role="alert" className="error">{err}</p>}{loginNotice&&<p role="status">{loginNotice}</p>}
    {health&&!health.demo&&<form onSubmit={submitLogin} aria-busy={busy}>
      <label>البريد الإلكتروني<input name="email" type="text" inputMode="email" dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={320} required/></label>
      {!recovering&&<label>كلمة المرور<input name="password" type="password" dir="ltr" autoComplete="current-password" maxLength={1024} required/></label>}
      <button type="submit" className="primary" disabled={busy}>{busy?'جارٍ التحقق…':recovering?'إرسال رابط الاستعادة':'تسجيل الدخول'} <ArrowLeft size={16}/></button>
      <button type="button" className="soft" disabled={busy} onClick={()=>{setRecovering(!recovering);setErr('');setLoginNotice('');}}>{recovering?'العودة لتسجيل الدخول':'أول دخول أو نسيت كلمة المرور؟'}</button>
    </form>}{err&&health?.demo&&<button className="soft" onClick={()=>void sign().catch(fail)}>إعادة المحاولة</button>}
  </section></div>;
  const approvalRows=(compact=false)=><>{pending.map(a=><button key={a.id} className="approval-row" onClick={()=>open('article',a.id)}><span className={cx('a-icon',a.topic==='اقتصاد'&&'econ')}><FileText size={17}/></span><span className="approval-copy"><strong dir="rtl" lang="ar">{a.title}</strong><small>{a.topic} · {a.demo?'مسودة تجريبية':'اجتازت التحقق'} </small></span><ChevronRight className="rtl-arrow" size={15}/></button>)}{releases.map(t=><button key={t.id} className="approval-row" onClick={()=>open('release',t.id)}><span className="a-icon"><Layers3 size={17}/></span><span className="approval-copy"><strong>تغيير تجريبي للموقع</strong><small>{data?.demo?'محاكاة':'معاينة اجتازت الاختبارات'}</small></span><ChevronRight className="rtl-arrow" size={15}/></button>)}{!stats.waiting&&<Empty>{compact?'لا قرارات معلقة.':'لا توجد مسودات أو تغييرات للموقع بانتظار قرارك.'}</Empty>}</>;
  const chat=<section className="panel chat-panel" dir="rtl"><header className="panel-heading"><div className="chat-profile">{channel==='meeting'?<span className="a-icon"><Users size={18}/></span>:<Avatar id={selected}/>}<div><h3>{channel==='meeting'?'محادثة الاجتماع':`محادثة مع ${names[selected]}`}</h3><span><Dot status={channel==='meeting'?'In meeting':status[selected]}/>{channel==='meeting'?'محادثة جماعية':roles[selected]}</span></div></div><button className="icon-btn" title="قراءة آخر رد" aria-label="قراءة آخر رد" disabled={!msg.some(m=>m.author!=='ceo')} onClick={()=>{const last=msg.findLast(m=>m.author!=='ceo');if(last)say(last.text);}}><Volume2 size={17}/></button></header>
    <div className="messages" aria-live="polite">{msg.length?msg.map(m=><div className={cx('message',m.author==='ceo'&&'yours')} key={m.id}><small>{m.author==='ceo'?'أنت':names[m.author]} · {time(m.createdAt)}</small><div dir={rtl(m.text)?'rtl':'ltr'}>{m.text}</div></div>):<Empty>ابدأ محادثة خاصة أو أرسل تكليفاً لهذا الموظف.</Empty>}<div ref={chatEnd}/></div>
    <div className="chat-tools"><div className="switch" aria-label="نوع الرسالة"><button className={!assign?'on':''} aria-pressed={!assign} onClick={()=>setAssign(false)}><MessageSquare size={13}/> محادثة</button><button className={assign?'on':''} aria-pressed={assign} onClick={()=>setAssign(true)}><ClipboardList size={13}/> تكليف</button></div></div>
    {channel!=='meeting'&&<div className="suggestions">{suggestions[selected].map(item=><button className="soft" key={item.label} onClick={()=>queue(selected,item.text,!!item.assignment)}>{item.label}</button>)}</div>}
    <form onSubmit={send} className="composer"><textarea ref={sendBox} rows={2} aria-label="اكتب رسالة" placeholder={assign?'اذكر المطلوب وأضف الروابط عند الحاجة…':`اكتب إلى ${channel==='meeting'?'الفريق':names[selected]}…`} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send(e);}}} dir="auto" maxLength={3800}/><div><button type="button" className={cx('icon-btn',listening&&'recording')} onClick={enableVoice} aria-label="تسجيل صوتي"><Mic size={16}/></button><button title="إرسال" aria-label="إرسال" disabled={busy||!text.trim()} className="send"><Send size={16}/></button></div></form><div className="chat-hint">{assign?'يضيف التكليف مهمة يمكن متابعتها.':'المحادثة لا تنشئ مهمة.'} اكتب <kbd dir="ltr">@ليلى</kbd> للتوجيه.</div>
  </section>;
  const metrics=<div className="metrics">{([{label:'Active tasks',n:stats.active,icon:Layers3,kind:'green',sub:'In the workflow',target:'tasks'},{label:'Pending approvals',n:stats.waiting,icon:FileCheck2,kind:'gold',sub:'Need your decision',target:'approvals'},{label:'Done today',n:stats.done,icon:Check,kind:'sage',sub:'Completed tasks',target:'tasks'},{label:'Published today',n:stats.published,icon:Newspaper,kind:'slate',sub:'This edition',target:'news'}] as const).map(({label,n,icon:Icon,kind,sub,target})=><button className="metric" key={label} onClick={()=>navTo(target)}><span className={`metric-icon ${kind}`}><Icon size={16}/></span><span className="metric-label">{label}</span><strong>{String(n).padStart(2,'0')}</strong><small>{sub}</small></button>)}</div>;
  return <div className="shell">
    <header className="topbar"><button className="icon-btn mobile-menu" aria-label="فتح القائمة" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button><button className="brand" onClick={()=>navTo('desk')}><span className="brand-mark"><Mark/></span><span>WORLDLINE NEWS<small>AI OFFICE</small></span></button><div className="top-r"><span className="edition-top"><Dot/> {stats.published?'صدرت النشرة':stats.waiting?'النشرة قيد المراجعة':'جارٍ إعداد النشرة'}</span><button className="top-count" onClick={()=>navTo('tasks')}><Layers3 size={14}/> {stats.active} مهام نشطة</button><button className="top-count" onClick={()=>navTo('approvals')}><FileCheck2 size={14}/> {stats.waiting} قرارات معلقة</button><span className="clock"><Clock3 size={15}/><b>{time(now)}</b><span>RIYADH</span></span><span className="ceo-ident"><span>CEO</span><ChevronDown size={13}/></span></div></header>
    <aside className={cx('sidebar',menu&&'open')} aria-label="تنقل المكتب" dir="rtl"><div className="side-body"><p className="side-label">مساحة العمل</p><nav>{nav.map(({id,name,icon:Icon})=><button key={id} onClick={()=>navTo(id)} className={cx('nav-item',page===id&&'current')}><Icon size={17}/><span>{name}</span>{id==='approvals'&&stats.waiting>0&&<b>{stats.waiting}</b>}</button>)}</nav>
      <div className="side-divider"/><p className="side-label team-caption">فريق الوردية <span>{agentIds.length}</span></p>
      <div className="team-list">{agentIds.map(id=><button key={id} className={cx('team-row',selected===id&&'chosen')} onClick={()=>{directChat(id);if(page==='meeting')navTo('desk');else setMenu(false);}}><Avatar id={id} small/><span><b>{names[id]}</b><small>{roles[id]}</small></span><Dot status={status[id]}/><span className="sr-only">{stateAr[status[id]]}</span></button>)}</div>
    </div><div className="side-bottom"><button className={cx('nav-item',page==='settings'&&'current')} onClick={()=>navTo('settings')}><Settings2 size={17}/><span>الإعدادات والنماذج</span></button><a className="nav-item" href={health?.site||'https://al-ghaib.us.ci'} target="_blank" rel="noreferrer"><Globe2 size={17}/><span>الموقع الإخباري</span><ArrowUpRight size={13}/></a><div className="side-footer"><Dot/> <span>{data.demo?'بيئة تجريبية':'مكتب خاص'}</span><span>V2</span></div></div></aside>
    <div className="workspace">
      <main className="main">
      <div className="page-heading" dir="rtl"><div><p className="eyebrow"><span/> مساحة التحرير</p><h1>{heading[0]}</h1><p>{heading[1]}</p></div><div className="heading-meta"><span className="date"><CalendarDays size={15}/>{date(now)}</span>{data.demo&&<span className="demo-tag"><span/> وضع تجريبي</span>}</div></div>
      {err&&<div className="notice" role="alert">{err}<button className="icon-btn" aria-label="Dismiss message" onClick={()=>setErr('')}><X size={16}/></button></div>}
      {(page==='office'||page==='dashboard')&&metrics}
      {page==='desk'&&<Newsdesk data={data} status={status} switchToChat={directChat} open={open} queue={queue} onFloor={()=>navTo('office')}/>}
      {page==='office'&&<>
        <section className="panel floor-panel"><header className="panel-heading"><div><div className="section-kicker"><span/> FLOOR 01</div><h2>Office floor</h2></div><div className="switch" aria-label="Office display mode"><button className={mode==='2d'?'on':''} aria-pressed={mode==='2d'} onClick={()=>setMode('2d')}><LayoutGrid size={15}/> 2D</button><button className={mode==='3d'?'on':''} aria-pressed={mode==='3d'} onClick={()=>useWebGL()?setMode('3d'):fallback()}><Box size={15}/> 3D</button></div></header>
        {mode==='3d'?<RenderGuard fallback={fallback}><Suspense fallback={<div className="loading-floor">Loading the 3D office…</div>}><Office3D selected={selected} status={status} onSelect={onSelect} fallback={fallback}/></Suspense></RenderGuard>:<Floor selected={selected} status={status} onSelect={onSelect}/>}
        <footer className="floor-footer"><div><span><Dot/> Available</span><span><Dot status="Working"/> Working</span><span><Dot status="Awaiting approval"/> In review</span></div><span>{mode==='3d'?'Drag to rotate · Pinch to zoom':'Select a desk to open chat'}</span></footer>
        </section>
        <div className="mobile-team">{agentIds.map(id=><button key={id} className="soft" onClick={()=>onSelect(id)}><Avatar id={id} small/>{agents[id].name}<Dot status={status[id]}/></button>)}</div>
        <section className="quick-section"><div className="section-title"><h2>Quick orders</h2><span>Start with a template</span></div><div className="quick-grid">{quick.map(({title,detail,icon:Icon,...command})=><button key={title} onClick={()=>jump(command)}><span><Icon size={17}/></span><div><strong>{title}</strong><small>{detail}</small></div><ArrowUpRight size={14}/></button>)}</div></section>
      </>}
      {page==='dashboard'&&<>
        <section className="panel content-panel"><div className="section-title"><h2>Readership by hour</h2><span>Riyadh · page views</span></div><div className="chart" aria-label={`${data.analytics.reads} measured reads`}>{data.analytics.hours.map((n,i)=><div key={i} title={`${i}:00 · ${n} views`}><span style={{height:`${n?Math.max(7,100*n/Math.max(...data.analytics.hours)):2}%`}}/><small>{i%4===0?String(i).padStart(2,'0'):''}</small></div>)}</div><p>{data.analytics.reads} measured page views. These are not unique readers.</p><div className="insights"><div><strong>Top article</strong><span dir="auto">{data.analytics.top?.title||'No measured article yet'}</span></div><div><strong>Top topic</strong><span dir="auto">{Object.entries(data.analytics.topics).sort((a,b)=>b[1]-a[1])[0]?.[0]||'No measured topic yet'}</span></div><div><strong>Stage jobs completed</strong><span>{tasks.filter(t=>t.kind==='stage'&&t.status==='Done').length}</span></div></div></section>
        <section className="panel content-panel"><div className="section-title"><h2>Daily reports</h2><span>Riyadh time</span></div><div className="report-row"><div><strong>Morning briefing · 08:00</strong><p dir={morning?'rtl':'ltr'}>{morning?.text||'Open the meeting room to generate a briefing.'}</p></div><button className="soft" onClick={()=>navTo('meeting')}>Open meeting <ArrowRight size={15}/></button></div><div className="report-row"><div><strong>End-of-day report · 21:00</strong><p dir={evening?'rtl':'ltr'}>{evening?.text||'No report for today yet.'}</p></div><button className="soft" disabled={busy} onClick={()=>void mutate('/office/reports','POST',{type:'evening'})}>Generate</button></div></section>
      </>}
      {page==='approvals'&&<section className="panel content-panel"><div className="section-title"><h2>Pending decisions ({stats.waiting})</h2>{pending.length>1&&<button className="soft" onClick={()=>open('article','batch')}>Review batch <ArrowRight size={15}/></button>}</div>{approvalRows()}<div className="section-title history-title"><h2>Decision history</h2></div>{data.approvals.length?data.approvals.slice().reverse().map(a=><div className="history" key={a.id}><Status>{a.decision==='approved'?'Approved':'Rejected'}</Status><span dir="auto">{articles.find(x=>x.id===a.targetId)?.title||'Staging release'}{a.feedback&&` · ${a.feedback}`}</span><small>{date(a.createdAt)} {time(a.createdAt)}</small></div>):<Empty>No decisions yet.</Empty>}</section>}
      {page==='tasks'&&<section className="panel content-panel"><div className="section-title"><h2>All assignments</h2><span>{tasks.length} total</span></div><div className="filters">{['All','Active','Review','Done','Blocked'].map(i=><button className={cx('soft',filter===i&&'filter-on')} key={i} onClick={()=>setFilter(i)}>{i}</button>)}</div>{tasks.filter(t=>filter==='All'||filter==='Active'&&active(t)||filter==='Review'&&t.status==='Waiting for CEO Approval'||filter===t.status).slice().reverse().map(t=><button className="task-row" onClick={()=>open('task',t.id)} key={t.id}><Avatar id={t.owner} small/><span><strong>{t.title}</strong><small>{agents[t.owner].name} · {t.priority} · {time(t.dueAt)} due</small></span><Status>{t.status}</Status><ChevronRight size={15}/></button>)}{!tasks.some(t=>filter==='All'||filter==='Active'&&active(t)||filter==='Review'&&t.status==='Waiting for CEO Approval'||filter===t.status)&&<Empty>No tasks match this filter.</Empty>}</section>}
      {page==='meeting'&&<section className="panel content-panel"><div className="section-title"><h2>Morning briefing</h2><span>08:00 Riyadh</span></div><div className="meeting-team">{(['omar','sara','khalid'] as const).map(id=><span key={id}><Avatar id={id} small/>{agents[id].name}</span>)}</div>{!morning?<Empty><p>No briefing today. Generate a list of candidate stories to review.</p><button className="primary" disabled={busy} onClick={()=>void mutate('/office/reports','POST',{type:'morning'})}>Generate briefing <ArrowRight size={16}/></button></Empty>:<><p dir="rtl">{morning.text}</p>{morning.stories.map(s=><label className="pick" key={s.id}><input type="checkbox" checked={picks.includes(s.id)} disabled={picks.length>=5&&!picks.includes(s.id)} onChange={e=>setPicks(p=>e.target.checked?[...p,s.id]:p.filter(i=>i!==s.id))}/><strong dir="rtl">{s.title}</strong><span>{s.demo?'Demo fixture':s.publisher}</span></label>)}<button className="primary" disabled={!picks.length||busy} onClick={()=>void mutate('/office/picks','POST',{reportId:morning.id,ids:picks},()=>setPicks([]))}>Assign selected ({picks.length}/5) <ArrowRight size={16}/></button></>}</section>}
      {page==='activity'&&<section className="panel content-panel"><div className="section-title"><h2>Audit trail</h2><span>Times shown in Riyadh</span></div>{data.logs.length?data.logs.slice().reverse().map(l=><div className="log-row" key={l.id}><span className="a-icon"><Activity size={17}/></span><div><strong>{l.action} · {agents[l.actor as AgentId]?.name||(l.actor==='system'?'System':'CEO')}</strong><p dir="auto">{l.details}</p></div><small>{date(l.createdAt)}<br/>{time(l.createdAt)}</small></div>):<Empty>Activity appears here after your first order.</Empty>}</section>}
      {page==='settings'&&<><ModelSettings profile={data.modelProfile} providers={data.providers} demo={data.demo} save={profile=>mutate('/office/models','PUT',profile)} loadModels={async p=>(await request<{models:string[]}>(`/office/models/${p}`,token)).models} test={tier=>request('/office/models/test',token,'POST',{tier})}/><section className="panel content-panel" dir="rtl"><div className="section-title"><h2>حد الاستخدام اليومي</h2><span>{dayKey(now)}</span></div><form className="budget-form" onSubmit={e=>{e.preventDefault();void mutate('/office/settings','PATCH',{dailyLimit:Number(limit)});}}><label>أقصى عدد رموز في اليوم بتوقيت الرياض<input type="number" min="1000" max="2000000" required value={limit} onChange={e=>setLimit(e.target.value)}/></label><button className="primary" disabled={busy}>حفظ الحد</button></form><div className="token-grid">{agentIds.map(id=><div key={id}><Avatar id={id} small/>{names[id]}<strong>{data.usage[dayKey(now)]?.[id]||0}</strong></div>)}</div><div className="section-title history-title"><h2>الخدمات الأخرى</h2></div><div className="insights"><div><strong>الموقع المرتبط</strong><a href={health?.site} target="_blank" rel="noreferrer">فتح موقع WRLDLINE</a></div><div><strong>توليد الصور</strong><span>{data.demo?'رسوم تجريبية':health?.images?'مفتاح مضاف':'غير متصل'}</span></div><div><strong>بيئة التجربة</strong><span>{data.demo?'محاكاة فقط':health?.releases?'عنوان مضاف':'غير متصل'}</span></div></div>{!data.demo&&<button className="soft" onClick={()=>{setToken('');setData(undefined);}}>تسجيل الخروج</button>}</section></>}
      </main>
    <aside className="right-rail" aria-label="المراجعة والمحادثات"><section className="panel approvals-panel"><header className="panel-heading"><div><div className="section-kicker"><span/> مكتب الاعتماد</div><h3>بانتظار قرارك <span className="count">{stats.waiting}</span></h3></div><button className="icon-btn" aria-label="فتح كل قرارات النشر" onClick={()=>navTo('approvals')}><ArrowUpRight size={18}/></button></header><div className="approval-list">{approvalRows(true)}</div>{data.demo&&<div className="rail-note"><ShieldCheck size={14}/> القرارات التجريبية لا تُنشر على الموقع.</div>}</section>{chat}
        {page==='office'&&<section className="panel agent-note"><div><Avatar id={selected} small/><div><strong>{agents[selected].name}</strong><small>{status[selected]}</small></div></div><p>{agents[selected].permission}</p>{tasks.filter(t=>t.owner===selected).slice(-1).map(t=><button className="soft" key={t.id} onClick={()=>open('task',t.id)}>View current task <ChevronRight size={14}/></button>)}</section>}
      </aside>
    </div>
    {preview&&<Dialog title={preview.id==='batch'?'مراجعة النشرة':article?'مراجعة المادة':preview.type==='release'?'مراجعة تغيير الموقع':'تفاصيل المهمة'} onClose={close}>
      {article&&<><div className="verified"><ShieldCheck size={17}/> {article.demo?'اجتازت المسودة تحقق ليلى بأدلة تجريبية خيالية.':'اجتازت المسودة تحقق ليلى.'}</div><ArticleCopy a={article}/><details><summary>الأدلة لكل ادعاء</summary><div dir="rtl">{article.brief.claims.map((c,i)=><div key={i}><strong>{c.text}</strong>{c.evidence.map((e,j)=><blockquote key={j} dir="auto">{e.quote}<cite>{article.sources.find(s=>s.id===e.sourceId)?.publisher}</cite></blockquote>)}</div>)}</div></details>{article.seo&&<details><summary>مسودات البحث والمنصات</summary><p dir="rtl" className="pre">{article.seo}</p></details>}{article.images?.length? <><div className="image-grid">{article.images.map((opt,i)=><button type="button" className={cx('cover-choice',cover===i&&'filter-on')} key={opt.label} aria-pressed={cover===i} aria-label={`اختر الغلاف ${i+1}`} onClick={()=>setCover(cover===i?undefined:i)}><ImageDraft opt={opt} token={token}/></button>)}</div><small>{cover===undefined?'يمكنك اختيار رسم توضيحي اختياري.':`تم اختيار الغلاف رقم ${cover+1}.`}</small></>:null}{article.status==='review'&&!reject&&<div className="dialog-actions"><button className="soft danger" onClick={()=>setReject(true)}>إعادة للتحرير مع ملاحظات</button><button className="primary" disabled={busy} onClick={()=>void decide([article.id],'approved','',cover)}><Check size={16}/> {article.demo?'اعتماد ونشر تجريبي':'اعتماد ونشر على الموقع'}</button></div>}</>}
      {preview.id==='batch'&&<><p>راجع كل مسودة قبل اعتماد النشرة.</p>{pending.slice(0,20).map(a=><details key={a.id}><summary dir="auto">{a.title}</summary><ArticleCopy a={a}/></details>)}<div className="dialog-actions"><button className="primary" disabled={busy||!pending.length} onClick={()=>void decide(pending.slice(0,20).map(a=>a.id),'approved')}><Check size={16}/> اعتماد ونشر {Math.min(pending.length,20)} {data.demo?'مواد تجريبية':'مواد على الموقع'}</button></div></>}
      {task&&<><p className="detail-kicker">{agents[task.owner].name} · {task.priority} · Due {time(task.dueAt)} Riyadh</p><Status>{task.status}</Status><h3>{task.title}</h3><p dir="auto" className="pre">{task.output||String(task.inputs.order||'No output yet.')}</p>{task.feedback&&<p dir="auto">CEO feedback: {task.feedback}</p>}{task.dependencies.length>0&&<p>Depends on: {task.dependencies.map(id=>tasks.find(t=>t.id===id)?.title).filter(Boolean).join(', ')}</p>}{task.sources?.length?<details><summary>Sources observed ({task.sources.length})</summary>{task.sources.map((s:Source)=><p dir="auto" key={s.id}>{s.demo?s.title:<a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>} · {s.publisher} · {date(s.publishedAt)}</p>)}</details>:null}
      {task.kind==='image'&&workflow?.images?.length?<div className="image-grid">{workflow.images.map(i=><ImageDraft key={i.label} opt={i} token={token}/>)}</div>:null}
      {workflow?.release&&<div className="release-box"><h3>Staging receipt</h3><p dir="auto">{workflow.release.report}</p><code>{workflow.release.commit}</code><p>{workflow.release.testsPassed?'Tests passed':'Tests did not pass'}</p>{!data.demo&&<a href={workflow.release.preview} target="_blank" rel="noreferrer">Open staging preview <ArrowUpRight size={14}/></a>}{workflow.release.deploymentUrl&&<p><a href={workflow.release.deploymentUrl} target="_blank" rel="noreferrer">Open production release</a></p>}</div>}
      {task.kind==='review'&&workflow?.intent==='website'&&task.status==='Waiting for CEO Approval'&&!reject&&<div className="dialog-actions"><button className="soft danger" onClick={()=>setReject(true)}>إعادة للعمل مع ملاحظات</button><button className="primary" disabled={busy} onClick={()=>void decide([task.id],'approved')}><Check size={16}/> {data.demo?'محاكاة نشر التغيير':'اعتماد التغيير على الموقع المباشر'}</button></div>}</>}
      {err&&<p className="error" role="alert">{err}</p>}
      {reject&&<form className="reject" onSubmit={e=>{e.preventDefault();void decide([preview.id],'rejected',feedback);}}><label>ما الذي يجب تغييره في المراجعة التالية؟<textarea value={feedback} onChange={e=>setFeedback(e.target.value)} required maxLength={1500} rows={4} dir="auto"/></label><div className="dialog-actions"><button type="button" className="soft" onClick={()=>setReject(false)}>إلغاء</button><button className="primary" disabled={busy||!feedback.trim()}>إرسال الملاحظات وإعادة العمل</button></div></form>}
    </Dialog>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
