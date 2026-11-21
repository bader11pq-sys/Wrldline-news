const CACHE_NAME = "wrldline-shell-v69-shorts-music";
const NEWS_CACHE = "wrldline-public-news-v1";
const BRIEFING_CACHE = "wrldline-daily-briefing-v1";
const SHELL_URLS = ["/", "/index.html", "/wrld.css", "/site-enhancements.css", "/site-enhancements.js", "/intelligence.css", "/intelligence.js", "/coverage-gap.js", "/sources.html", "/intelligence-sources.js", "/manus-routes.json", "/history.css", "/newsroom.css", "/editorial-rank.js", "/script.js", "/taxonomy.js", "/home.js", "/site-shell.js", "/newsroom.js", "/newsroom-data.js", "/newsroom-data-extra.js", "/newsroom-data-impact.js", "/newsroom-page.js", "/history-app.js", "/history-data.js", "/history-entities-a.js", "/history-entities-b.js", "/history-entities-c.js", "/history-events.js", "/history-learning.js", "/history-portraits.js", "/language.js", "/share.js", "/manifest.json", "/favicon.svg", "/analytics-config.js", "/analytics.js", "/forms.js", "/policy.css", "/about.html", "/contact.html", "/privacy.html", "/terms.html", "/corrections.html", "/newsletter.html", "/history.html", "/history-explore.html", "/history-dossier.html", "/history-compare.html", "/history-library.html", "/context.html", "/balance.html", "/impact.html", "/promises.html", "/mirror.html", "/explainers.html", "/markets.html", "/markets.css", "/markets.js", "/map.html", "/map.js", "/shorts.html", "/shorts.css", "/shorts.js", "/assets/shorts-news-tension-theme.mp3", "/daily-briefing.html", "/daily-briefing.css", "/daily-briefing.js", "/dossier/", "/dossier.css", "/dossier.js", "/dossier/index.json", "/dossier/watchlist.html", "/dossier/claims.html", "/dossier/impact.html", "/dossier/digest.html", "/dossier/watchlist.json", "/dossier/watchlist.ics", "/watch-strip.js"];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const publicShell = [...SHELL_URLS.filter(url => url !== "/newsletter.html"), "/notification-config.js", "/notification-client.js"];
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
  // Account shell and email-management pages are network-only; never replay account state or token intents.
  if (url.pathname === "/account.html" || url.pathname === "/newsletter.html" || url.searchParams.has("token")) return;
  const isPage = request.mode === "navigate";
  const isAppAsset = ["script", "style", "document", "manifest", "font", "image"].includes(request.destination);
  if (isPage || isAppAsset) {
    event.respondWith(networkFirst(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request)) || (isPage ? await cache.match("/index.html") : Response.error());
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
