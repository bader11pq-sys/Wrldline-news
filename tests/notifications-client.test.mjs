import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { MessageChannel } from 'node:worker_threads';
const root=new URL('../',import.meta.url);
const clientCode=fs.readFileSync(new URL('notification-client.js',root),'utf8');
const workerCode=fs.readFileSync(new URL('sw.js',root),'utf8');
const user='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',article='30000000-0000-4000-8000-000000000003';
function clientFixture({configured=true,ios=false}={}){
 const storage=new Map(),actions=[],gates=[];let permissionRequests=0,subscriptions=0,unsubscriptions=0,sub=null;
 const Notification={permission:'default',requestPermission:async()=>{permissionRequests++;Notification.permission='granted';return 'granted';}};
 const subscription={endpoint:'https://fcm.googleapis.com/mock/device',options:{},toJSON:()=>({endpoint:'https://fcm.googleapis.com/mock/device',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}}),unsubscribe:async()=>{unsubscriptions++;sub=null;return true;}};
 const reg={active:{postMessage:(data,ports)=>{gates.push(data);ports[0].postMessage({ok:true});ports[0].close();}},update:async()=>{},pushManager:{getSubscription:async()=>sub,subscribe:async()=>{subscriptions++;sub=subscription;return sub;}}};
 const navigator={userAgent:ios?'iPhone':'Fixture',platform:ios?'iPhone':'Linux',maxTouchPoints:ios?1:0,serviceWorker:{getRegistration:async()=>reg,register:async()=>reg,ready:Promise.resolve(reg)}};
 const session={user:{id:user},access_token:'fixture-token'};const db={auth:{getSession:async()=>({data:{session}})}};
 const fetch=async(_url,options)=>{const body=JSON.parse(options.body);actions.push(body);if(body.action==='config')return new Response(JSON.stringify({push_ready:configured,email_ready:false,vapid_public_key:configured?'A'.repeat(87):null}),{status:200});return new Response(JSON.stringify({ok:true,subscribed:true}),{status:200});};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const window={WRLDLINE_NOTIFICATION_CONFIG:{endpoint:'https://edge.invalid/notification-center',publishableKey:'fixture-public',worker:'/sw.js'},isSecureContext:true,Notification,PushManager:{},matchMedia:()=>({matches:false})};
 const context=vm.createContext({window,navigator,Notification,localStorage,fetch,Uint8Array,atob,MessageChannel,AbortSignal,setTimeout,clearTimeout});vm.runInContext(clientCode,context);
 return {api:window.WRLDLINE_NOTIFICATIONS,db,storage,actions,gates,counts:()=>({permissionRequests,subscriptions,unsubscriptions})};
}
test('Client never requests permission or enables Push on load',()=>{const f=clientFixture();assert.deepEqual(f.counts(),{permissionRequests:0,subscriptions:0,unsubscriptions:0});assert.equal(f.actions.length,0);});
test('Missing service credentials deny enable before permission request',async()=>{const f=clientFixture({configured:false});await assert.rejects(f.api.enable(f.db),/غير مفعلة/);assert.deepEqual(f.counts(),{permissionRequests:0,subscriptions:0,unsubscriptions:0});assert.equal(f.storage.size,0);});
test('Opt-in enables worker owner only after authenticated server success',async()=>{const f=clientFixture();assert.equal(await f.api.enable(f.db),true);assert.equal(f.counts().subscriptions,1);assert.equal(f.counts().permissionRequests,1);assert.equal(f.actions.find(x=>x.action==='push_subscribe').consent,true);assert.equal(f.gates.at(-1).user_id,user);assert.equal(f.gates.at(-1).enabled,true);});
test('Logout disables gate deletes owner-constrained server subscription and unsubscribes locally',async()=>{const f=clientFixture();await f.api.enable(f.db);await f.api.beforeLogout(f.db);assert.equal(f.gates.at(-1).enabled,false);assert.equal(f.storage.size,0);assert.equal(f.counts().unsubscriptions,1);assert.ok(f.actions.some(a=>a.action==='push_delete'));});
test('iOS uninstalled support note stops permission and subscription',async()=>{const f=clientFixture({ios:true});await assert.rejects(f.api.enable(f.db),/الشاشة الرئيسية/);assert.equal(f.counts().permissionRequests,0);assert.equal(f.counts().subscriptions,0);});
function workerFixture(){
 const handlers=new Map(),state=new Map(),shown=[],opened=[],navigated=[],closed=[];
 const db={createObjectStore(){},close(){},transaction(){const tx={objectStore:()=>({get:key=>{const r={result:state.get(key)};queueMicrotask(()=>tx.oncomplete?.());return r;},put:(value,key)=>{state.set(key,value);const r={result:key};queueMicrotask(()=>tx.oncomplete?.());return r;}})};return tx;}};
 const indexedDB={open(){const r={result:db};queueMicrotask(()=>r.onsuccess?.());return r;}};
 const self={location:{origin:'https://example.invalid'},addEventListener:(type,callback)=>handlers.set(type,callback),registration:{showNotification:async(title,data)=>{shown.push({title,data});},getNotifications:async()=>shown.map((_n,i)=>({close:()=>closed.push(i)}))},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url),claim:async()=>{}},skipWaiting:async()=>{}};
 const context=vm.createContext({self,indexedDB,URL,Promise,Response,Request,queueMicrotask,fetch:()=>{throw new Error('network denied');},caches:{open:async()=>({}),keys:async()=>[]}});vm.runInContext(workerCode,context);
 async function fire(type,params){let promise;handlers.get(type)({...params,waitUntil:p=>promise=p});if(promise)await promise;}
 async function gate(enabled,owner=user){let ack;await fire('message',{data:{type:'wrldline:push-gate',enabled,user_id:owner},source:{url:'https://example.invalid/account.html'},ports:[{postMessage:v=>ack=v}]});assert.equal(ack.ok,true);}
 return {fire,gate,shown,opened,navigated,closed};
}
test('Worker starts fail-closed until explicit per-account opt-in',async()=>{const f=workerFixture();await f.fire('push',{data:{json:()=>({user_id:user,article_id:article,title:'Fixture'})}});assert.equal(f.shown.length,0);});
test('Worker ignores malicious payload destination and foreign account messages',async()=>{const f=workerFixture();await f.gate(true);await f.fire('push',{data:{json:()=>({user_id:other,article_id:article,title:'Other account'})}});assert.equal(f.shown.length,0);await f.fire('push',{data:{json:()=>({user_id:user,article_id:article,title:'Fixture',url:'https://evil.invalid/'})}});assert.equal(f.shown.length,1);assert.equal(f.shown[0].data.data.url,'/news/'+article);});
test('Worker logout closes displayed alerts and suppresses queued pushes and clicks',async()=>{const f=workerFixture();await f.gate(true);await f.fire('push',{data:{json:()=>({user_id:user,article_id:article,title:'Fixture'})}});await f.gate(false);assert.equal(f.closed.length,1);await f.fire('push',{data:{json:()=>({user_id:user,article_id:article,title:'Queued'})}});await f.fire('notificationclick',{notification:{close(){},data:{url:'/news/'+article,user_id:user}}});assert.equal(f.shown.length,1);assert.equal(f.opened.length,0);});
test('Worker only opens exact same-origin canonical article path',async()=>{const f=workerFixture();await f.gate(true);for(const url of ['//evil.invalid/','https://evil.invalid/','/news/'+article+'?redirect=evil','/news/invalid'])await f.fire('notificationclick',{notification:{close(){},data:{url,user_id:user}}});assert.equal(f.opened.length,0);await f.fire('notificationclick',{notification:{close(){},data:{url:'/news/'+article,user_id:user}}});assert.equal(f.opened[0],'https://example.invalid/news/'+article);});
test('Token fragment is scrubbed before third-party assets and forms never direct-insert newsletter',()=>{const html=fs.readFileSync(new URL('newsletter.html',root),'utf8');assert.ok(html.indexOf('history.replaceState')<html.indexOf('fonts.googleapis.com'));assert.ok(html.includes('name="referrer" content="no-referrer"'));const forms=fs.readFileSync(new URL('forms.js',root),'utf8');assert.ok(forms.includes('/functions/v1/contact-submit'));assert.ok(!forms.includes('/rest/v1/'));assert.ok(!forms.includes('insert("newsletter_subscribers"'));});
