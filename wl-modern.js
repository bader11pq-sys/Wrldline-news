/* WRLDLINE modern access layer: quick section chips + mobile tab bar + all-sections sheet */
(function(){
 'use strict';
 if(window.__wlModern)return;window.__wlModern=true;
 const en=document.documentElement.lang==='en';
 const t=(ar,e)=>en?e:ar;
 const path=location.pathname.replace(/\/index\.html$/,'/');
 const isHome=path==='/'||path==='';
 const ico={
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  live:'<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 000 11.4M17.7 6.3a8 8 0 010 11.4"/>',
  grid:'<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'
 };
 const svg=k=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+ico[k]+'</svg>';
 const sections=[
  [t('الأخبار','News'),[
   ['index.html',t('الرئيسية','Home'),t('أهم ما يحدث الآن','Top stories now')],
   ['/news/',t('الأرشيف','Archive'),t('كل الأخبار المنشورة','All published news')],
   ['daily-briefing.html',t('ملخص اليوم','Daily briefing'),t('أهم ما حدث باختصار','What mattered today')],
   ['shorts.html','Shorts',t('موجز عمودي سريع','Quick vertical feed')],
   ['context.html',t('ملفات الأحداث','Event dossiers'),t('السياق الكامل للقصص الكبرى','Full context of big stories')],
   ['markets.html',t('الأسواق','Markets'),t('الطاقة والعملات والمؤشرات','Energy, FX and indices')]]],
  [t('الفهم والتحليل','Analysis'),[
   ['balance.html',t('ميزان الروايات','Narrative balance'),t('قارن التغطيات','Compare coverage')],
   ['impact.html',t('أطلس التأثير','Impact atlas'),t('الأثر على المنطقة','Regional impact')],
   ['explainers.html',t('افهمها في دقيقة','Explainers'),t('شرح مبسّط','Simple explainers')],
   ['promises.html',t('ذاكرة الوعود','Promise tracker'),t('القرارات والتعهدات','Decisions & pledges')],
   ['mirror.html',t('مرآة التاريخ','History mirror'),t('الحدث وسياقه التاريخي','Events in context')],
   ['intelligence.html',t('ورلدلاين إنتليجنس','Intelligence'),t('ما تغيّر وما وراءه','What changed and why')]]],
  [t('استكشف','Explore'),[
   ['map.html',t('مرصد العالم','World map'),t('التغطية جغرافياً','Coverage by place')],
   ['topics.html',t('الموضوعات','Topics'),t('حسب اهتمامك','By interest')],
   ['tags.html',t('الوسوم','Tags'),t('أخبار كل وسم','News by tag')],
   ['history.html',t('الموسوعة التاريخية','History'),t('أحداث وشخصيات','Events & people')],
   ['sources.html',t('دليل المصادر','Sources'),t('الناشرون ومصادرنا','Our publishers')],
   ['newsletter.html',t('النشرة البريدية','Newsletter'),t('الأخبار في بريدك','News in your inbox')]]],
  [t('عن ورلدلاين','About'),[
   ['about.html',t('من نحن','About us'),t('رسالتنا ومنهجنا','Mission & method')],
   ['corrections.html',t('التصحيحات','Corrections'),t('الشفافية في الأخطاء','Transparent fixes')],
   ['contact.html',t('تواصل معنا','Contact'),t('راسل غرفة الأخبار','Reach the newsroom')],
   ['account.html',t('حسابي','My account'),t('التفضيلات والمحفوظات','Preferences & saved')]]]
 ];
 const href=h=>/^(\/|#|https?:)/.test(h)?h:'/'+h;

 // 1) Section chips (mobile): mirror the primary nav so sections are one tap away
 const header=document.querySelector('header.wl-header,header');
 const primary=[...document.querySelectorAll('.wl-nav-scroll a')];
 if(header&&primary.length){
  const bar=document.createElement('nav');bar.className='wlm-chips';bar.setAttribute('aria-label',t('تنقل سريع بين الأقسام','Quick sections'));
  const inner=document.createElement('div');inner.className='wlm-chips-in';
  primary.forEach(a=>{
   const c=document.createElement('a');c.className='wlm-chip';c.href=a.getAttribute('href');
   if(a.classList.contains('wl-nav-link--live')){c.classList.add('wlm-chip--live');c.innerHTML='<i aria-hidden="true"></i>';c.append(a.textContent.trim());}
   else c.textContent=a.textContent.trim();
   if(a.classList.contains('is-active'))c.classList.add('is-active');
   if(a.dataset.category||a.getAttribute('href').startsWith('#')){
    c.addEventListener('click',e=>{e.preventDefault();a.click();inner.querySelectorAll('.wlm-chip').forEach(x=>x.classList.remove('is-active'));c.classList.add('is-active');});
   }
   inner.appendChild(c);
  });
  const all=document.createElement('button');all.type='button';all.className='wlm-chip';all.textContent=t('كل الأقسام ←','All sections →');all.addEventListener('click',()=>openSheet());inner.appendChild(all);
  bar.appendChild(inner);header.after(bar);
 }

 // 2) All-sections sheet
 const sheet=document.createElement('div');sheet.className='wlm-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label',t('كل الأقسام','All sections'));
 sheet.innerHTML='<div class="wlm-sheet-backdrop" data-close></div><div class="wlm-sheet-panel"><div class="wlm-sheet-grip"></div><div class="wlm-sheet-head"><h2>'+t('كل الأقسام','All sections')+'</h2><button class="wlm-close" type="button" data-close aria-label="'+t('إغلاق','Close')+'">×</button></div>'+
  sections.map(([g,items])=>'<div class="wlm-group">'+g+'</div><div class="wlm-grid">'+items.map(([h,n,d])=>'<a class="wlm-item" href="'+href(h)+'"><strong>'+n+'</strong><small>'+d+'</small></a>').join('')+'</div>').join('')+'</div>';
 document.body.appendChild(sheet);
 let lastFocus=null;
 function openSheet(){lastFocus=document.activeElement;sheet.classList.add('is-open');document.body.style.overflow='hidden';sheet.querySelector('.wlm-close').focus();}
 function closeSheet(){sheet.classList.remove('is-open');document.body.style.overflow='';lastFocus?.focus?.();}
 sheet.addEventListener('click',e=>{if(e.target.closest('[data-close]'))closeSheet();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheet.classList.contains('is-open'))closeSheet();});

 // 3) Mobile bottom tab bar
 const tab=document.createElement('nav');tab.className='wlm-tabbar';tab.setAttribute('aria-label',t('التنقل الرئيسي','Main navigation'));
 const items=[
  {k:'home',l:t('الرئيسية','Home'),h:'/',active:isHome},
  {k:'live',l:t('عاجل','Breaking'),h:isHome?'#breakingSection':'/#breakingSection',cls:'wlm-tab--live'},
  {k:'grid',l:t('الأقسام','Sections'),btn:openSheet},
  {k:'search',l:t('بحث','Search'),btn:()=>{const s=document.getElementById('searchButton');if(s)s.click();else location.href='/news/';}},
  {k:'user',l:t('حسابي','Account'),h:'/account.html',active:/account\.html$/.test(path)}
 ];
 items.forEach(i=>{
  const el=document.createElement(i.btn?'button':'a');el.className='wlm-tab'+(i.cls?' '+i.cls:'')+(i.active?' is-active':'');
  if(i.btn){el.type='button';el.addEventListener('click',i.btn);}else el.href=i.h;
  if(i.active)el.setAttribute('aria-current','page');
  el.innerHTML=svg(i.k)+'<span>'+i.l+'</span>';tab.appendChild(el);
 });
 document.body.appendChild(tab);document.body.classList.add('wlm-has-tabbar');
})();
