(() => {
  const feed=document.getElementById("shortsFeed"),counter=document.getElementById("shortsCounter");
  const langButton=document.getElementById("shortsLanguage"),themeButton=document.getElementById("shortsTheme"),hint=document.getElementById("shortsHint");
  let lang=localStorage.getItem("wrldline:language")==="en"?"en":"ar",stories=[],active=0,apiUrl="",apiKey="",loading=false,nextOffset=0,hasMore=false,loadingMore=false;
  const labels={ar:{politics:"سياسة",economy:"اقتصاد",security:"أمن ودفاع",tech:"تكنولوجيا",sports:"رياضة",culture:"ثقافة",health:"صحة",world:"حول العالم"},en:{politics:"Politics",economy:"Economy",security:"Security & Defence",tech:"Technology",sports:"Sports",culture:"Culture",health:"Health",world:"Around the world"}};
  const t=(ar,en)=>lang==="ar"?ar:en;
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safe=v=>{try{const u=new URL(v);return ["https:","http:"].includes(u.protocol)?u.href:"";}catch{return "";}};
  const date=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?"":new Intl.DateTimeFormat(lang==="ar"?"ar-SA":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(d);};
  function setLanguage(){document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";langButton.textContent=lang==="ar"?"English":"العربية";}
  function currentStoryId(){return feed.querySelector(".shorts-slide[data-index='"+active+"']")?.dataset.id||"";}
  function updateCounter(){const slides=[...feed.querySelectorAll(".shorts-slide")];if(!slides.length){counter.textContent="— / —";return;}const top=feed.getBoundingClientRect().top;let best=0,dist=Infinity;slides.forEach((s,i)=>{const d=Math.abs(s.getBoundingClientRect().top-top);if(d<dist){dist=d;best=i;}});active=best;counter.textContent=(best+1)+" / "+slides.length;}
  function render(preserveId=""){
    if(!stories.length){feed.innerHTML='<div class="shorts-state"><strong>'+t("لا توجد أخبار منشورة حاليًا","No published stories right now")+'</strong><span>'+t("سيظهر هنا كل خبر منشور في أقسام الموقع.","Every published story from every site section will appear here.")+'</span><button id="shortsRetry">'+t("إعادة المحاولة","Retry")+'</button></div>';document.getElementById("shortsRetry").onclick=loadAll;updateCounter();return;}
    feed.innerHTML=stories.map((a,i)=>{const declaredLang=String(a.lang||"").toLowerCase(),sourceLang=declaredLang.startsWith("ar")?"ar":(declaredLang.startsWith("en")?"en":(/[\u0600-\u06FF]/.test(a.title||"")?"ar":"en")),tr=(a.article_translations||[]).find(x=>x.lang===lang&&x.title&&x.summary),sameLanguage=sourceLang===lang,title=tr?.title||(sameLanguage?(a.title||""):t("الترجمة قيد الإعداد","Translation is being prepared")),summary=tr?.summary||(sameLanguage?(a.summary||""):t("نعمل على تجهيز ترجمة هذا الخبر.","A translation of this story is being prepared.")),img=safe(a.image_url),isVideo=a.media_type==="video",src=safe(a.url||a.source_url),category=labels[lang][a.category]||t("حول العالم","Around the world");return '<article class="shorts-slide" data-index="'+i+'" data-id="'+esc(a.id)+'">'+(img?(isVideo?'<video class="shorts-photo shorts-video" src="'+esc(img)+'" playsinline controls preload="metadata"></video><button class="shorts-video-play" type="button" aria-label="'+t("تشغيل الفيديو","Play video")+'">▶</button>':'<img class="shorts-photo" src="'+esc(img)+'" alt="" loading="'+(i<2?"eager":"lazy")+'">'):'<div class="shorts-no-photo"></div>')+'<div class="shorts-copy"><div class="shorts-meta"><span class="shorts-category">'+esc(category)+'</span>'+(a.is_breaking?'<span class="shorts-category shorts-breaking">'+t("عاجل","BREAKING")+'</span>':"")+'<time>'+esc(date(a.published_at||a.created_at))+'</time></div><h1 dir="auto">'+esc(title)+'</h1><p class="shorts-summary" dir="auto">'+esc(summary||t("لا يتوفر ملخص لهذا الخبر.","No summary is available."))+'</p><div class="shorts-footer"><span>'+esc(a.source_name||t("مصدر إخباري","News source"))+'</span>'+(src?'<a class="shorts-source" href="'+esc(src)+'" target="_blank" rel="noopener noreferrer">'+t("قراءة المصدر الأصلي ↗","Read original source ↗")+'</a>':"")+'</div></div></article>';}).join("");
    feed.querySelectorAll(".shorts-slide").forEach((slide,index)=>{
      const story=stories[index],footer=slide.querySelector(".shorts-footer");if(!story||!footer)return;
      const share=document.createElement("button");share.type="button";share.className="shorts-share";share.textContent=t("مشاركة الخبر","Share story");
      share.addEventListener("click",async()=>{
        const url=new URL("/",location.origin);url.searchParams.set("article",story.id);
        try{if(navigator.share){await navigator.share({title:story.title,text:story.summary||"خبر من WRLDLINE NEWS",url:url.href});return;}
          if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url.href);share.textContent=t("تم نسخ الرابط ✓","Link copied ✓");return;}
          window.prompt(t("انسخ رابط الخبر","Copy story link"),url.href);
        }catch(error){if(error?.name!=="AbortError")console.warn("WRLDLINE Shorts share:",error);}
      });
      footer.append(share);
    });
    if(preserveId){const target=[...feed.querySelectorAll(".shorts-slide")].find(el=>el.dataset.id===preserveId);if(target)target.scrollIntoView({block:"start"});}
    feed.querySelectorAll(".shorts-video-play").forEach(button=>{
      const slide=button.closest(".shorts-slide"),video=slide?.querySelector("video.shorts-video");if(!video)return;
      button.addEventListener("click",async()=>{
        try{await video.play();button.hidden=true;}catch(error){console.warn("WRLDLINE Shorts video:",error);button.textContent=t("تعذر تشغيل الفيديو","Unable to play video");}
      });
      video.addEventListener("playing",()=>{button.hidden=true;});
      video.addEventListener("pause",()=>{button.hidden=false;});
      video.addEventListener("ended",()=>{button.hidden=false;});
      video.addEventListener("error",()=>{button.textContent=t("تعذر تحميل الفيديو","Video failed to load");button.hidden=false;});
    });
    updateCounter();appendMoreButton();
    if("IntersectionObserver" in window){const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting&&e.intersectionRatio>=.6){active=Number(e.target.dataset.index||0);counter.textContent=(active+1)+" / "+stories.length;}}),{root:feed,threshold:[.6]});feed.querySelectorAll(".shorts-slide").forEach(s=>observer.observe(s));}
  }
  async function configure(){
    if(apiKey)return;
    const source=await fetch("/script.js",{cache:"no-store"});if(!source.ok)throw new Error("Could not read public API configuration");
    const code=await source.text();apiUrl=code.match(/const SUPABASE_URL = "([^"]+)"/)?.[1]||"";apiKey=code.match(/const SUPABASE_ANON_KEY = "([^"]+)"/)?.[1]||"";
    if(!apiUrl||!apiKey)throw new Error("Public API configuration not found");
  }
  async function fetchPage(offset,limit){
    const query=apiUrl+"/rest/v1/articles?select=id,title,summary,category,lang,image_url,media_type,url,source_url,source_name,is_breaking,published_at,created_at,article_translations(lang,title,summary)&editorial_status=eq.published&order=published_at.desc&limit="+limit+"&offset="+offset;
    const response=await fetch(query,{headers:{apikey:apiKey,Authorization:"Bearer "+apiKey},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error("News API HTTP "+response.status);
    const rows=await response.json();if(!Array.isArray(rows))throw new Error("Invalid news response");
    return rows;
  }
  function mergeRows(rows){
    const known=new Map(stories.map(a=>[String(a.id),a]));let changed=false;
    rows.forEach(a=>{
      if(!a?.id||!a.title||/t\\.me|telegram\\.me|telegram/i.test([a.url,a.source_url,a.source_name].filter(Boolean).join(" ")))return;
      const id=String(a.id),previous=known.get(id),merged=previous?{...previous,...a}:a;
      if(!previous||JSON.stringify(previous.article_translations||[])!==JSON.stringify(merged.article_translations||[]))changed=true;
      known.set(id,merged);
    });
    if(changed)stories=[...known.values()].sort((a,b)=>new Date(b.published_at||b.created_at)-new Date(a.published_at||a.created_at));
    return changed;
  }
  async function loadAll(){
    if(loading)return;loading=true;
    feed.innerHTML='<div class="shorts-state"><strong>'+t("جارٍ تحميل الأخبار...","Loading latest stories...")+'</strong><span>'+t("نحمّل أحدث الأخبار أولاً لتبدأ القراءة بسرعة","Loading the latest stories first")+'</span></div>';
    try{await configure();const rows=await fetchPage(0,100);stories=[];mergeRows(rows);nextOffset=rows.length;hasMore=rows.length===100;render();await refreshLatest();}
    catch(error){console.error("WRLDLINE Shorts:",error);feed.innerHTML='<div class="shorts-state"><strong>'+t("تعذر تحميل الأخبار","Could not load stories")+'</strong><span>'+t("تحقق من اتصال الإنترنت ثم حاول مرة أخرى.","Check your connection and try again.")+'</span><button id="shortsRetry">'+t("إعادة المحاولة","Retry")+'</button></div>';document.getElementById("shortsRetry").onclick=loadAll;}
    finally{loading=false;}
  }
  function appendMoreButton(){
    feed.querySelector("#shortsLoadMore")?.remove();if(!hasMore)return;
    feed.insertAdjacentHTML("beforeend",'<div class="shorts-more-wrap"><button id="shortsLoadMore" type="button">'+t("تحميل المزيد من الأخبار","Load more stories")+'</button></div>');
    feed.querySelector("#shortsLoadMore").addEventListener("click",loadMore);
  }
  async function loadMore(){
    if(loadingMore||!hasMore)return;loadingMore=true;const button=feed.querySelector("#shortsLoadMore");if(button){button.disabled=true;button.textContent=t("جارٍ التحميل...","Loading...");}
    try{const rows=await fetchPage(nextOffset,100);nextOffset+=rows.length;hasMore=rows.length===100;const preserve=currentStoryId();mergeRows(rows);render(preserve);}
    catch(error){console.warn("WRLDLINE Shorts pagination:",error);if(button){button.disabled=false;button.textContent=t("تعذرت الإضافة — أعد المحاولة","Retry loading more");}}
    finally{loadingMore=false;}
  }
  async function refreshLatest(){
    if(!apiKey||document.hidden)return;
    try{const rows=await fetchPage(0,50);const preserve=currentStoryId();if(mergeRows(rows))render(preserve);}
    catch(error){console.warn("WRLDLINE Shorts refresh:",error);}
  }
  langButton.addEventListener("click",()=>{const preserve=currentStoryId();lang=lang==="ar"?"en":"ar";localStorage.setItem("wrldline:language",lang);setLanguage();render(preserve);});
  themeButton.addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;localStorage.setItem("wrldline:theme",next);themeButton.textContent=next==="dark"?"☀":"☾";});
  document.addEventListener("keydown",e=>{if(!["ArrowDown","ArrowUp"].includes(e.key))return;const slides=feed.querySelectorAll(".shorts-slide");if(!slides.length)return;e.preventDefault();const next=Math.max(0,Math.min(slides.length-1,active+(e.key==="ArrowDown"?1:-1)));slides[next]?.scrollIntoView({behavior:"smooth",block:"start"});});
  feed.addEventListener("scroll",()=>hint.classList.add("is-hidden"),{passive:true});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshLatest();});
  setLanguage();const theme=localStorage.getItem("wrldline:theme")||"light";document.documentElement.dataset.theme=theme;themeButton.textContent=theme==="dark"?"☀":"☾";setTimeout(()=>hint.classList.add("is-hidden"),5000);
  loadAll();setInterval(refreshLatest,60000);
})();