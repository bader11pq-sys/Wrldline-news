// Pure helpers: no environment reads, database writes, or network side effects.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PUSH_HOSTS = new Set([
  "fcm.googleapis.com", "updates.push.services.mozilla.com", "updates-autopush.stage.mozaws.net",
  "web.push.apple.com", "wns2-db5p.notify.windows.com",
]);
export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const u = new URL(value);
    // Exact hosts only; Apple uses subdomains under this exclusively push-owned suffix.
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && !u.username && !u.password && !u.hash &&
      (!u.port || u.port === "443") && u.pathname !== "/" &&
      (PUSH_HOSTS.has(host) || /^[a-z0-9-]+\.push\.apple\.com$/.test(host));
  } catch { return false; }
}
export function validSubscription(value: unknown): value is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!value || typeof value !== "object") return false;
  const s = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!validPushEndpoint(s.endpoint) || !s.keys) return false;
  return typeof s.keys.p256dh === "string" && /^[\w-]{87}=?$/.test(s.keys.p256dh) &&
    typeof s.keys.auth === "string" && /^[\w-]{22}={0,2}$/.test(s.keys.auth);
}
export function choices(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30 || value.some(v => typeof v !== "string" || !v.trim() || v.length > 80 || /[\r\n\x00-\x1f<>]/.test(v))) throw new Error("invalid_choices");
  return [...new Set(value.map(v => v.trim()))];
}
export interface Article {
  id: string; title: string; summary?: string; editorial_status?: string; published_at: string;
  category?: string; country?: string; event_country?: string; topics?: string[]; is_breaking?: boolean;
}
export interface Preferences { notify_breaking: boolean; notify_categories: string[]; notify_countries: string[]; browser_notifications: boolean }
export function matches(article: Article, topics: string[], countries: string[]): boolean {
  return (!topics.length || [article.category || "", ...(article.topics || [])].some(t => topics.includes(t))) &&
    (!countries.length || countries.includes(article.event_country || article.country || ""));
}
export function matchesPush(article: Article, p: Preferences): boolean {
  return p.browser_notifications && (article.is_breaking ? p.notify_breaking : !!(p.notify_categories.length || p.notify_countries.length)) && matches(article, p.notify_categories, p.notify_countries);
}
export function articlePath(id: string): string { if (!UUID.test(id)) throw new Error("invalid_article"); return "/news/" + id; }
export function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)); }
export function tokenValid(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value); }
export async function hash(value: string): Promise<string> {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), x => x.toString(16).padStart(2, "0")).join("");
}
export async function keyedHash(secret: string,value: string): Promise<string> {
  if (!secret) throw new Error("token_secret_missing");
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)));
  return Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
}
export async function tokenFor(secret: string, id: string, nonce: string, purpose: "confirm" | "unsubscribe"): Promise<string> {
  if (secret.length < 32) throw new Error("token_secret_missing");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${purpose}:${id}:${nonce}`)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function equalSecret(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  const aa = await hash(a), bb = await hash(b);
  let diff = 0; for (let i = 0; i < aa.length; i++) diff |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return diff === 0;
}
export function previousPeriod(cadence: "daily" | "weekly", now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (cadence === "weekly") end.setUTCDate(end.getUTCDate() - (end.getUTCDay() + 6) % 7);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - (cadence === "daily" ? 1 : 7));
  return { start: start.toISOString(), end: end.toISOString() };
}
export function retryDelay(attempts: number): number { return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1)); }
export function ready(env: Record<string, string>, runtime: { push_enabled?: boolean; email_enabled?: boolean } = {}) {
  const active = env.NOTIFICATIONS_ENABLED === "true";
  let site = false; try { const u = new URL(env.SITE_URL); site = u.protocol === "https:" && !u.username && !u.password && u.pathname === "/" && !u.search && !u.hash; } catch { /* fail closed */ }
  const push = active && runtime.push_enabled === true && site && /^[\w-]{87}=?$/.test(env.VAPID_PUBLIC_KEY || "") && /^[\w-]{43}=?$/.test(env.VAPID_PRIVATE_KEY || "") && /^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(env.VAPID_SUBJECT || "");
  const email = active && runtime.email_enabled === true && site && !!env.RESEND_API_KEY && !!env.NEWSLETTER_FROM && !/[\r\n]/.test(env.NEWSLETTER_FROM) && (env.NOTIFICATION_TOKEN_SECRET || "").length >= 32;
  return { push_ready: !!push, email_ready: !!email, vapid_public_key: push ? env.VAPID_PUBLIC_KEY : null };
}
