/**
 * WRLDLINE public-news edge gateway.
 * Only published public article reads are proxied; writes and other tables are not exposed.
 */
const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
const ALLOWED_ORIGIN = "https://al-ghaib.us.ci";
const ARTICLE_PATH = "/rest/v1/articles";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, accept, accept-profile, range",
    "Access-Control-Expose-Headers": "Content-Range, ETag, X-WRLDLINE-Cache",
    "Vary": "Origin",
  };
}

function jsonError(message, status, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const startedAt = Date.now();
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "GET") return jsonError("Method not allowed", 405, origin);
    if (url.pathname !== ARTICLE_PATH) return jsonError("Not found", 404, origin);

    // The gateway intentionally exposes only published article reads.
    if (url.searchParams.get("editorial_status") !== "eq.published") {
      return jsonError("Only published articles are available through this endpoint", 403, origin);
    }
    if (!env.SUPABASE_ANON_KEY) {
      console.error(JSON.stringify({ event: "missing_supabase_key" }));
      return jsonError("News service is not configured", 503, origin);
    }

    const hasUserToken = Boolean(request.headers.get("Authorization"));
    const cacheable = !hasUserToken;
    const cache = caches.default;
    const cacheUrl = new URL(url.pathname + url.search, "https://wrldline-public-cache.internal");
    const cacheKey = new Request(cacheUrl.toString(), {
      method: "GET",
      headers: { Accept: request.headers.get("Accept") || "application/json" },
    });

    if (cacheable) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const headers = new Headers(hit.headers);
        headers.set("X-WRLDLINE-Cache", "HIT");
        headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
        headers.set("Access-Control-Expose-Headers", "Content-Range, ETag, X-WRLDLINE-Cache");
        headers.set("Vary", "Origin");
        console.log(JSON.stringify({ event: "news_cache", result: "hit", duration_ms: Date.now() - startedAt }));
        return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
      }
    }

    const upstreamHeaders = new Headers({
      apikey: env.SUPABASE_ANON_KEY,
      Accept: request.headers.get("Accept") || "application/json",
    });
    const authorization = request.headers.get("Authorization");
    if (authorization) upstreamHeaders.set("Authorization", authorization);
    for (const name of ["accept-profile", "range"]) {
      const value = request.headers.get(name);
      if (value) upstreamHeaders.set(name, value);
    }

    try {
      const upstreamUrl = SUPABASE_URL + ARTICLE_PATH + url.search;
      const upstream = await fetch(upstreamUrl, {
        method: "GET",
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(12000),
      });
      const headers = new Headers(upstream.headers);
      for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
      headers.set("X-WRLDLINE-Cache", cacheable ? "MISS" : "BYPASS");

      if (cacheable && upstream.status === 200 && !headers.has("Set-Cookie")) {
        const isBreaking = url.searchParams.get("is_breaking") === "eq.true";
        const ttl = isBreaking ? 5 : 20;
        headers.set("Cache-Control", "public, max-age=" + ttl);
        const responseToCache = new Response(upstream.clone().body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers,
        });
        await cache.put(cacheKey, responseToCache);
      } else if (!cacheable) {
        headers.set("Cache-Control", "private, no-store");
      }

      console.log(JSON.stringify({
        event: "news_upstream",
        status: upstream.status,
        cache: cacheable ? "miss" : "bypass",
        duration_ms: Date.now() - startedAt,
      }));
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
    } catch (error) {
      console.error(JSON.stringify({
        event: "news_upstream_error",
        message: String(error?.message || error).slice(0, 180),
        duration_ms: Date.now() - startedAt,
      }));
      return jsonError("News data provider is temporarily unavailable", 502, origin);
    }
  },
};
