const CACHE_NAME = "wrldline-shell-v3";
const NEWS_CACHE = "wrldline-public-news-v1";
const APP_SHELL = ["/", "/index.html", "/account.html", "/style.css", "/script.js", "/manifest.json"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("wrldline-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Public headlines only: never intercept authentication, profiles, or billing traffic.
  if (url.hostname === "vmaxbnogmmfyrcucapnq.supabase.co" && url.pathname === "/rest/v1/articles") {
    event.respondWith((async () => {
      const cache = await caches.open(NEWS_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || new Response("[]", {headers: {"Content-Type":"application/json","X-WRLDLINE-Offline":"1"}});
      }
    })());
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) await (await caches.open(CACHE_NAME)).put(request, response.clone());
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match("/index.html"));
      }
    })());
    return;
  }
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        fetch(request).then(response => { if (response.ok) cache.put(request, response.clone()); }).catch(() => {});
        return cached;
      }
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
