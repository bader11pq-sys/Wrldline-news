import {agentIds,agents} from '../shared/agents';
import {fresh,uid,type Office} from '../shared/schema';
import {demoSeed} from './demo';
import {OfficeError} from './engine';
import {limitTime,mode,type Env} from './integrations';
import {officeResource} from './database';

const demos=new Map<string,Office>(), locked=new Set<string>();
const initial=(e:Env)=>fresh(false,Number(e.DAILY_TOKEN_LIMIT)||60000);
export function assertLive(e:Env){
  if(!e.SUPABASE_URL||!e.SUPABASE_SERVICE_ROLE_KEY||!e.SUPABASE_PUBLISHABLE_KEY||!e.CEO_USER_ID)throw new OfficeError('Live mode requires Supabase and a configured CEO account.',503);
}
export function headers(e:Env){return {apikey:e.SUPABASE_SERVICE_ROLE_KEY!,authorization:`Bearer ${e.SUPABASE_SERVICE_ROLE_KEY!}`,'content-type':'application/json'};}
export async function supa(e:Env,path:string,init:RequestInit={}){
  assertLive(e);
  const r=await fetch(`${e.SUPABASE_URL}${path}`,{...init,headers:{...headers(e),...init.headers},signal:limitTime(25000)});
  if(!r.ok)throw new OfficeError(`Supabase request failed (HTTP ${r.status}).`,502);
  return r;
}
async function rpc(e:Env,name:string,body:Record<string,unknown>){return (await supa(e,`/rest/v1/rpc/${officeResource(e,name)}`,{method:'POST',body:JSON.stringify(body)})).json();}
export function demoNew(key:string){
  if(!demos.has(key)&&demos.size>=500)demos.delete(demos.keys().next().value!);
  if(!demos.has(key))demos.set(key,demoSeed());
  return demos.get(key)!;
}
export async function load(e:Env,actor:string):Promise<Office> {
  if(mode(e))return structuredClone(demoNew(actor));
  const result=await (await supa(e,`/rest/v1/${officeResource(e,'office_state')}?id=eq.${encodeURIComponent(actor)}&select=document`)).json() as {document:Office}[];
  return result[0]?.document?.tasks?result[0].document:initial(e);
}
export async function mutate<T>(e:Env,actor:string,fn:(o:Office)=>Promise<T>|T):Promise<T>{
  if(mode(e)){
    if(locked.has(actor))throw new OfficeError('Office is processing a task. Try again shortly.',409);
    locked.add(actor);
    try {const o=structuredClone(demoNew(actor)),value=await fn(o);o.revision++;demos.set(actor,o);return value;}
    finally{locked.delete(actor);}
  }
  const lease=uid(), params={p_user:actor,p_lease:lease},data=await rpc(e,'office_claim',params) as Office|null;
  if(!data)throw new OfficeError('Office is processing a task. Try again shortly.',409);
  let saved=false;
  try {
    const o=data.tasks?data:initial(e), value=await fn(o);o.revision++;
    saved=await rpc(e,'office_save',{...params,p_document:o,p_agents:agentIds.map(id=>({id,name:agents[id].name,role:agents[id].role,prompt:agents[id].prompt,status:o.tasks.some(t=>t.owner===id&&t.status==='Queued')?'Working':'Idle'}))})===true;
    if(!saved)throw new OfficeError('The office write lease expired. Please retry.',409);
    return value;
  } finally {if(!saved)await rpc(e,'office_release',params).catch(()=>{});}
}
