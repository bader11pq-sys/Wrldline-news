import { validateContact } from './validation.mjs';
const ORIGIN = 'https://al-ghaib.us.ci';
const MAX_BYTES = 12000;
const headers = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'Origin',
};
function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {status,headers});
}
async function readBody(req: Request) {
  if (!req.body) throw new Error('invalid_body');
  const reader = req.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    bytes += value.length; if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('body_too_large'); }
    chunks.push(value);
  }
  const all = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { all.set(chunk,offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
}
async function bucket(value: string, key: string) {
  const day = new Date().toISOString().slice(0,10);
  const cryptoKey = await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest = await crypto.subtle.sign('HMAC',cryptoKey,new TextEncoder().encode(day+':contact:'+value));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
Deno.serve(async req => {
  if (req.headers.get('Origin') !== ORIGIN) return response({error:'origin_not_allowed'},403);
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (req.method !== 'POST') return response({error:'method_not_allowed'},405);
  if (!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return response({error:'invalid_content_type'},415);
  if (Number(req.headers.get('Content-Length') || 0) > MAX_BYTES) return response({error:'body_too_large'},413);
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) return response({error:'service_unavailable'},503);
  let data;
  try { data = validateContact(await readBody(req)); } catch { return response({error:'invalid_request'},400); }
  if (!data) return response({error:'invalid_request'},400);
  const dbHeaders = {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  try {
    const ip = (req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0,80);
    const limits: [string,number,number][] = [['global',100,60],['ip:'+ip,5,900],['email:'+data.email,2,3600]];
    for (const [value,max,window] of limits) {
      const rate = await fetch(url+'/rest/v1/rpc/consume_form_rate',{method:'POST',headers:dbHeaders,
        body:JSON.stringify({p_bucket:await bucket(value,key),p_max:max,p_window_seconds:window}),signal:AbortSignal.timeout(8000)});
      if (!rate.ok) return response({error:'service_unavailable'},503);
      if (await rate.json() !== true) return response({error:'rate_limited'},429);
    }
    const saved = await fetch(url+'/rest/v1/contact_messages',{method:'POST',headers:{...dbHeaders,Prefer:'return=minimal'},body:JSON.stringify(data),signal:AbortSignal.timeout(8000)});
    if (!saved.ok) return response({error:'service_unavailable'},503);
    return response({ok:true},202);
  } catch { return response({error:'service_unavailable'},503); }
});
