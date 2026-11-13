(()=> {
"use strict";
if(window.WRLDLINE_SHARE)return;
const isEN=()=>localStorage.getItem("wrldline:language")==="en";
const tr=(ar,en)=>isEN()?en:ar;
const clean=s=>String(s||"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(message){let n=document.getElementById("wrldlineShareToast");if(!n){n=document.createElement("div");n.id="wrldlineShareToast";n.setAttribute("role","status");document.body.appendChild(n);}n.textContent=message;n.classList.add("show");clearTimeout(n._timer);n._timer=setTimeout(()=>n.classList.remove("show"),3600);}
function payloadFrom(el){
 const title=clean(el.dataset.shareTitle||el.querySelector("h1,h2,h3,h4,.era-title,strong")?.textContent||el.closest("section")?.querySelector("h1,h2,h3,h4")?.textContent||document.querySelector("main h1,h1")?.textContent||document.title);
 const paragraphs=[...el.querySelectorAll("p")].map(p=>p.textContent).filter(Boolean).join(" ");
 const raw=clean(el.innerText||el.textContent).replace(/مشاركة الصورة|Share image/g,"");
 const desc=clean(el.dataset.shareText||el.dataset.shareDescription||paragraphs||raw.replace(title,"").slice(0,500));
 const meta=clean(el.dataset.shareMeta||el.querySelector(".risk,.category-label,.briefing-tag,.eu-meta,.event-top,.shorts-category,.eyebrow,.year")?.textContent||document.querySelector("main .eyebrow")?.textContent||"");
 const source=clean(el.dataset.shareSource||el.querySelector(".card-byline,.story-byline,.shorts-footer,.eu-card-foot small,small")?.textContent||"");
 const img=el.dataset.shareImage||el.querySelector("img[src]")?.currentSrc||el.querySelector("img[src]")?.src||"";
 return {title,description:desc,category:meta,source,image:img};
}
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function wrap(ctx,text,x,y,maxWidth,lineHeight,maxLines,align="right"){
 const words=clean(text).split(" ");let line="",lines=[];
 for(const word of words){const test=line?line+" "+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}else line=test;}
 if(line)lines.push(line);
 if(lines.length>maxLines){lines=lines.slice(0,maxLines);let last=lines[maxLines-1];while(last&&ctx.measureText(last+"…").width>maxWidth)last=last.slice(0,-1);lines[maxLines-1]=last+"…";}
 ctx.textAlign=align;lines.forEach((v,i)=>ctx.fillText(v,x,y+i*lineHeight));return y+lines.length*lineHeight;
}
async function loadImage(url){
 if(!url||!/^https?:/i.test(url))return null;
 return await new Promise(resolve=>{const img=new Image();img.crossOrigin="anonymous";img.referrerPolicy="no-referrer";img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=url;});
}
async function renderCard(data){
 const canvas=document.createElement("canvas");canvas.width=1200;canvas.height=630;
 const c=canvas.getContext("2d");
 const g=c.createLinearGradient(0,0,1200,630);g.addColorStop(0,"#091525");g.addColorStop(.55,"#142b43");g.addColorStop(1,"#08111e");c.fillStyle=g;c.fillRect(0,0,1200,630);
 c.fillStyle="rgba(215,174,104,.09)";c.beginPath();c.arc(1120,20,310,0,Math.PI*2);c.fill();
 c.fillStyle="rgba(99,153,194,.08)";c.beginPath();c.arc(35,620,260,0,Math.PI*2);c.fill();
 c.fillStyle="#d8b475";rounded(c,64,54,8,520,4);
 c.fillStyle="#e3bd7d";c.font="800 24px Arial";c.textAlign="left";c.fillText("WRLDLINE",94,82);
 c.fillStyle="#9fb1c5";c.font="500 13px Arial";c.fillText("GLOBAL NEWS NETWORK",94,105);
 const image=await loadImage(data.image);
 if(image){const x=64,y=150,w=420,h=410,scale=Math.max(w/image.width,h/image.height),sw=w/scale,sh=h/scale,sx=(image.width-sw)/2,sy=(image.height-sh)/2;c.save();c.beginPath();c.roundRect(x,y,w,h,18);c.clip();c.drawImage(image,sx,sy,sw,sh,x,y,w,h);const shade=c.createLinearGradient(0,y,0,y+h);shade.addColorStop(0,"rgba(5,12,22,.03)");shade.addColorStop(1,"rgba(5,12,22,.72)");c.fillStyle=shade;c.fillRect(x,y,w,h);c.restore();}
 else {c.fillStyle="rgba(255,255,255,.045)";rounded(c,64,150,420,410,18);c.fillStyle="#d8b475";c.font="800 150px Arial";c.textAlign="center";c.fillText("W",274,390);c.fillStyle="#9fb1c5";c.font="600 15px Arial";c.fillText("WORLD • NEWS • CONTEXT",274,455);}
 const right=1100,width=560;
 c.fillStyle="#d8b475";c.font="700 17px Arial";c.textAlign="right";c.fillText((data.category||"WRLDLINE • "+tr("محتوى مختار","SELECTED CONTENT")).slice(0,58),right,176);
 c.fillStyle="#f5f7fa";c.font="700 46px 'IBM Plex Sans Arabic',Arial,sans-serif";
 let y=wrap(c,data.title||tr("معلومة من WRLDLINE","A WRLDLINE insight"),right,245,width,62,3);
 c.fillStyle="#c0ccda";c.font="400 25px 'IBM Plex Sans Arabic',Arial,sans-serif";
 y=wrap(c,data.description||tr("من تغطية ومحتوى WRLDLINE.","From WRLDLINE coverage and insights."),right,y+22,width,42,4);
 c.fillStyle="#8fa4ba";c.font="500 16px 'IBM Plex Sans Arabic',Arial,sans-serif";
 const source=clean(data.source);if(source)wrap(c,source,right,Math.min(535,Math.max(y+22,500)),width,26,1);
 c.fillStyle="#d8b475";c.fillRect(94,584,1012,1);
 c.fillStyle="#a8b7c8";c.font="500 15px Arial";c.textAlign="left";c.fillText("AL-GHAIB.US.CI",94,610);
 c.textAlign="right";c.fillText(new Date().toLocaleDateString(isEN()?"en-US":"ar-SA"),1106,610);
 return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG generation failed")),"image/png",.94));
}
function caption(data){return [data.title,data.description,data.category?"\n"+data.category:"",data.source?"\n"+data.source:"","\n#WRLDLINE"].filter(Boolean).join("\n").slice(0,1800);}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),15000);}
async function share(data){
 const payload={title:clean(data.title)||"WRLDLINE NEWS",description:clean(data.description),category:clean(data.category),source:clean(data.source),image:data.image||""};
 const button=data.button;if(button){button.disabled=true;button.dataset.busy="1";}
 try{
  const blob=await renderCard(payload),file=new File([blob],"wrldline-share.png",{type:"image/png"}),text=caption(payload);
  if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
   await navigator.share({files:[file],title:payload.title,text});toast(tr("تم فتح المشاركة بالصورة والنص","Image and caption ready to share"));return true;
  }
  download(blob,"wrldline-share.png");
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);toast(tr("حُفظت الصورة ونُسخ النص. أرفق الصورة في التطبيق الذي تريده.","Image saved and caption copied. Attach the image in your app."));}
  else {toast(tr("حُفظت الصورة. انسخ النص من نافذة المشاركة التالية.","Image saved. Copy the caption from the next prompt."));window.prompt(tr("النص المرافق للصورة","Image caption"),text);}
  return true;
 }catch(error){
  if(error?.name==="AbortError")return false;
  console.error("WRLDLINE share:",error);toast(tr("تعذر تجهيز بطاقة المشاركة. حاول مرة أخرى.","Could not prepare the share card. Please try again."));return false;
 }finally{if(button){button.disabled=false;delete button.dataset.busy;}}
}

const inlineSelectors=[".event",".country-summary",".detail",".briefing-story",".briefing-list-item",".atlas-event",".eu-card",".chapter",".culture",".lab-card",".hd-event",".hd-card",".history-photo",".market-card",".market-tape-panel",".market-widget-shell",".markets-hero",".shorts-slide",".leaflet-popup-content",".era",".fact",".point",".briefing-category",".market-disclosure",".stat",".sources"];
function attachInline(root=document){
 if(root.nodeType===1&&root.matches?.(inlineSelectors.join(",")))addInline(root);
 root.querySelectorAll?.(inlineSelectors.join(",")).forEach(addInline);
}
function addInline(el){
 if(el.dataset.wrldlineShareReady==="1"||el.closest("#wrldlineShareToast")||el.querySelector(".shorts-share,.wrldline-share-button"))return;
 el.dataset.wrldlineShareReady="1";
 const b=document.createElement("button");b.type="button";b.className="wrldline-share-button";b.textContent=tr("مشاركة","Share");b.setAttribute("aria-label",tr("مشاركة هذا المحتوى","Share this content"));
 b.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();share({...payloadFrom(el),button:b});});
 if(el.matches("[role=button]")){el.style.position=el.style.position||"relative";b.classList.add("wrldline-share-overlay");el.appendChild(b);}else el.appendChild(b);
}
const shareStyle=document.createElement("style");shareStyle.textContent=".wrldline-share-button{display:inline-flex;align-items:center;justify-content:center;margin:8px 0 0;padding:7px 11px;border:1px solid rgba(216,180,117,.5);border-radius:8px;background:rgba(216,180,117,.09);color:inherit;font:600 11px system-ui,sans-serif;cursor:pointer;position:relative;z-index:2}.wrldline-share-button:hover{background:rgba(216,180,117,.18)}.wrldline-share-overlay{position:absolute;inset-inline-end:12px;bottom:12px}.wrldline-share-button:disabled{opacity:.6;cursor:wait}";document.head.appendChild(shareStyle);
window.WRLDLINE_SHARE={share,payloadFrom,attach:attachInline};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>attachInline());else attachInline();
const inlineObserver=new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1)attachInline(n);})));
inlineObserver.observe(document.documentElement,{childList:true,subtree:true});
})();
