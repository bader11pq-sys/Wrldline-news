(() => {
  const feed=document.getElementById("shortsFeed"),counter=document.getElementById("shortsCounter");
  const langButton=document.getElementById("shortsLanguage"),themeButton=document.getElementById("shortsTheme"),musicButton=document.getElementById("shortsMusic"),hint=document.getElementById("shortsHint");
  let lang=localStorage.getItem("wrldline:language")==="en"?"en":"ar",stories=[],active=0,apiUrl="https://vmaxbnogmmfyrcucapnq.supabase.co",apiKey="sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx",loading=false,nextOffset=0,hasMore=false,loadingMore=false;
  const labels={ar:{politics:"سياسة",economy:"اقتصاد",security:"أمن ودفاع",tech:"تكنولوجيا",sports:"رياضة",culture:"ثقافة",health:"صحة",world:"حول العالم"},en:{politics:"Politics",economy:"Economy",security:"Security & Defence",tech:"Technology",sports:"Sports",culture:"Culture",health:"Health",world:"Around the world"}};
  const t=(ar,en)=>lang==="ar"?ar:en;
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safe=v=>{try{const u=new URL(v);return ["https:","http:"].includes(u.protocol)?u.href:"";}catch{return "";}};
  const date=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?"":new Intl.DateTimeFormat(lang==="ar"?"ar-SA":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(d);};
  function setLanguage(){document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";langButton.textContent=lang==="ar"?"English":"العربية";}
  let audioContext=null,musicGain=null,musicTimer=null,musicOn=false;
  function updateMusicButton(){if(!musicButton)return;musicButton.textContent=musicOn?t("♫ الموسيقى مفعلة","♫ Music on"):t("♫ موسيقى","♫ Music");musicButton.setAttribute("aria-pressed",String(musicOn));musicButton.setAttribute("aria-label",musicOn?t("إيقاف موسيقى التوتر","Turn off tension music"):t("تشغيل موسيقى التوتر","Turn on tension music"));musicButton.classList.toggle("is-on",musicOn);}
  function tensionPulse(){if(!audioContext||!musicGain||!musicOn)return;const now=audioContext.currentTime;const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type="sine";osc.frequency.setValueAtTime(92,now);osc.frequency.exponentialRampToValueAtTime(66,now+.8);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.045,now+.08);gain.gain.exponentialRampToValueAtTime(.0001,now+1.8);osc.connect(gain).connect(musicGain);osc.start(now);osc.stop(now+1.85);}
  async function toggleMusic(){
    if(musicOn){musicOn=false;clearInterval(musicTimer);musicTimer=null;if(musicGain){musicGain.gain.setTargetAtTime(.0001,audioContext.currentTime,.12);}updateMusicButton();localStorage.setItem("wrldline:shorts:music","off");return;}
    try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();musicGain=musicGain||audioContext.createGain();musicGain.gain.value=.0001;musicGain.connect(audioContext.destination);musicOn=true;musicGain.gain.setTargetAtTime(.18,audioContext.currentTime,.35);tensionPulse();musicTimer=setInterval(tensionPulse,2600);localStorage.setItem("wrldline:shorts:music","on");updateMusicButton();}
    catch(error){console.warn("WRLDLINE Shorts music:",error);musicOn=false;updateMusicButton();}
  }
  function currentStoryId(){return feed.querySelector(".shorts-slide[data-index='"+active+"']")?.dataset.id||"";}
  const savedKey="wrldline:shorts:saved";
  function savedSet(){try{return new Set(JSON.parse(localStorage.getItem(savedKey)||"[]"));}catch{return new Set();}}
  function saveStory(id){const set=savedSet();set.has(id)?set.delete(id):set.add(id);try{localStorage.setItem(savedKey,JSON.stringify([...set]));}catch{}return set.has(id);}
  function updateCounter(){const slides=[...feed.querySelectorAll(".shorts-slide")];if(!slides.length){counter.textContent="— / —";return;}const top=feed.getBoundingClientRect().top;let best=0,dist=Infinity;slides.forEach((s,i)=>{const d=Math.abs(s.getBoundingClientRect().top-top);if(d<dist){dist=d;best=i;}});active=best;counter.textContent=(best+1)+" / "+slides.length;}
  function render(preserveId=""){
    if(!stories.length){feed.innerHTML='<div class="shorts-state"><strong>'+t("لا توجد أخبار منشورة حاليًا","No published stories right now")+'</strong><span>'+t("سيظهر هنا كل خبر منشور في أقسام الموقع.","Every published story from every site section will appear here.")+'</span><button id="shortsRetry">'+t("إعادة المحاولة","Retry")+'</button></div>';document.getElementById("shortsRetry").onclick=loadAll;updateCounter();return;}
    feed.innerHTML=stories.map((a,i)=>{const declaredLang=String(a.lang||"").toLowerCase(),sourceLang=declaredLang.startsWith("ar")?"ar":(declaredLang.startsWith("en")?"en":(/[\u0600-\u06FF]/.test(a.title||"")?"ar":"en")),tr=(a.article_translations||[]).find(x=>x.lang===lang&&x.title&&x.summary),sameLanguage=sourceLang===lang,title=tr?.title||(a.title||""),summary=tr?.summary||(a.summary||t("لا يتوفر ملخص من المصدر.","No source summary is available.")),img=safe(a.image_url),isVideo=a.media_type==="video",src=safe(String(a.source_name||"").toUpperCase().includes("WRLDLINE")?(a.source_url||a.url):(a.url||a.source_url)),category=labels[lang][a.category]||t("غير مصنف","Uncategorized"),vcount=Number(a.verification_independent_count)||Number(a.verification_source_count)||0,vstatus=a.trust_needs_review===true?(a.editorial_trust_status==="disputed"?"disputed":(a.verification==="multi"?"multi":"unconfirmed")):(a.editorial_trust_status||a.verification||"unconfirmed"),vlabels={confirmed:t("مؤكد بمصادر متعددة","Confirmed by multiple sources"),multi:t("متعدد المصادر — غير مؤكد · "+vcount,"Multiple sources — unconfirmed · "+vcount),preliminary:t("أولي","Preliminary"),unconfirmed:t("غير مؤكد","Unconfirmed"),disputed:t("متنازع عليه","Disputed")},vbadge=String(a.source_name||"").toUpperCase().includes("WRLDLINE")?'<span class="shorts-category">'+esc(vlabels[vstatus]||vlabels.unconfirmed)+'</span>':"";return '<article class="shorts-slide" data-index="'+i+'" data-id="'+esc(a.id)+'">'+(img?(isVideo?'<video class="shorts-photo shorts-video" src="'+esc(img)+'" playsinline controls preload="'+(i<2?"metadata":"none")+'"></video><button class="shorts-video-play" type="button" aria-label="'+t("تشغيل الفيديو","Play video")+'">▶</button>':'<img class="shorts-photo" src="'+esc(img)+'" alt="" loading="'+(i<2?"eager":"lazy")+'">'):'<div class="shorts-no-photo"></div>')+'<div class="shorts-copy"><div class="shorts-meta"><span class="shorts-category">'+esc(category)+'</span>'+vbadge+(a.is_breaking?'<span class="shorts-category shorts-breaking">'+t("عاجل","BREAKING")+'</span>':"")+'<time>'+esc(date(a.published_at||a.received_at))+'</time></div><h1 dir="auto">'+esc(title)+'</h1><p class="shorts-summary" dir="auto">'+esc(summary||t("لا يتوفر ملخص لهذا الخبر.","No summary is available."))+'</p><div class="shorts-footer"><span>'+esc(a.source_name||t("مصدر إخباري","News source"))+'</span>'+(src?'<a class="shorts-source" href="'+esc(src)+'" target="_blank" rel="noopener noreferrer">'+t("قراءة المصدر الأصلي ↗","Read original source ↗")+'</a>':"")+'</div></div></article>';}).join("");
    feed.querySelectorAll(".shorts-slide").forEach((slide,index)=>{
      const story=stories[index],footer=slide.querySelector(".shorts-footer");if(!story||!footer)return;
      const share=document.createElement("button");share.type="button";share.className="shorts-share";share.textContent=t("مشاركة الخبر","Share story");
      share.addEventListener("click",async()=>{
        if(window.WRLDLINE_SHARE){await window.WRLDLINE_SHARE.share({title:story.title,description:story.summary||"",category:story.category||"uncategorized",source:story.source_name||"WRLDLINE NEWS",image:story.image_url||"",button:share});return;}
        share.textContent=t("جارٍ تجهيز الصورة…","Preparing image…");
      });
      const save=document.createElement("button");save.type="button";save.className="shorts-save";const already=savedSet().has(String(story.id));save.textContent=already?t("محفوظ ✓","Saved ✓"):t("حفظ","Save");save.setAttribute("aria-pressed",String(already));
      save.addEventListener("click",()=>{const on=saveStory(String(story.id));save.textContent=on?t("محفوظ ✓","Saved ✓"):t("حفظ","Save");save.setAttribute("aria-pressed",String(on));});
      footer.append(save,share);
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
    if("IntersectionObserver" in window){const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting&&e.intersectionRatio>=.6){active=Number(e.target.dataset.index||0);feed.querySelectorAll(".shorts-slide").forEach(x=>x.classList.remove("is-active"));e.target.classList.add("is-active");counter.textContent=(active+1)+" / "+stories.length;}}),{root:feed,threshold:[.6]});feed.querySelectorAll(".shorts-slide").forEach(s=>observer.observe(s));}
  }
  async function configure(){if(!apiUrl||!apiKey)throw new Error("Public API configuration not found");}
  async function fetchPage(offset,limit){
    // Public readers must use the same allowlisted RPC as the homepage.
    // Direct SELECT on public.articles is intentionally not granted to anon.
    const response=await fetch(apiUrl+"/rest/v1/rpc/public_home_news_recent_v3",{
      method:"POST",
      headers:{apikey:apiKey,"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({
        p_limit:limit,
        p_before:new Date().toISOString(),
        p_since:null,
        p_offset:offset,
        p_newsdata_only:null,
        p_is_breaking:null,
        p_is_exclusive:null
      }),
      signal:AbortSignal.timeout(20000)
    });
    if(!response.ok){
      let detail="";
      try{const payload=await response.json();detail=payload?.message||payload?.hint||payload?.details||"";}catch{}
      throw new Error("News API HTTP "+response.status+(detail?": "+detail:""));
    }
    const rows=await response.json();
    if(!Array.isArray(rows))throw new Error("Invalid public news response");
    return rows;
  }
  function mergeRows(rows){
    const known=new Map(stories.map(a=>[String(a.id),a]));let changed=false;
    rows.forEach(a=>{
      if(!a?.id||!a.title||/t\\.me|telegram\\.me|telegram/i.test([a.url,a.source_url,a.source_name].filter(Boolean).join(" ")))return;
      const id=String(a.id),previous=known.get(id),merged=previous?{...previous,...a}:a;
      if(!previous||JSON.stringify(previous)!==JSON.stringify(merged))changed=true;
      known.set(id,merged);
    });
    if(changed)stories=[...known.values()].sort((a,b)=>new Date(b.published_at||b.received_at)-new Date(a.published_at||a.received_at));
    return changed;
  }
  async function loadAll(){
    if(loading)return;loading=true;
    feed.innerHTML='<div class="shorts-state"><strong>'+t("جارٍ تحميل الأخبار...","Loading latest stories...")+'</strong><span>'+t("نحمّل أحدث الأخبار أولاً لتبدأ القراءة بسرعة","Loading the latest stories first")+'</span></div>';
    try{await configure();const rows=await fetchPage(0,100);stories=[];mergeRows(rows);nextOffset=rows.length;hasMore=rows.length===100;render();await refreshLatest();}
    catch(error){
      console.error("WRLDLINE Shorts:",error);
      const reason=String(error?.message||"");
      const httpMarker=reason.indexOf("HTTP ");
      const status=httpMarker>=0?Number(reason.slice(httpMarker+5,httpMarker+8))||0:0;
      const explanation=status===401||status===403
        ?t("خدمة الأخبار رفضت الطلب بسبب صلاحيات الوصول. أعد المحاولة لاحقاً.","The news service denied access. Please retry later.")
        :status===404
          ?t("واجهة موجز الأخبار غير متاحة حالياً.","The news feed endpoint is currently unavailable.")
          :status
            ?t("خدمة الأخبار غير متاحة حالياً (رمز "+status+").","The news service is unavailable (code "+status+").")
            :t("تعذر الوصول إلى خدمة الأخبار. تحقق من اتصالك ثم أعد المحاولة.","Could not reach the news service. Check your connection and retry.");
      feed.innerHTML='<div class="shorts-state"><strong>'+t("تعذر تحميل الأخبار","Could not load stories")+'</strong><span>'+explanation+'</span><button id="shortsRetry">'+t("إعادة المحاولة","Retry")+'</button></div>';
      document.getElementById("shortsRetry").onclick=loadAll;
    }
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
  let lastTap=0;
  feed.addEventListener("pointerup",e=>{const slide=e.target.closest(".shorts-slide");if(!slide)return;const now=Date.now();if(now-lastTap<320){const btn=slide.querySelector(".shorts-save");if(btn)btn.click();}lastTap=now;},{passive:true});
  function jumpToHash(){const id=decodeURIComponent(location.hash.slice(1));if(!id)return;const slide=[...feed.querySelectorAll(".shorts-slide")].find(x=>x.dataset.id===id);slide?.scrollIntoView({behavior:"smooth",block:"start"});}
  langButton.addEventListener("click",()=>{const preserve=currentStoryId();lang=lang==="ar"?"en":"ar";localStorage.setItem("wrldline:language",lang);setLanguage();render(preserve);});
  musicButton?.addEventListener("click",toggleMusic);
  themeButton.addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;localStorage.setItem("wrldline:theme",next);themeButton.textContent=next==="dark"?"☀":"☾";});
  document.addEventListener("keydown",e=>{if(!["ArrowDown","ArrowUp"].includes(e.key))return;const slides=feed.querySelectorAll(".shorts-slide");if(!slides.length)return;e.preventDefault();const next=Math.max(0,Math.min(slides.length-1,active+(e.key==="ArrowDown"?1:-1)));slides[next]?.scrollIntoView({behavior:"smooth",block:"start"});});
  feed.addEventListener("scroll",()=>hint.classList.add("is-hidden"),{passive:true});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshLatest();});
  setLanguage();updateMusicButton();const theme=localStorage.getItem("wrldline:theme")||"light";document.documentElement.dataset.theme=theme;themeButton.textContent=theme==="dark"?"☀":"☾";setTimeout(()=>hint.classList.add("is-hidden"),5000);
  loadAll().then(()=>setTimeout(jumpToHash,250));window.addEventListener("hashchange",jumpToHash);setInterval(refreshLatest,60000);
})();
