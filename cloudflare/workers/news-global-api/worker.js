// RETIRED 2026-11-24. The legacy raw-table articles API cannot work after anon table privileges were
// (correctly) removed, and must not be reopened. Public newsroom reads use the bounded public_* RPCs
// served by the wrldline-public Worker. This stub keeps a clear signal for any external client.
const ALLOWED_ORIGIN = "https://al-ghaib.us.ci";
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "apikey, authorization, accept",
      "Vary": "Origin",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { ...headers, Allow: "GET, OPTIONS" }
      });
    }
    const status = url.pathname === "/rest/v1/articles" ? 410 : 404;
    return new Response(JSON.stringify({
      error: status === 410 ? "Legacy article API retired" : "Not found",
      ...(status === 410 ? { newsroom: "https://al-ghaib.us.ci/news/" } : {})
    }), { status, headers });
  }
};
