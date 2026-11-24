const CACHE_NAME = "wrldline-shell-v94-editorial-priorities";
const NEWS_CACHE = "wrldline-public-news-v1";
const BRIEFING_CACHE = "wrldline-daily-briefing-v1";
const SHELL_URLS = ["/", "/index.html", "/wrld.css", "/site-enhancements.css", "/site-enhancements.js", "/intelligence.css", "/intelligence.js", "/coverage-gap.js", "/sources.html", "/intelligence-sources.js", "/manus-routes.json", "/history.css", "/newsroom.css", "/editorial-rank.js", "/script.js", "/taxonomy.js", "/home.js", "/site-shell.js", "/newsroom.js", "/newsroom-data.js", "/newsroom-data-extra.js", "/newsroom-data-impact.js", "/newsroom-page.js", "/history-app.js", "/history-data.js", "/history-entities-a.js", "/history-entities-b.js", "/history-entities-c.js", "/history-events.js", "/history-learning.js", "/history-portraits.js", "/language.js", "/share.js", "/manifest.json", "/favicon.svg", "/analytics-config.js", "/analytics.js", "/forms.js", "/policy.css", "/about.html", "/contact.html", "/privacy.html", "/terms.html", "/corrections.html", "/newsletter.html", "/history.html", "/history-explore.html", "/history-dossier.html", "/history-compare.html", "/history-library.html", "/context.html", "/balance.html", "/impact.html", "/promises.html", "/mirror.html", "/explainers.html", "/markets.html", "/markets.css", "/markets.js", "/map.html", "/map.js", "/shorts.html", "/shorts.css", "/shorts.js", "/assets/shorts-news-tension-theme.mp3", "/daily-briefing.html", "/daily-briefing.css", "/daily-briefing.js", "/dossier/", "/dossier.css", "/dossier.js", "/dossier/index.json", "/dossier/watchlist.html", "/dossier/claims.html", "/dossier/impact.html", "/dossier/digest.html", "/dossier/watchlist.json", "/dossier/watchlist.ics", "/watch-strip.js"];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const readerShell = ["language.js", "reader-discovery.js", "home.js", "wl-modern.js", "wl-modern.css", "homepage-interactions.js", "homepage-polish.css"].map(file => "/"+file+"?v=20261122-reader");
    const metadataShell = ["editorial-display.js","script.js","map.js"].map(file=>"/"+file+"?v=20261122-metadata");
    const editionShell = ["language.js","reader-discovery.js","editorial-display.js","map-model.js","script.js","home.js","newsroom-edition.js","newsroom-edition.css","map.js","map.css"].map(file=>"/"+file+"?v=20261122-edition");
    const monitorShell = ["/vendor/leaflet-1.9.4.js","/vendor/leaflet-1.9.4.css","/vendor/natural-earth-countries-110m-v5.1.2.geojson"];
    const readingShell = ["/reading.html", "/reading.css?v=20261122-paths", "/history-app.js?v=20261122-paths"];
    const articleShell = ["reader-prose.js", "homepage-polish.css"].map(file=>"/"+file+"?v=20261122-longread1");
    articleShell.push("/script.js?v=20261122-longread2", "/public-article-body.js?v=20261122-longread2");
    articleShell.push("/newsroom.css?v=20261122-reading2", "/public-news.css?v=20261115-1", "/public-news.js?v=20261115-1");
    articleShell.push(...["article-editions.js","script.js","language.js","homepage-polish.css"].map(file=>"/"+file+"?v=20261122-bilingual"));
    const coverageShell = ["/editorial-launch.css?v=20261122-coverage", "/language.js?v=20261122-coverage", "/dossier.css?v=20261122-coverage"];
    const shortsShell = ["/shorts.css", "/shorts.js", "/shorts-soundtrack.js"].map(file => file + "?v=20261122-soundtrack");
    // Music stays on demand rather than downloading with the site shell.
    const eventShell = ["language.js", "script.js", "event-desk.js", "front-page.css", "dossier.js"].map(file => "/" + file + "?v=20261122-event");
    const feedStatusShell = ["/reader-discovery.js?v=20261123-feed-sections", "/script.js?v=20261123-feed-sections"];
    const standardsShell = ["/about-en.html", "/corrections-en.html", "/policy.css?v=20261114-2",
      ...["editorial-policy.css", "script.js", "language.js", "forms.js"].map(file => "/" + file + "?v=20261123-standards")];
    const analysisShell = ["/analysis.html", "/editorial-desk.css?v=20261123", "/assets/editorial-desk.webp",
      ...["newsroom-page.js","context-research.js","briefing-model.js","daily-briefing.js","daily-briefing.css","market-model.js","markets.js","markets.css","map-model.js","map.js","map.css","site-shell.js"].map(file => "/" + file + "?v=20261123-edition-desk")];
    const rightsShell = ["/rights.html", "/rights-desk.css?v=human-news-1", "/rights-desk.js?v=20261123-1", "/home.js?v=20261123-rights", "/wl-modern.js?v=human-news-1", "/newsroom-edition.js?v=20261123-rights", "/assets/rights-file-small.webp", "/assets/rights-file.webp", "/sections.html", "/rights-cases/index.html",
      ...["rights-desk.css", "rights-front.css", "rights-front.js", "human-news.css", "rights-cases.js", "script.js"].map(file => "/" + file + "?v=premium-1")];
    const firstVisitShell = ["/assets/brand/wrldline-symbol-small.webp", "/source-directory.css?v=1",
      ...["home.bundle.css","script.js","home.js","newsroom-edition.js","event-desk.js","coverage-gap.js","analytics.js","intelligence-sources.js"].map(file => "/" + file + "?v=20261123-reader-start")];
    const prioritiesShell = [...["home.bundle.css","script.js","editorial-desk.css","language.js","wl-modern.js","site-shell.js"].map(file => "/" + file + "?v=20261123-editorial-priorities"),
      ...["reader-prose.js","article-editions.js","public-news.js","public-news.css"].map(file => "/" + file + "?v=20261123-reading-order")];
    const publicShell = [...SHELL_URLS.filter(url => url !== "/newsletter.html" && !url.endsWith(".mp3")), ...readerShell, ...metadataShell, ...editionShell, ...monitorShell, ...readingShell, ...articleShell, ...coverageShell, ...shortsShell, ...eventShell, ...feedStatusShell, ...standardsShell, ...analysisShell, ...rightsShell, ...firstVisitShell, ...prioritiesShell, "/notification-config.js", "/notification-client.js", "/site-editor.js?v=20261123-media-library-v3-editor-access", "/site-editor.css?v=20261123-media-library-v3-editor-access"];
    await Promise.allSettled(publicShell.map(async url => {
      try { const response = await fetch(new Request(url, { cache: "reload" })); if (response.ok) await cache.put(url, response); } catch {}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("wrldline-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
async function networkFirst(request, cacheName = CACHE_NAME) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(new Request(request, { cache: "no-store" }));
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname === "vmaxbnogmmfyrcucapnq.supabase.co" && (url.pathname === "/rest/v1/articles" || url.pathname === "/rest/v1/daily_news_briefings")) {
    // These responses are user-scoped. Never put them in a shared cache that could
    // survive logout or be replayed to another session.
    event.respondWith(fetch(request).catch(() =>
      new Response(JSON.stringify({error:"offline",message:"WRLDLINE network unavailable"}), { status: 503, headers: { "Content-Type": "application/json", "X-WRLDLINE-Offline": "1" } })
    ));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Leave byte-range media requests to the browser's network stack.
  if (request.headers.has("Range") || (url.pathname.startsWith("/assets/shorts-news-") && url.pathname.endsWith(".mp3"))) return;
  // Do not persist account, email-management, or contact intent query strings in shared caches.
  if (url.pathname === "/account.html" || url.pathname === "/admin.html" || url.pathname === "/audience.html" || url.pathname === "/newsletter.html" || url.searchParams.has("token") ||
      (url.pathname === "/contact.html" && url.search)) return;
  const isPage = request.mode === "navigate";
  const isAppAsset = ["script", "style", "document", "manifest", "font", "image"].includes(request.destination);
  if (isPage || isAppAsset || url.pathname === "/vendor/natural-earth-countries-110m-v5.1.2.geojson") {
    event.respondWith(networkFirst(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const shell = url.pathname === "/map.html" ? "/map.html" : "/index.html";
      return (await cache.match(request)) || (isPage ? (await cache.match(shell)) || Response.error() : Response.error());
    }));
  }
});

// Push owner gate is persisted separately from shared shell caches and starts disabled.
const PUSH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function pushState(value) {
  return new Promise((resolve,reject) => {
    const open = indexedDB.open("wrldline-notifications",1);
    open.onupgradeneeded = () => open.result.createObjectStore("state");
    open.onerror = () => reject(new Error("push_state_unavailable"));
    open.onsuccess = () => {
      const db = open.result, transaction = db.transaction("state",value === undefined ? "readonly" : "readwrite");
      const store = transaction.objectStore("state"), request = value === undefined ? store.get("gate") : store.put(value,"gate");
      transaction.oncomplete = () => { const result = request.result; db.close(); resolve(value === undefined ? result : value); };
      transaction.onerror = () => { db.close(); reject(new Error("push_state_unavailable")); };
      transaction.onabort = () => { db.close(); reject(new Error("push_state_unavailable")); };
    };
  });
}
self.addEventListener("message",event => {
  if(event.data?.type !== "wrldline:push-gate")return;
  if(!event.source?.url || new URL(event.source.url).origin !== self.location.origin)return;
  event.waitUntil((async()=>{
    try {
      const enabled = event.data.enabled === true && PUSH_UUID.test(event.data.user_id || "");
      await pushState({enabled,user_id:enabled ? event.data.user_id : null});
      if(!enabled) { const visible=await self.registration.getNotifications();visible.forEach(n=>n.close()); }
      event.ports?.[0]?.postMessage({ok:true});
    } catch { event.ports?.[0]?.postMessage({ok:false}); }
  })());
});
self.addEventListener("push",event => {
  event.waitUntil((async()=>{
    try {
      const data=event.data?.json(), gate=await pushState();
      if(!gate?.enabled || data?.user_id !== gate.user_id || !PUSH_UUID.test(data?.article_id || ""))return;
      // The only destination is a canonical local UUID article. Payload URL/image/action fields are ignored.
      const path="/news/"+data.article_id;
      await self.registration.showNotification((data.is_breaking?"WRLDLINE · عاجل: ":"WRLDLINE · ")+String(data.title || "خبر جديد").slice(0,160),{
        body:String(data.body || "").slice(0,180),icon:"/favicon.svg",badge:"/favicon.svg",
        tag:"wrldline-article:"+data.article_id,renotify:false,
        data:{url:path,user_id:gate.user_id},
      });
    } catch { /* Invalid payload/storage state is fail-closed; no credentials or payloads are logged. */ }
  })());
});
self.addEventListener("notificationclick",event => {
  event.notification.close();
  event.waitUntil((async()=>{
    try {
      const gate=await pushState(), data=event.notification.data;
      if(!gate?.enabled || data?.user_id !== gate.user_id)return;
      const raw=data?.url;
      if(typeof raw!=="string" || !/^\/news\/[0-9a-f-]{36}$/i.test(raw) || !PUSH_UUID.test(raw.slice(6)))return;
      const target=new URL(raw,self.location.origin);
      if(target.origin!==self.location.origin || target.search || target.hash)return;
      const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
      const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
      if(existing) { await existing.navigate(target.href);await existing.focus(); }
      else await self.clients.openWindow(target.href);
    } catch {}
  })());
});
self.addEventListener("pushsubscriptionchange",event => {
  // A rotated browser endpoint cannot be re-bound without a verified session and renewed explicit action.
  event.waitUntil(pushState({enabled:false,user_id:null}).catch(()=>{}));
});
