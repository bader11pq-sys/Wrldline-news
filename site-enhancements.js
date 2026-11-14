(function(){
 'use strict';
 if(document.body.dataset.wlEnhanced==='1')return;
 document.body.dataset.wlEnhanced='1';document.body.classList.add('wl-enhanced');
 const bar=document.createElement('div');bar.className='wl-reading-progress';bar.setAttribute('aria-hidden','true');document.body.prepend(bar);
 const skip=document.createElement('a');skip.className='wl-skip-enhanced';skip.href=document.querySelector('#main')?'#main':'#mainContent';skip.textContent='انتقل إلى المحتوى';document.body.prepend(skip);
 const top=document.createElement('button');top.className='wl-top-button';top.type='button';top.setAttribute('aria-label','العودة إلى أعلى الصفحة');top.textContent='↑';document.body.append(top);
 const update=()=>{const h=document.documentElement,s=h.scrollHeight-h.clientHeight,p=s>0?(scrollY/s)*100:0;bar.style.width=Math.min(100,p)+'%';top.classList.toggle('is-visible',scrollY>520)};
 addEventListener('scroll',update,{passive:true});update();top.addEventListener('click',()=>scrollTo({top:0,behavior:'smooth'}));
 const reveal=()=>{if(!('IntersectionObserver' in window)){document.querySelectorAll('.wl-reveal').forEach(x=>x.classList.add('is-revealed'));return}const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-revealed');io.unobserve(e.target)}}),{threshold:.08,rootMargin:'0px 0px -30px'});document.querySelectorAll('main section,main article,.nr-card,.hx-card,.short-card,.news-card').forEach((x,i)=>{if(!x.classList.contains('wl-reveal')){x.classList.add('wl-reveal');x.style.transitionDelay=Math.min(i%8,7)*35+'ms'}io.observe(x)})};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reveal,{once:true});else reveal();
 document.querySelectorAll('a[target="_blank"]').forEach(a=>{if(!a.rel.includes('noopener'))a.rel=(a.rel+' noopener noreferrer').trim();a.classList.add('wl-external-link')});
 addEventListener('keydown',e=>{if((e.key==='/'&&!/input|textarea|select/i.test(document.activeElement?.tagName))||(e.key.toLowerCase()==='k'&&(e.ctrlKey||e.metaKey))){const input=document.querySelector('#searchInput,.search-input,input[type="search"]');if(input){e.preventDefault();input.focus();input.select()}else{const trigger=document.querySelector('#searchButton,.wl-search-trigger');if(trigger){e.preventDefault();trigger.click()}}}if(e.key==='Escape'){document.querySelectorAll('.is-open,.mobile-open,[aria-expanded="true"]').forEach(x=>{if(x.classList.contains('is-open')||x.classList.contains('mobile-open'))x.classList.remove('is-open','mobile-open');if(x.matches('[aria-expanded="true"]'))x.setAttribute('aria-expanded','false')})}});
})();
