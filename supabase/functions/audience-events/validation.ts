export const MAX_BYTES = 16384;
export const MAX_EVENTS = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RANDOM_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAMES = new Set(["page_view", "view_article", "article_read", "engagement", "signup", "outbound_source_click", "search", "market_view", "newsletter_signup", "sponsor_contact", "plus_interest"]);
const CATEGORIES = new Set(["politics", "economy", "security", "tech", "sports", "culture", "health", "science", "environment", "society", "world", "uncategorized"]);
const FIELDS = new Set(["event_id", "name", "occurred_at", "session_id", "browser_id", "page", "device_type", "locale", "referrer_category", "article_id", "category", "content_type", "has_source_link", "has_query", "results_count", "plan", "active_ms", "engagement_type", "signup_type"]);
export type Event = Record<string, string | number | boolean>;
export type Payload = { version: 1; consent: true; operation: "events"; events: Event[] } | { version: 1; consent: true; operation: "verify_plus"; event_id: string; session_id: string; browser_id?: string };
export class InvalidPayload extends Error {}
function fail(): never { throw new InvalidPayload("Invalid event payload"); }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: Set<string>) { if (Object.keys(value).some(key => !allowed.has(key))) fail(); }
function member(value: unknown, values: string[]) { if (typeof value !== "string" || !values.includes(value)) fail(); }
function optionalMember(value: Record<string, unknown>, key: string, values: string[]) { if (key in value) member(value[key], values); }
function id(value: unknown, random = true) { if (typeof value !== "string" || !(random ? RANDOM_UUID : UUID).test(value)) fail(); }
export function validatePayload(value: unknown, now = Date.now()): Payload {
  if (!object(value) || value.version !== 1 || value.consent !== true) fail();
  if (value.operation === "verify_plus") {
    keys(value, new Set(["version", "consent", "operation", "event_id", "session_id", "browser_id"]));
    id(value.event_id); id(value.session_id); if ("browser_id" in value) id(value.browser_id);
    return value as Payload;
  }
  keys(value, new Set(["version", "consent", "operation", "events"]));
  if (value.operation !== "events" || !Array.isArray(value.events) || value.events.length < 1 || value.events.length > MAX_EVENTS) fail();
  const seen = new Set();
  for (const event of value.events) {
    if (!object(event)) fail(); keys(event, FIELDS);
    id(event.event_id); id(event.session_id); if ("browser_id" in event) id(event.browser_id);
    if (seen.has(event.event_id)) fail(); seen.add(event.event_id);
    if (typeof event.name !== "string" || !NAMES.has(event.name)) fail();
    if (typeof event.occurred_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(event.occurred_at)) fail();
    const timestamp = Date.parse(event.occurred_at);
    if (!Number.isFinite(timestamp) || timestamp > now + 60000 || timestamp < now - 86400000) fail();
    member(event.page, ["home", "news", "account", "markets", "map", "history", "newsletter", "contact", "about", "privacy", "terms", "sources", "briefing", "other"]);
    member(event.device_type, ["mobile", "tablet", "desktop"]); member(event.locale, ["ar", "en"]);
    member(event.referrer_category, ["direct", "internal", "search", "social", "email", "messaging", "other"]);
    if ("article_id" in event) id(event.article_id, false);
    if (["view_article", "article_read", "outbound_source_click"].includes(event.name) && !("article_id" in event)) fail();
    if ("category" in event && (typeof event.category !== "string" || !CATEGORIES.has(event.category))) fail();
    optionalMember(event, "content_type", ["news", "editorial", "analysis", "opinion", "sponsored", "unknown"]);
    optionalMember(event, "plan", ["free", "plus", "monthly", "yearly", "newsletter", "sponsorship"]);
    for (const key of ["has_source_link", "has_query"]) if (key in event && typeof event[key] !== "boolean") fail();
    if ("results_count" in event && (!Number.isInteger(event.results_count) || Number(event.results_count) < 0 || Number(event.results_count) > 1000)) fail();
    if (event.name === "article_read") { if (!Number.isInteger(event.active_ms) || Number(event.active_ms) < 1 || Number(event.active_ms) > 60000) fail(); }
    else if ("active_ms" in event) fail();
    if (event.name === "engagement") member(event.engagement_type, ["scroll_50", "scroll_90", "share", "save", "follow", "reaction"]);
    else if ("engagement_type" in event) fail();
    if (event.name === "signup") member(event.signup_type, ["account", "newsletter"]);
    else if ("signup_type" in event) fail();
  }
  return value as Payload;
}
// Streaming cap also bounds requests with no Content-Length header.
export async function readBody(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) fail();
  const reader = request.body?.getReader(); if (!reader) fail();
  const parts: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > MAX_BYTES) { await reader.cancel(); fail(); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(length); let offset = 0;
  for (const part of parts) { buffer.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); } catch { fail(); }
}
