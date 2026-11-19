import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { createECDH } from "node:crypto";
import { Buffer } from "node:buffer";
import { keyedHash, ready } from "./core.ts";
import { resolveSupabaseServiceKey, serviceClientOptions } from "../service-key.mjs";
// This repository has no generated Database types; match the documented live schema explicitly in projections.
// deno-lint-ignore no-explicit-any
export type DB = SupabaseClient<any>;
export type Env = Record<string, string>;
export function environment(): Env {
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SECRET_KEYS", "NOTIFICATIONS_ENABLED", "SITE_URL", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "RESEND_API_KEY", "NEWSLETTER_FROM", "NOTIFICATION_TOKEN_SECRET"];
  const env = Object.fromEntries(names.map(name => [name, Deno.env.get(name) || ""]));
  // Nonsecret production defaults for this existing site. Database channel flags
  // still start false; the explicit env value "false" remains the global kill switch.
  env.SITE_URL = env.SITE_URL || "https://al-ghaib.us.ci";
  try {
    const site = new URL(env.SITE_URL);
    env.SITE_URL = site.protocol === "https:" && site.pathname === "/" && !site.search && !site.hash && !site.username && !site.password ? site.origin : "";
  } catch { env.SITE_URL = ""; }
  env.NOTIFICATIONS_ENABLED = env.NOTIFICATIONS_ENABLED || "true";
  env.SUPABASE_SERVICE_ROLE_KEY = resolveSupabaseServiceKey(env) || "";
  return env;
}
export function database(env: Env): DB {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("service_unavailable");
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, serviceClientOptions(env.SUPABASE_SERVICE_ROLE_KEY));
}
export function headers(env: Env): Record<string, string> {
  return { "Access-Control-Allow-Origin": env.SITE_URL || "https://al-ghaib.us.ci", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Vary": "Origin", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
}
export function json(env: Env, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: headers(env) }); }
export async function rpc<T = unknown>(db: DB, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(name, args); if (error) throw new Error("database_unavailable"); return data as T;
}
export async function runtime(db: DB) {
  const { data, error } = await db.from("notification_runtime").select("push_enabled,email_enabled,enabled_at").eq("id", 1).single();
  if (error || !data) throw new Error("database_unavailable"); return data;
}
const vaultCache = new WeakMap<DB, { expires: number; value: Record<string, string> }>();
export async function resolveEnv(db: DB, env: Env): Promise<Env> {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT && env.NOTIFICATION_TOKEN_SECRET) return env;
  let cached = vaultCache.get(db);
  if (!cached || cached.expires < Date.now()) {
    const { data, error } = await db.rpc("notification_runtime_config");
    cached = { expires: Date.now() + 60000, value: !error && data && typeof data === "object" ? data : {} };
    vaultCache.set(db,cached);
  }
  return { ...env, VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY || cached.value.vapid_public_key || "", VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY || cached.value.vapid_private_key || "", VAPID_SUBJECT: env.VAPID_SUBJECT || cached.value.vapid_subject || "", NOTIFICATION_TOKEN_SECRET: env.NOTIFICATION_TOKEN_SECRET || cached.value.notification_token_secret || "" };
}
export async function health(db: DB, env: Env) {
  const effective = await resolveEnv(db,env), result = ready(effective,await runtime(db));
  if (result.push_ready) {
    try {
      const curve = createECDH("prime256v1");
      curve.setPrivateKey(Buffer.from(effective.VAPID_PRIVATE_KEY,"base64url"));
      if (!curve.getPublicKey().equals(Buffer.from(effective.VAPID_PUBLIC_KEY,"base64url"))) throw new Error("invalid_vapid_pair");
    } catch { result.push_ready=false;result.vapid_public_key=null; }
  }
  return result;
}
export async function limit(db: DB, scope: string, identity: string, maximum: number, seconds = 3600, env: Env = {}) {
  // Salt identities before persistence: no raw IPs, emails, or bearer tokens in the rate ledger.
  const secret = env.NOTIFICATION_TOKEN_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("service_unavailable");
  const key = await keyedHash(secret,identity);
  const allowed = await rpc<boolean>(db, "notification_rate_limit", { p_key: scope + ":" + key, p_max: maximum, p_seconds: seconds });
  if (!allowed) throw new Error("rate_limited");
}
export function ip(req: Request) {
  // Edge gateway overwrites this header. Do not trust arbitrary CF/client headers.
  return (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0,80);
}
export async function boundedText(req: Request, maximum: number): Promise<string> {
  if (Number(req.headers.get("content-length") || 0)>maximum) throw new Error("invalid_request");
  if (!req.body) return "";
  const reader=req.body.getReader(), decoder=new TextDecoder();let count=0,text="";
  try {
    while (true) {
      const {done,value}=await reader.read();if(done)break;
      count+=value.byteLength;if(count>maximum){await reader.cancel();throw new Error("invalid_request");}
      text+=decoder.decode(value,{stream:true});
    }
    return text+decoder.decode();
  } finally { reader.releaseLock(); }
}
export async function parseBody(req: Request): Promise<Record<string, unknown>> {
  const text = await boundedText(req,8192);
  try { const data = JSON.parse(text); if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(); return data; } catch { throw new Error("invalid_request"); }
}
