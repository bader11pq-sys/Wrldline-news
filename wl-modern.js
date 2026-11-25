/* WRLDLINE modern access layer: quick section chips + mobile tab bar + all-sections sheet */
(function(){
 'use strict';
 if(window.__wlModern)return;window.__wlModern=true;
 const t=(ar,e)=>document.documentElement.lang==='en'?e:ar;
 const path=location.pathname.replace(/\/index\.html$/,'/');
 const isHome=document.body.classList.contains('wl-home')||path==='/'||path==='';
 const ico={
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  live:'<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 000 11.4M17.7 6.3a8 8 0 010 11.4"/>',
  grid:'<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'
 };
 const svg=k=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+ico[k]+'</svg>';
 /* The complete hierarchy comes from site-sections.js through site-nav.js.
  * This file keeps no section list of its own. */
 const openSheet=()=>{ if(window.WLSiteNav) window.WLSiteNav.open(); };
 const href=h=>/^(\/|#|https?:)/.test(h)?h:'/'+h;

 // 1) Section chips (mobile): mirror the primary nav so sections are one tap away
 const header=document.querySelector('header.wl-header,header');
 const primary=[...document.querySelectorAll('.wl-nav-scroll a')];
 if(header&&primary.length){
  const bar=document.createElement('nav');bar.className='wlm-chips';bar.dataset.languageManaged='';bar.setAttribute('aria-label',t('تنقل سريع بين الأقسام','Quick sections'));
  const inner=document.createElement('div');inner.className='wlm-chips-in';
  const labelOf=a=>a.querySelector(`:scope > span[lang="${document.documentElement.lang}"]`)?.textContent.trim() ?? a.textContent.trim();
  primary.forEach(a=>{
   const c=document.createElement('a');c.className='wlm-chip';c.href=a.getAttribute('href');
   if(a.hreflang)c.hreflang=a.hreflang;
   if(a.classList.contains('wl-nav-link--live')){c.classList.add('wlm-chip--live');c.innerHTML='<i aria-hidden="true"></i>';c.append(labelOf(a));}
   else c.textContent=labelOf(a);
   if(a.dataset.category){
    c.dataset.readerCategory=a.dataset.category;
    c.addEventListener('click',e=>{
     if(e.metaKey||e.ctrlKey||e.altKey||e.shiftKey||!document.body.classList.contains('wl-home'))return;
     e.preventDefault();a.click();
    });
   }
   inner.appendChild(c);
  });
  const all=primary.some(a=>a.getAttribute('href')==='sections.html')?null:document.createElement('button');
  if(all){all.type='button';all.className='wlm-chip';all.setAttribute('aria-haspopup','dialog');all.addEventListener('click',openSheet);inner.appendChild(all);}
  bar.appendChild(inner);header.after(bar);
  const syncChips=()=>{
   bar.setAttribute('aria-label',t('تنقل سريع بين الأقسام','Quick sections'));
   primary.forEach((a,i)=>{
    const chip=inner.children[i];const label=labelOf(a);
    if(chip.lastChild?.nodeType===Node.TEXT_NODE)chip.lastChild.nodeValue=label;
    const current=a.getAttribute('aria-current');
    chip.classList.toggle('is-active',!!current);
    if(current)chip.setAttribute('aria-current',current);else chip.removeAttribute('aria-current');
   });
   if(all)all.textContent=t('كل الأقسام','All sections');
  };
  syncChips();document.addEventListener('wrldline:category',syncChips);document.addEventListener('wrldline:language',syncChips);
 }

 // 2) The all-sections sheet is the shared registry drawer (site-nav.js).

 // 3) Mobile bottom tab bar
 const tab=document.createElement('nav');tab.className='wlm-tabbar';tab.dataset.languageManaged='';
 const items=[
  {k:'home',l:['الرئيسية','Home'],h:'/',active:isHome},
  {k:'live',l:['عاجل','Breaking'],h:isHome?'#breakingSection':'/#breakingSection',cls:'wlm-tab--live'},
  {k:'grid',l:['الأقسام','Sections'],btn:openSheet,dialog:'siteDrawer'},
  {k:'search',l:['بحث','Search'],btn:()=>{const s=document.getElementById('searchButton');if(s)s.click();else location.href='/news/';},dialog:document.getElementById('searchOverlay')?.id},
  {k:'user',l:['حسابي','Account'],h:'/account.html',active:/account\.html$/.test(path)}
 ];
 items.forEach(i=>{
  const el=document.createElement(i.btn?'button':'a');el.className='wlm-tab'+(i.cls?' '+i.cls:'')+(i.active?' is-active':'');
  if(i.btn){el.type='button';el.addEventListener('click',i.btn);}else el.href=i.h;
  if(i.dialog){el.setAttribute('aria-haspopup','dialog');el.setAttribute('aria-controls',i.dialog);}
  if(i.active)el.setAttribute('aria-current','page');
  el.innerHTML=svg(i.k)+'<span>'+t(...i.l)+'</span>';tab.appendChild(el);
 });
 document.body.appendChild(tab);document.body.classList.add('wlm-has-tabbar');
 const syncTab=()=>{
  tab.setAttribute('aria-label',t('التنقل الرئيسي','Main navigation'));
  items.forEach((item,i)=>{tab.children[i].querySelector('span').textContent=t(...item.l);});
 };
 tab.setAttribute('aria-label',t('التنقل الرئيسي','Main navigation'));
 document.addEventListener('wrldline:language',syncTab);
})();
