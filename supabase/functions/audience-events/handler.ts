import { InvalidPayload, readBody, validatePayload } from "./validation.ts";
export type Dependencies = {
  origins: Set<string>;
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  user: (token: string) => Promise<string | null>;
  now?: () => number;
};
export class BudgetExceeded extends Error {}
// An isolate-level first barrier; the database has durable atomic global/session caps too.
export function createHandler(deps: Dependencies) {
  let windowStart = 0, requests = 0;
  const sessions = new Map<string, { start: number; count: number }>();
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin") || "";
    const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin", "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" });
    const response = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
    if (!deps.origins.has(origin)) return response(403, { error: "Origin not allowed" });
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "content-type, apikey, authorization");
    headers.set("Access-Control-Max-Age", "600");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return response(405, { error: "POST required" });
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get("content-type") || "")) return response(415, { error: "JSON required" });
    const now = deps.now?.() ?? Date.now();
    if (now - windowStart >= 60000) { windowStart = now; requests = 0; sessions.clear(); }
    if (++requests > 600) return response(429, { error: "Rate limit" });
    try {
      const payload = validatePayload(await readBody(request), now);
      const ids = payload.operation === "events" ? [...new Set(payload.events.map(event => String(event.session_id)))] : [payload.session_id];
      if (ids.length !== 1) throw new InvalidPayload();
      const session = sessions.get(ids[0]) || { start: now, count: 0 };
      session.count += payload.operation === "events" ? payload.events.length : 1;
      if (session.count > 60 || (!sessions.has(ids[0]) && sessions.size >= 2000)) return response(429, { error: "Rate limit" });
      sessions.set(ids[0], session);
      if (payload.operation === "verify_plus") {
        const match = /^Bearer ([A-Za-z0-9._-]{32,4096})$/.exec(request.headers.get("authorization") || "");
        const userId = match ? await deps.user(match[1]) : null;
        if (!userId) return response(401, { error: "Authenticated session required" });
        const result = await deps.rpc("audience_verify_plus", { p_user_id: userId, p_event_id: payload.event_id, p_session_id: payload.session_id, p_browser_id: payload.browser_id || null });
        return response(200, result);
      }
      const result = await deps.rpc("audience_ingest_events", { p_events: payload.events });
      return response(200, result);
    } catch (error) {
      if (error instanceof InvalidPayload) return response(400, { error: "Invalid event payload" });
      if (error instanceof BudgetExceeded) return response(429, { error: "Rate limit" });
      // Do not log bodies, JWTs, referrers, IPs, or database exception details.
      return response(503, { error: "Collector temporarily unavailable" });
    }
  };
}
