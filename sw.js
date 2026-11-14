const CACHE_NAME = "wrldline-shell-v50";
const NEWS_CACHE = "wrldline-public-news-v1";
const BRIEFING_CACHE = "wrldline-daily-briefing-v1";
const SHELL_URLS = ["/", "/index.html", "/style.css", "/script.js", "/language.js", "/share.js", "/manifest.json", "/history.html", "/history-world-expansion.js", "/history-executive.js", "/history-research.js", "/history-expansion.js", "/history-lab.js", "/markets.html", "/markets.css", "/markets.js", "/map.html", "/map.js", "/shorts.html", "/shorts.css", "/shorts.js", "/daily-briefing.html", "/daily-briefing.css", "/daily-briefing.js"];
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
      new Response("[]", { headers: { "Content-Type": "application/json", "X-WRLDLINE-Offline": "1" } })
    ));
    return;
  }
  if (url.hostname === "vmaxbnogmmfyrcucapnq.supabase.co" && url.pathname === "/rest/v1/daily_news_briefings") {
    event.respondWith(networkFirst(request, BRIEFING_CACHE).catch(() =>
      new Response("[]", { headers: { "Content-Type": "application/json", "X-WRLDLINE-Offline": "1" } })
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
