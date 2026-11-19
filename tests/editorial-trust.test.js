const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const trust = require("../article-trust.js");
const ID = "11111111-1111-4111-8111-111111111111";
class Element {
  constructor(tag, doc) {this.tag=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.attributes={};this.textContent="";this.className="";this.value="";this.checked=false;this.disabled=false;this.handlers={};this.classList={add:()=>{},remove:()=>{},toggle:()=>{},contains:()=>false};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;this.textContent="";}
  setAttribute(key,value){this.attributes[key]=value;}
  removeAttribute(key){delete this.attributes[key];}
  addEventListener(name,fn){this.handlers[name]=fn;}
  querySelectorAll(){return [];}
  get allText(){return [this.textContent,...this.children.map(c=>c.allText)].join(" ");}
  get allNodes(){return [this,...this.children.flatMap(c=>c.allNodes)];}
}
function dom(){const doc={createElement(tag){return new Element(tag,doc);}};return {doc,root:new Element("section",doc)};}
const fixture={id:ID,lang:"ar",source_language:"en",editorial_trust_status:"disputed",trust_needs_review:false,source_name:"Fixture Publisher",source_url:"https://example.org/source",agency_name:"Fixture Agency",agency_narrative:"Agency account, not proof",agency_account_url:"https://example.org/profile",human_translation_status:"pending",claims:[{claim_text:"<img src=x onerror=alert(1)>",status:"disputed",supporting_evidence:[{publisher:"Reporter",evidence_url:"https://example.org/report"}]}],evidence:[{publisher:"Unsafe link",evidence_url:"javascript:alert(1)",evidence_type:"official_statement",independence_recorded:false}],history:[{changed_at:"2026-11-15T00:00:00Z",change_type:"correction",public_note:"First correction"}]};
test("URLs reject script/data credentials and control characters",()=>{
 for(const value of ["javascript:alert(1)","data:text/html,x","//example.org/x","https://user:password@example.org/x","https://example.org/a b","https://example.org/\n",null])assert.equal(trust.safeUrl(value),null);
 assert.equal(trust.safeUrl("https://example.org/source"),"https://example.org/source");
});
test("UUID-only RPC and canonical record identity",async()=>{
 let called=false;
 await assert.rejects(trust.fetchTrust("not-a-story",{fetch:()=>{called=true;}}),/UUID/);assert.equal(called,false);
 await assert.rejects(trust.fetchTrust(ID,{fetch:async()=>({ok:true,json:async()=>({...fixture,id:"22222222-2222-4222-8222-222222222222"})})}),/Invalid/);
});
test("anonymous RPC never sends session cookies or bearer/access tokens",async()=>{
 let captured;
 const result=await trust.fetchTrust(ID,{lang:"en",fetch:async(url,options)=>{captured={url,options};return {ok:true,json:async()=>fixture};}});
 assert.equal(result,fixture);assert.match(captured.url,/\/rest\/v1\/rpc\/get_public_article_trust$/);
 assert.equal(captured.options.credentials,"omit");assert.equal(captured.options.cache,"no-store");assert.equal(captured.options.headers.Authorization,undefined);
 assert.deepEqual(JSON.parse(captured.options.body),{p_article_id:ID,p_lang:"en"});assert.match(captured.options.headers.apikey,/^sb_publishable_/);
});
test("failure/missing public row is not presented as verified",async()=>{
 await assert.rejects(trust.fetchTrust(ID,{fetch:async()=>({ok:false,status:403})}),/unavailable/);
 assert.equal(await trust.fetchTrust(ID,{fetch:async()=>({ok:true,json:async()=>null})}),null);
 const {root}=dom();trust.render(root,null,"en");assert.match(root.allText,/No public editorial context/);assert.doesNotMatch(root.allText,/Human-reviewed confirmation/);
});
test("DOM rendering uses text and safe links, shows agency attribution and uncertainty",()=>{
 const {root}=dom();trust.render(root,fixture,"en");
 assert.match(root.allText,/Disputed/);assert.match(root.allText,/AI confidence does not verify/);assert.match(root.allText,/not independent proof/);
 assert.match(root.allText,/without a recorded human review/);assert.match(root.allText,/republication is not/);assert.match(root.allText,/First correction/);
 assert.match(root.allText,/<img src=x onerror=alert\(1\)>/);assert.equal(root.allNodes.some(n=>n.tag==="img"),false);
 assert.equal(root.allNodes.some(n=>String(n.href||"").startsWith("javascript:")),false);
 for(const link of root.allNodes.filter(n=>n.tag==="a"))assert.equal(link.rel,"noopener noreferrer");
});
test("stale and unknown status cannot imply confirmation or AI certainty",()=>{
 const {root}=dom();trust.render(root,{...fixture,editorial_trust_status:"confirmed",trust_needs_review:true,claims:[{claim_text:"Previously confirmed",status:"confirmed"}]},"en");
 assert.doesNotMatch(root.allText,/Human-reviewed confirmation/);assert.match(root.allText,/new assessment/);
 trust.render(root,{...fixture,editorial_trust_status:"ai_confidence_99",claims:[]},"ar");assert.match(root.allText,/غير مؤكد/);assert.equal(root.dir,"rtl");
});
test("reviewed translation provenance and original excerpt remain distinct",()=>{
 const {root}=dom();trust.render(root,{...fixture,trust_source_excerpt:"Original source quote",human_translation_status:"reviewed",human_translation_reviewed_at:"2026-11-15T00:00:00Z",reviewed_translation:{lang:"en",title:"Translated heading",summary:"Translated text",translation_source:"machine_draft",reviewed_at:"2026-11-15T00:00:00Z"}},"en");
 assert.match(root.allText,/Editor-recorded source-language excerpt/);assert.match(root.allText,/Human-reviewed translation for comparison/);assert.match(root.allText,/Machine-origin translation followed by human review/);
});
test("failed lazy refresh preserves safe SSR context; fresh mount fails closed",async()=>{
 const {root}=dom();root.dataset.articleId=ID;root.dataset.trustSsr="true";root.append(root.ownerDocument.createElement("p"));root.children[0].textContent="Safe SSR content";
 await trust.mount(root,{lang:"en",fetch:async()=>{throw Error("offline");}});assert.match(root.allText,/Safe SSR content/);assert.equal(root.attributes["aria-busy"],undefined);
 delete root.dataset.trustSsr;await trust.mount(root,{lang:"en",fetch:async()=>{throw Error("offline");}});assert.match(root.allText,/Missing data does not imply confirmation/);
});
test("stale response cannot replace a newer language/render request",async()=>{
 const {root}=dom();root.dataset.articleId=ID;let release;
 const older=trust.mount(root,{lang:"ar",fetch:()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>fixture});})});
 await trust.mount(root,{lang:"en",fetch:async()=>({ok:true,json:async()=>fixture})});release();await older;assert.equal(root.dir,"ltr");
});
test("admin editorial portion handles RPC rejection without falsely claiming success",async()=>{
 const {doc}=dom(),elements=new Map();doc.getElementById=id=>{if(!elements.has(id))elements.set(id,new Element("div",doc));return elements.get(id);};
 let notices=[];let writes=0;
 const context={document:doc,$:doc.getElementById,t:(ar,en)=>en,currentLang:()=>"en",cachedArticles:[],trustSchemaAvailable:true,db:{rpc:async()=>{writes++;return {error:{message:"Unreviewed translation cannot be confirmed"}};}},message:v=>notices.push(v),loadArticles:async()=>{},confirm:()=>true,URL,console};
 vm.createContext(context);const admin=fs.readFileSync(require.resolve("../admin.js"),"utf8");vm.runInContext(admin.slice(admin.indexOf("// Editorial trust editor:")),context);
 doc.getElementById("articleId").value=ID;doc.getElementById("trustReviewNote").value="Human review";doc.getElementById("trustTranslationStatus").value="pending";doc.getElementById("trustStoryStatus").value="confirmed";
 vm.runInContext(`activeTrustId="${ID}"`,context);
 await doc.getElementById("trustReviewStory").handlers.click();
 assert.equal(writes,1);assert.equal(notices.length,0);assert.match(doc.getElementById("trustEditorStatus").textContent,/Unreviewed translation/);assert.equal(doc.getElementById("trustReviewStory").disabled,false);
});
test("admin canonical links and no snapshots/new SQL mass-demotion regressions",()=>{
 const admin=fs.readFileSync(require.resolve("../admin.js"),"utf8");assert.match(admin,/window\.open\("\/news\/"/);assert.doesNotMatch(admin,/index\.html\?article=/);
 const sql=fs.readFileSync(require("node:path").join(__dirname,"../supabase/migrations/20261115030000_editorial_trust.sql"),"utf8");
 assert.match(sql,/security definer set search_path=pg_catalog,public/);assert.doesNotMatch(sql,/grant select on public\.articles to anon/i);
 const publicRpc=sql.slice(sql.indexOf("create or replace function public.get_public_article_trust"));
 assert.doesNotMatch(publicRpc,/jsonb_build_object\([^)]*'created_by'/);assert.doesNotMatch(publicRpc,/'before_snapshot'|'after_snapshot'/);assert.match(publicRpc,/editorial_status='published'/);
});

function adminListHarness(metadataError=false){
 const {doc}=dom(),elements=new Map(),selects=[],rpcCalls=[];
 doc.getElementById=id=>{if(!elements.has(id))elements.set(id,new Element("div",doc));return elements.get(id);};
 const story={id:ID,title:"Fixture story",editorial_status:"published"};
 const db={from(table){assert.equal(table,"articles");return {select(columns){selects.push(columns);return {order(){return this;},limit(n){assert.equal(n,200);return Promise.resolve({data:[story],error:null});}};}};},async rpc(name,args){rpcCalls.push({name,args});return metadataError?{error:{message:"Editor/admin required"}}:{data:[{id:ID,trust_review_note:"PRIVATE_NOTE",human_translation_note:"PRIVATE_TRANSLATION_NOTE"}],error:null};}};
 const context={db,$:doc.getElementById,t:(ar,en)=>en,cachedArticles:[],trustSchemaAvailable:false,editorialExtrasAvailable:false,renderArticleList:()=>{},Map};
 vm.createContext(context);
 const admin=fs.readFileSync(require.resolve("../admin.js"),"utf8");
 vm.runInContext(admin.slice(admin.indexOf("async function loadArticles(){"),admin.indexOf("async function classifyPending(){")),context);
 return {context,selects,rpcCalls};
}
test("admin list uses safe table projection and bounded editor metadata RPC",async()=>{
 const {context,selects,rpcCalls}=adminListHarness();
 await context.loadArticles();
 assert.equal(context.trustSchemaAvailable,true);
 assert.equal(context.cachedArticles[0].trust_review_note,"PRIVATE_NOTE");
 assert.equal(context.cachedArticles[0].human_translation_note,"PRIVATE_TRANSLATION_NOTE");
 assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,"get_editor_article_trust");
 assert.deepEqual(Array.from(rpcCalls[0].args.p_article_ids),[ID]);
 for(const columns of selects)assert.doesNotMatch(columns,/trust_review_note|trust_reviewed_by|human_translation_note|human_translation_reviewed_by|\*/);
});
test("admin metadata rejection disables trust editing and preserves core list",async()=>{
 const {context,selects,rpcCalls}=adminListHarness(true);
 await context.loadArticles();
 assert.equal(context.trustSchemaAvailable,false);assert.equal(context.cachedArticles[0].title,"Fixture story");
 assert.equal(context.cachedArticles[0].trust_review_note,undefined);assert.equal(rpcCalls.length,1);
 assert.equal(selects.length,3);assert.doesNotMatch(selects[1],/trust_|human_translation/);
 for(const columns of selects)assert.doesNotMatch(columns,/trust_review_note|trust_reviewed_by|human_translation_note|human_translation_reviewed_by|\*/);
});
test("all current browser article and embedded translation projections fit safe grants",()=>{
 const path=require("node:path");
 const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
 const sql=read("supabase/migrations/20261115030000_editorial_trust.sql");
 const lists=[...sql.matchAll(/allowed:=array\[([\s\S]*?)\];/g)].map(m=>new Set([...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1])));
 assert.equal(lists.length,2);const [articles,translations]=lists;
 const check=(projection,label)=>{
  assert.doesNotMatch(projection,/\*/);
  projection=projection.replace(/article_translations\(([^)]+)\)/g,(_,cols)=>{for(const column of cols.split(","))assert.ok(translations.has(column.trim()),label+" translation "+column);return "";});
  for(const column of projection.split(",").map(x=>x.trim()).filter(Boolean))assert.ok(articles.has(column),label+" article "+column);
 };
 const main=read("script.js");
  assert.match(main,/\/rest\/v1\/rpc\/public_home_news_recent/,"script.js must use the public homepage RPC");
  assert.match(read("newsroom.js"),/\/rest\/v1\/rpc\/public_home_news_recent/,"newsroom.js must use the public homepage RPC");
  const publicRpc=read("supabase/migrations/20261115070000_public_home_news_rpc.sql");
  const projection=publicRpc.match(/returns table\s*\(([\s\S]*?)\)\s*language sql/i)?.[1];
  assert.ok(projection,"public homepage RPC has an explicit return projection");
  for(const privateColumn of ["received_at","ai_confidence","verification_source_count","verification_note","exclusive_reason","exclusive_confidence","trust_review_note","trust_reviewed_by","human_translation_note","human_translation_reviewed_by"]) {
    assert.doesNotMatch(projection,new RegExp("\\b"+privateColumn+"\\b"),"public RPC must not expose "+privateColumn);
  }
  const saved=main.match(/\.select\("article_id, article:articles\(([^"]+)\)"\)/)[1];
  check(saved,"script.js saved-library embed");
  check(read("intelligence-sources.js").match(/const select="([^"]+)"/)[1],"intelligence-sources.js");
 check(read("map.js").match(/articles\?select=([^"&]+)/)[1],"map.js");
 const shorts=read("shorts.js");
 assert.match(shorts,/\/rest\/v1\/rpc\/public_home_news_recent_v2/,"Shorts must use the allowlisted public feed RPC");
 assert.doesNotMatch(shorts,/\/rest\/v1\/articles\?/,"Shorts must not SELECT directly from public.articles");
 const admin=read("admin.js");
 check(admin.match(/const core="([^"]+)"/)[1],"admin.js core");
 check(admin.match(/const trust="([^"]+)"/)[1],"admin.js safe trust");
 check(admin.match(/const extra=await db\.from\("articles"\)\.select\("([^"]+)"/)[1],"admin.js optional extras");
 const review=admin.match(/db\.from\("article_translations"\)\.select\("([^"]+)"/)[1];
 const embedded=review.match(/article:articles\(([^)]+)\)/)[1];check(embedded,"admin.js review parent");
 for(const column of review.replace(/,article:articles\([^)]+\)/,"").split(","))assert.ok(translations.has(column),"admin.js review "+column);
 for(const privateColumn of ["trust_review_note","trust_reviewed_by","human_translation_note","human_translation_reviewed_by"])assert.equal(articles.has(privateColumn),false);
 for(const privateColumn of ["human_review_note","reviewed_by"])assert.equal(translations.has(privateColumn),false);
});
test("trust SQL retains atomic grant hardening and SSR publication boundary",()=>{
 const sql=fs.readFileSync(require("node:path").join(__dirname,"../supabase/migrations/20261115030000_editorial_trust.sql"),"utf8");
 assert.match(sql,/revoke select on table public\.%I from public,anon,authenticated/);
 assert.match(sql,/revoke select \(%s\) on table public\.%I from public,anon,authenticated/);
 assert.match(sql,/as restrictive for select to authenticated/);
 assert.match(sql,/keys:=array\['title','summary','lang','source_language'/);
 assert.match(sql,/a\.published_at is not null and a\.published_at<=now\(\)/);
 assert.match(sql,/source_url',case when private\.trust_safe_url\(a\.url\) then a\.url when private\.trust_safe_url\(a\.source_url\)/);
 assert.match(sql,/c\.status='confirmed' and c\.reviewed_by is not null and c\.reviewed_at is not null/);
 assert.match(sql,/cardinality\(p_article_ids\)>200/);
 assert.ok(sql.indexOf("revoke select on table public.%I")<sql.lastIndexOf("commit;"));
});
