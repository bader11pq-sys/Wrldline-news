import { choices, hash, tokenFor, tokenValid, validSubscription, validPushEndpoint } from "../_shared/notifications/core.ts";
import { boundedText, database, environment, headers, health, ip, json, limit, parseBody, resolveEnv, rpc, type DB, type Env } from "../_shared/notifications/server.ts";

export function createHandler(baseEnv: Env, db: DB) {
  return async (req: Request): Promise<Response> => {
    const env = await resolveEnv(db,baseEnv).catch(()=>baseEnv);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(env) });
    const url = new URL(req.url);
    const isUnsubscribe = url.pathname.endsWith("/unsubscribe");
    // Public one-click POST is exempt from browser Origin gating; it authenticates by opaque token.
    if (!isUnsubscribe && req.headers.get("origin") && req.headers.get("origin") !== (env.SITE_URL || "https://al-ghaib.us.ci")) return json(env, { error: "origin_not_allowed" }, 403);
    try {
      // Mailbox providers share source IPs; keep one-click limits separate from browser/signup limits.
      await limit(db, isUnsubscribe ? "unsubscribe-ip" : "ip", ip(req), isUnsubscribe ? 1000 : 80,isUnsubscribe ? 60 : 3600,env);
      if (req.method === "GET" && isUnsubscribe) {
        // GET, prefetch, and security scanners never revoke consent. This inert form requires POST.
        const token = url.searchParams.get("token") || "";
        if (!tokenValid(token)) return json(env, { error: "invalid_token" }, 400);
        const h = { ...headers(env), "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" };
        return new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width"><title>إلغاء نشرة WRLDLINE</title><body style="background:#101b2d;color:#eee;font-family:system-ui;padding:32px"><h1>إلغاء النشرة</h1><p>لم يتم تغيير اشتراكك. اضغط للتأكيد.</p><form method="post" action="${url.pathname}"><input type="hidden" name="token" value="${token}"><button type="submit" name="List-Unsubscribe" value="One-Click">تأكيد إلغاء الاشتراك</button></form></body></html>`, { headers: h });
      }
      if (req.method === "GET" && (url.searchParams.get("action") === "config" || url.pathname.endsWith("/config"))) {
        return json(env, { ok: true, ...await health(db, env) });
      }
      if (req.method !== "POST") return json(env, { error: "method_not_allowed" }, 405);
      let body: Record<string, unknown>;
      if (isUnsubscribe && req.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
        const text = await boundedText(req,2048);
        const fields = new URLSearchParams(text);
        if (fields.get("List-Unsubscribe") !== "One-Click") return json(env, { error: "invalid_request" }, 400);
        body = { action: "newsletter_unsubscribe", token: fields.get("token") || url.searchParams.get("token") };
      } else body = await parseBody(req);
      const action = isUnsubscribe ? "newsletter_unsubscribe" : body.action;
      if (action === "config") return json(env, { ok: true, ...await health(db, env) });
      if (action === "newsletter_confirm" || action === "newsletter_unsubscribe") {
        if (!tokenValid(body.token)) return json(env, { error: "invalid_token" }, 400);
        await limit(db, "token", body.token, 15,3600,env);
        const result = await rpc<boolean>(db, action === "newsletter_confirm" ? "notification_confirm" : "notification_unsubscribe", { p_hash: await hash(body.token) });
        if (action === "newsletter_confirm" && !result) return json(env, { error: "confirmation_expired" }, 400);
        return json(env, { ok: true, status: action === "newsletter_confirm" ? "confirmed" : "unsubscribed" });
      }
      if (action === "newsletter_subscribe") {
        if (!(await health(db, env)).email_ready) return json(env, { error: "email_unavailable" }, 503);
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || body.consent !== true || body.website || !["daily", "weekly"].includes(String(body.cadence))) return json(env, { error: "invalid_request" }, 400);
        await limit(db, "signup-email", email, 3, 86400,env);
        await limit(db, "signup-ip", ip(req), 5, 3600,env);
        const topics = choices(body.topics), countries = choices(body.countries);
        const { data: existing, error: lookupError } = await db.from("newsletter_optins").select("id").eq("email", email).maybeSingle();
        if (lookupError) throw new Error("database_unavailable");
        const id = existing?.id || crypto.randomUUID(), nonce = crypto.randomUUID();
        const confirmation = await tokenFor(env.NOTIFICATION_TOKEN_SECRET, id, nonce, "confirm");
        const unsubscribe = await tokenFor(env.NOTIFICATION_TOKEN_SECRET, id, nonce, "unsubscribe");
        const rows = await rpc<Array<{ id: string; token_nonce: string }>>(db, "notification_request_optin", {
          p_id: id, p_email: email, p_locale: body.locale === "en" ? "en" : "ar", p_cadence: body.cadence,
          p_topics: topics, p_countries: countries, p_nonce: nonce, p_confirm_hash: await hash(confirmation), p_unsubscribe_hash: await hash(unsubscribe),
        });
        if (rows.length) {
          const row = rows[0];
          const { error } = await db.from("notification_deliveries").upsert({ dedupe_key: `confirmation:${row.id}:${row.token_nonce}`, kind: "confirmation", newsletter_id: row.id, token_nonce: row.token_nonce }, { onConflict: "dedupe_key", ignoreDuplicates: true });
          if (error) throw new Error("database_unavailable");
        }
        // Same response for new, pending, and already-confirmed addresses. A queue is not a delivery receipt.
        return json(env, { ok: true, status: "confirmation_requested" }, 202);
      }
      if (!["push_subscribe", "push_delete", "push_status"].includes(String(action))) return json(env, { error: "unknown_action" }, 400);
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token || token.length > 8192) return json(env, { error: "unauthorized" }, 401);
      // getUser verifies the JWT with Supabase Auth, never just decodes caller-provided claims.
      const { data, error: authError } = await db.auth.getUser(token);
      if (authError || !data.user) return json(env, { error: "unauthorized" }, 401);
      const userId = data.user.id;
      await limit(db, "push-user", userId, 30,3600,env);
      if (action === "push_subscribe") {
        if (!(await health(db, env)).push_ready) return json(env, { error: "push_unavailable" }, 503);
        if (body.consent !== true || !validSubscription(body.subscription)) return json(env, { error: "invalid_subscription" }, 400);
        const s = body.subscription, endpointHash = await hash(s.endpoint);
        const { data: previous, error } = await db.from("push_subscriptions").select("id,user_id").eq("endpoint_hash", endpointHash).maybeSingle();
        if (error) throw new Error("database_unavailable");
        if (previous && previous.user_id !== userId) return json(env, { error: "subscription_owned_elsewhere" }, 409);
        const payload = { user_id: userId, endpoint: s.endpoint, endpoint_hash: endpointHash, p256dh: s.keys.p256dh, auth: s.keys.auth, disabled_at: null, consent_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        // Updates are owner-constrained; first-insert races fail safely on the unique endpoint hash.
        const result = previous ? await db.from("push_subscriptions").update(payload).eq("id", previous.id).eq("user_id", userId) : await db.from("push_subscriptions").insert(payload);
        if (result.error) return json(env, { error: "subscription_conflict" }, 409);
        return json(env, { ok: true, status: "subscribed" });
      }
      if (!validPushEndpoint(body.endpoint)) return json(env, { error: "invalid_endpoint" }, 400);
      const endpointHash = await hash(body.endpoint);
      if (action === "push_delete") {
        const { error } = await db.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint_hash", endpointHash);
        if (error) throw new Error("database_unavailable");
        return json(env, { ok: true, status: "unsubscribed" });
      }
      const { data: subscription, error } = await db.from("push_subscriptions").select("id,disabled_at").eq("user_id", userId).eq("endpoint_hash", endpointHash).maybeSingle();
      if (error) throw new Error("database_unavailable");
      return json(env, { ok: true, subscribed: !!subscription && !subscription.disabled_at });
    } catch (error) {
      // Deliberately never log requests, tokens, push endpoints, emails, or provider error bodies.
      const code = error instanceof Error ? error.message : "service_unavailable";
      if (code === "rate_limited") return json(env, { error: code }, 429);
      if (["invalid_choices", "invalid_request"].includes(code)) return json(env, { error: code }, 400);
      return json(env, { error: "service_unavailable" }, 503);
    }
  };
}
if (import.meta.main) {
  const env = environment();
  let db: DB | undefined;
  Deno.serve(async req => { try { db ||= database(env); return await createHandler(env, db)(req); } catch { return json(env, { error: "service_unavailable" }, 503); } });
}
