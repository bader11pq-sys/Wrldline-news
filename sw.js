const CACHE_NAME = "wrldline-shell-v53";
const NEWS_CACHE = "wrldline-public-news-v1";
const BRIEFING_CACHE = "wrldline-daily-briefing-v1";
const SHELL_URLS = ["/", "/index.html", "/wrld.css", "/history.css", "/newsroom.css", "/script.js", "/home.js", "/site-shell.js", "/newsroom.js", "/newsroom-data.js", "/newsroom-data-extra.js", "/newsroom-data-impact.js", "/newsroom-page.js", "/history-app.js", "/history-data.js", "/history-entities-a.js", "/history-entities-b.js", "/history-entities-c.js", "/history-events.js", "/history-learning.js", "/language.js", "/share.js", "/manifest.json", "/favicon.svg", "/analytics-config.js", "/analytics.js", "/forms.js", "/policy.css", "/about.html", "/contact.html", "/privacy.html", "/terms.html", "/corrections.html", "/newsletter.html", "/history.html", "/history-explore.html", "/history-dossier.html", "/history-compare.html", "/history-library.html", "/context.html", "/balance.html", "/impact.html", "/promises.html", "/mirror.html", "/explainers.html", "/markets.html", "/markets.css", "/markets.js", "/map.html", "/map.js", "/shorts.html", "/shorts.css", "/shorts.js", "/daily-briefing.html", "/daily-briefing.css", "/daily-briefing.js"];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(SHELL_URLS.map(async url => {
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
  if (url.hostname === "vmaxbnogmmfyrcucapnq.supabase.co" && url.pathname === "/rest/v1/articles") {
    event.respondWith(networkFirst(request, NEWS_CACHE).catch(() =>
      new Response(JSON.stringify({error:"offline",message:"WRLDLINE network unavailable"}), { status: 503, headers: { "Content-Type": "application/json", "X-WRLDLINE-Offline": "1" } })
    ));
    return;
  }
  if (url.hostname === "vmaxbnogmmfyrcucapnq.supabase.co" && url.pathname === "/rest/v1/daily_news_briefings") {
    event.respondWith(networkFirst(request, BRIEFING_CACHE).catch(() =>
      new Response(JSON.stringify({error:"offline",message:"WRLDLINE network unavailable"}), { status: 503, headers: { "Content-Type": "application/json", "X-WRLDLINE-Offline": "1" } })
    ));
    return;
  }
  if (url.origin !== self.location.origin) return;
  const isPage = request.mode === "navigate";
  const isAppAsset = ["script", "style", "document", "manifest", "font", "image"].includes(request.destination);
  if (isPage || isAppAsset) {
    event.respondWith(networkFirst(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request)) || (isPage ? await cache.match("/index.html") : Response.error());
    }));
  }
});
