// Authorization for the AI provider health check. Three independent ways in, none weaker than before:
//   1. the exact server-side service key (constant-time compare),
//   2. a cron secret verified by the database (Vault) through verify_wrldline_cron_secret,
//   3. a real user session whose trusted app_metadata.role is admin/editor (verified by Supabase Auth).
// Root cause of the cron 401: the RPC was called with `Authorization: Bearer <key>`, which Supabase rejects for
// opaque sb_secret_ keys (they must be sent in `apikey` only) and the key was not resolved by resolveSupabaseServiceKey.
import { resolveSupabaseServiceKey, serviceApiHeaders } from "../_shared/service-key.mjs";

export function timingSafeEqual(a, b) {
  const x = String(a ?? ""), y = String(b ?? "");
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

/** @param {{headers: Headers, env: Record<string,string|undefined>, fetch?: typeof fetch}} ctx */
export async function authorizeHealthcheck({ headers, env, fetch: fetcher = fetch }) {
  const serviceKey = resolveSupabaseServiceKey({
    SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY || "",
    SUPABASE_SECRET_KEYS: env.SUPABASE_SECRET_KEYS || "",
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY || "",
  });
  const base = env.SUPABASE_URL;
  const auth = headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();

  if (serviceKey && token && timingSafeEqual(token, serviceKey)) return { authorized: true, via: "service_key" };
  if (serviceKey && timingSafeEqual(headers.get("apikey") || "", serviceKey) && token === "") return { authorized: true, via: "service_key" };

  const cronSecret = headers.get("x-wrldline-cron-secret") || "";
  if (serviceKey && base && cronSecret.length >= 32) {
    try {
      const res = await fetcher(base + "/rest/v1/rpc/verify_wrldline_cron_secret", {
        method: "POST", headers: serviceApiHeaders(serviceKey), body: JSON.stringify({ p_secret: cronSecret }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok && (await res.json()) === true) return { authorized: true, via: "cron_secret" };
      return { authorized: false, via: null, reason: res.ok ? "cron_secret_rejected" : "cron_verifier_http_" + res.status };
    } catch { return { authorized: false, via: null, reason: "cron_verifier_unreachable" }; }
  }

  const anon = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || "";
  if (token && base && anon && !/^sb_publishable_|^sb_secret_/.test(token)) {
    try {
      const res = await fetcher(base + "/auth/v1/user", { headers: { apikey: anon, Authorization: "Bearer " + token }, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const user = await res.json();
        if (["admin", "editor"].includes(user?.app_metadata?.role)) return { authorized: true, via: "editor_session" };
      }
    } catch { /* fall through */ }
  }
  return { authorized: false, via: null, reason: "unauthorized" };
}
