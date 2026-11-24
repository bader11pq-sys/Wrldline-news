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
 const sections=()=>[
  [t('الأقسام التحريرية','Editorial sections'),[
   ['sections.html',t('دليل الأقسام الستة','Six editorial priorities'),t('اعرض كل مسارات التغطية','Browse the coverage guide · Arabic')],
   ['/section/politics',t('السياسة والعلاقات الدولية','Politics & international affairs'),t('القرارات والدبلوماسية','Decisions and diplomacy')],
   ['/section/rights',t('الحقوق والحريات','Rights & freedoms'),t('الحقوق المدنية والعدالة','Civil rights and justice')],
   ['/section/economy',t('الاقتصاد والطاقة والتجارة','Economy, energy & trade'),t('الطاقة والأسعار والشحن','Energy, prices and shipping')],
   ['sections.html#people-society',t('المجتمع والثقافة والشباب','Society, culture & youth'),t('التعليم وفرص العمل','Education and opportunity · Arabic')],
   ['sections.html#world',t('الخليج والعالم العربي','The Gulf & Arab world'),t('مختارات من التغطية الإقليمية','Selected regional coverage · Arabic')],
   ['sections.html#tech-science',t('التقنية والعلوم','Technology & science'),t('البحث والبنية الرقمية','Research and digital infrastructure · Arabic')]]],
  [t('الموجزات والأرشيف','Briefings & archive'),[
   ['/news/',t('الأرشيف','Archive'),t('كل الأخبار المنشورة','All published news')],
   ['daily-briefing.html',t('ملخص اليوم','Daily briefing'),t('أهم ما حدث باختصار','What mattered today')],
   ['shorts.html','Shorts',t('موجز عمودي سريع','Quick vertical feed')]]],
  [t('الفهم والتحليل','Analysis'),[
   ['analysis.html',t('مكتب الفهم والتحليل','Analysis desk'),t('مسارات قراءة وملفات وأدوات متخصصة','Reading paths, dossiers and specialist tools · Arabic')]]]
 ];
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

 // 2) All-sections sheet
 const sheet=document.createElement('dialog');sheet.className='wlm-sheet';sheet.dataset.languageManaged='';sheet.id='wlmSections';sheet.setAttribute('aria-labelledby','wlmSectionsTitle');
 function renderSections(){
  const hrefFor=h=>/^(?:\/news\/$|\/section\/)/.test(h)&&document.documentElement.lang==='en'?h+'?lang=en':href(h);
  sheet.innerHTML='<div class="wlm-sheet-panel"><div class="wlm-sheet-head"><h2 id="wlmSectionsTitle">'+t('كل الأقسام','All sections')+'</h2><button class="wlm-close" type="button" data-close autofocus aria-label="'+t('إغلاق','Close')+'">×</button></div>'+
   sections().map(([g,items])=>'<section><h3 class="wlm-group">'+g+'</h3><ul class="wlm-grid">'+items.map(([h,n,d])=>'<li><a class="wlm-item" href="'+hrefFor(h)+'"><strong>'+n+'</strong><small>'+d+'</small></a></li>').join('')+'</ul></section>').join('')+'</div>';
 }
 renderSections();
 document.body.appendChild(sheet);
 let lastFocus=null;
 function openSheet(){if(sheet.open)return;lastFocus=document.activeElement;sheet.showModal();document.body.classList.add('wlm-sheet-open');}
 function closeSheet(){if(sheet.open)sheet.close();}
 sheet.addEventListener('click',e=>{if(e.target===sheet||e.target.closest('[data-close]'))closeSheet();});
 sheet.addEventListener('close',()=>{
  document.body.classList.remove('wlm-sheet-open');
  if(lastFocus?.isConnected&&lastFocus.getClientRects().length)lastFocus.focus({preventScroll:true});
  else document.querySelector('#searchButton, .wl-brand')?.focus({preventScroll:true});
 });
 matchMedia('(max-width: 900px)').addEventListener('change',event=>{if(!event.matches)closeSheet();});

 // 3) Mobile bottom tab bar
 const tab=document.createElement('nav');tab.className='wlm-tabbar';tab.dataset.languageManaged='';
 const items=[
  {k:'home',l:['الرئيسية','Home'],h:'/',active:isHome},
  {k:'live',l:['عاجل','Breaking'],h:isHome?'#breakingSection':'/#breakingSection',cls:'wlm-tab--live'},
  {k:'grid',l:['الأقسام','Sections'],btn:openSheet,dialog:'wlmSections'},
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
  renderSections();
 };
 tab.setAttribute('aria-label',t('التنقل الرئيسي','Main navigation'));
 document.addEventListener('wrldline:language',syncTab);
})();
