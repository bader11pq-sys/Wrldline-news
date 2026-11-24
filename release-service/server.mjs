// Optional reference backend for an existing static Cloudflare Pages site.
// This process never accepts arbitrary commands, paths, repository names, or code.
import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {execFile as rawExec} from 'node:child_process';
import {cp,mkdir,readFile,readdir,realpath,rename,writeFile,lstat} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {promisify} from 'node:util';
import {parse,serialize} from 'parse5';
const execFile=promisify(rawExec);
const cfg=process.env;
const names=['RELEASE_SERVICE_TOKEN','RELEASE_DEPLOY_TOKEN','SITE_ARTIFACT_DIR','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','PAGES_PROJECT','PAGES_PRODUCTION_BRANCH'];
if(names.some(k=>!cfg[k]))throw new Error('Missing release-service configuration. See README.');
if(cfg.RELEASE_SERVICE_TOKEN===cfg.RELEASE_DEPLOY_TOKEN)throw new Error('Use separate staging and production secrets.');
if(!/^[a-z0-9-]{2,58}$/.test(cfg.PAGES_PROJECT)||!/^[a-z0-9][a-z0-9-]{0,38}$/.test(cfg.PAGES_PRODUCTION_BRANCH))throw Error('Invalid Pages target.');
const root=await realpath(cfg.SITE_ARTIFACT_DIR),store=resolve(cfg.RELEASE_STATE_DIR||'.release-state');
if(store===root||store.startsWith(root+sep)||root.startsWith(store+sep))throw Error('Artifact and state directories must be separate.');
const wrangler=resolve('node_modules/.bin/wrangler');
const port=Number(cfg.RELEASE_PORT||8791);
await mkdir(store,{recursive:true});
const auth=(value='',secret)=>{const a=Buffer.from(value),b=Buffer.from(`Bearer ${secret}`);return a.length===b.length&&timingSafeEqual(a,b);};
function images(node,out=[]){if(node.tagName==='img')out.push(node);for(const child of node.childNodes||[])images(child,out);return out;}
export function optimize(html){
  const dom=parse(html),list=images(dom),attr=(e,n)=>e.attrs.find(a=>a.name===n)?.value;
  const attrSet=(e,name,value)=>{if(!attr(e,name))e.attrs.push({name,value});};
  const deferred=list.filter((e,i)=>i>0&&attr(e,'loading')!=='eager'&&attr(e,'fetchpriority')!=='high'&&!attr(e,'loading')&&attr(e,'src'));
  if(!deferred.length)throw Error('No eligible non-hero images to defer; nothing changed.');
  for(const e of deferred){attrSet(e,'loading','lazy');attrSet(e,'decoding','async');}
  const result=serialize(dom),after=images(parse(result));
  if(after.length!==list.length||list.some((v,i)=>attr(v,'src')!==attr(after[i],'src')||attr(v,'srcset')!==attr(after[i],'srcset'))||after.filter(x=>attr(x,'loading')==='lazy').length<deferred.length)throw Error('HTML image preservation test failed.');
  return {result,count:deferred.length};
}
async function hashTree(dir){
  const digest=createHash('sha1');
  async function walk(path,relative=''){
    for(const filename of (await readdir(path)).sort()){
      const f=join(path,filename),r=join(relative,filename),stat=await lstat(f);
      if(stat.isSymbolicLink())throw Error('Symbolic links are not allowed in release artifacts.');
      if(stat.isDirectory())await walk(f,r);
      else if(stat.isFile())digest.update(JSON.stringify(r)).update('\0').update(createHash('sha256').update(await readFile(f)).digest());
      else throw Error('Unexpected artifact entry.');
    }
  }
  await walk(dir);return digest.digest('hex');
}
async function deploy(path,branch,commit){
  const args=['pages','deploy',path,`--project-name=${cfg.PAGES_PROJECT}`,`--branch=${branch}`,`--commit-hash=${commit}`,'--commit-dirty=true'];
  const {stdout}=await execFile(wrangler,args,{timeout:100000,maxBuffer:256000,env:{PATH:cfg.PATH,HOME:cfg.HOME,CI:'true',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_ACCOUNT_ID:cfg.CLOUDFLARE_ACCOUNT_ID,CLOUDFLARE_API_TOKEN:cfg.CLOUDFLARE_API_TOKEN}});
  const urls=[...stdout.matchAll(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev\b/g)].map(x=>x[0]);
  if(!urls.length)throw Error('Pages did not return a deployment URL.');
  return urls[0];
}
const serializeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(`${path}.tmp`,JSON.stringify(value),{mode:0o600});await rename(`${path}.tmp`,path);};
const running=new Set();
async function run(data){
  const {requestId,operation,order,commit}=data;
  if(!/^[a-f0-9-]{36}:\d+$/.test(requestId)||!['stage','deploy'].includes(operation))throw Error('Invalid release request.');
  const receipt=join(store,requestId,`${operation}.json`);
  try{return JSON.parse(await readFile(receipt,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(running.has(requestId))return null;
  running.add(requestId);
  void (async()=>{
    try{
      const dir=join(store,requestId,'artifact');let result;
      if(operation==='stage'){
        if(typeof order!=='string'||!/(homepage|home page|الصفحة الرئيسية)/i.test(order)||!/(slow|speed|performance|ضعف|بطء|بطي|سرع)/i.test(order))throw Error('Only homepage performance orders are supported by this adapter.');
        await hashTree(root);
        await cp(root,dir,{recursive:true,dereference:false});
        const file=join(dir,'index.html'),before=await readFile(file,'utf8'),patch=optimize(before);
        await writeFile(file,patch.result,'utf8');
        const sha=await hashTree(dir),branch=`ai-staging-${sha.slice(0,16)}`;
        if(branch===cfg.PAGES_PRODUCTION_BRANCH)throw Error('Staging and production must use different branches.');
        const preview=await deploy(dir,branch,sha);
        const start=performance.now(),res=await fetch(preview,{signal:AbortSignal.timeout(10000),redirect:'error'}),html=await res.text();
        if(!res.ok||!html.includes('loading="lazy"'))throw Error('Preview smoke check failed.');
        result={commit:sha,preview,testsPassed:true,report:`أجّلنا تحميل ${patch.count} صورة بعد الصورة الأولى دون تغيير روابط الصور. نجح اختبار الحفاظ على الروابط وفحص صفحة المعاينة. زمن طلب دخولي واحد: ${Math.round(performance.now()-start)} مللي ثانية؛ ليس قياساً لتحسن سرعة الهاتف.`};
      }else{
        const staged=JSON.parse(await readFile(join(store,requestId,'stage.json'),'utf8'));
        if(!staged.testsPassed||!staged.commit||staged.commit!==commit||await hashTree(dir)!==commit)throw Error('Deployment does not match the tested artifact.');
        result={commit,deploymentUrl:await deploy(dir,cfg.PAGES_PRODUCTION_BRANCH,commit)};
      }
      await serializeJson(receipt,result);
    }catch(e){await serializeJson(receipt,{error:e.message});}
    finally{running.delete(requestId);}
  })();
  return null;
}
createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
  const reply=(code,x)=>{res.statusCode=code;res.end(JSON.stringify(x));};
  if(req.method!=='POST'||req.url!=='/release')return reply(404,{error:'Not found'});
  if(!auth(req.headers.authorization,cfg.RELEASE_SERVICE_TOKEN)&&!auth(req.headers.authorization,cfg.RELEASE_DEPLOY_TOKEN))return reply(401,{error:'Unauthorized'});
  try{
    const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>18000)return reply(413,{error:'Too large'});chunks.push(c);}
    const command=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!auth(req.headers.authorization,command.operation==='deploy'?cfg.RELEASE_DEPLOY_TOKEN:cfg.RELEASE_SERVICE_TOKEN))return reply(403,{error:'Operation not permitted'});
    const result=await run(command);
    if(!result)return reply(202,{pending:true});
    if(result.error)return reply(422,result);
    return reply(200,result);
  }catch{reply(400,{error:'Invalid release request'});}
}).listen(port,'127.0.0.1');
