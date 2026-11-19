import { articlePath, escapeHtml, hash, matchesPush, previousPeriod, retryDelay, tokenFor, type Article, type Preferences } from "../_shared/notifications/core.ts";
import { adapters, DeliveryError, type Mail, type Senders } from "../_shared/notifications/adapters.ts";
import { database, environment, health, json, resolveEnv, rpc, type DB, type Env } from "../_shared/notifications/server.ts";
interface Delivery {
  id: string; kind: "push" | "digest" | "confirmation"; lease_token: string; attempts: number; created_at: string;
  push_subscription_id: string; newsletter_id: string; article_id: string; token_nonce: string;
  period_start: string; period_end: string; content: { articles?: Article[]; locale?: string; cadence?: string; topics?: string[]; countries?: string[] } | null;
}
const articleColumns = "id,title,summary,category,country,event_country,topics,is_breaking,published_at,editorial_status";
async function finish(db: DB, job: Delivery, state: string, code: string | null = null, provider: string | null = null, delay = 0) {
  return await rpc(db, "notification_finish", { p_id: job.id, p_lease: job.lease_token, p_status: state, p_error: code, p_provider: provider, p_delay: delay });
}
async function one<T>(db: DB, table: string, columns: string, id: string): Promise<T | null> {
  const { data, error } = await db.from(table).select(columns).eq("id", id).maybeSingle();
  if (error) throw new Error("database_unavailable"); return data as T | null;
}
export async function deliver(db: DB, env: Env, job: Delivery, send: Senders): Promise<string> {
  let sendingStarted = false;
  try {
    if (job.kind === "push") {
      const sub = await one<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string; disabled_at: string | null }>(db, "push_subscriptions", "id,user_id,endpoint,p256dh,auth,disabled_at", job.push_subscription_id);
      const article = await one<Article>(db, "articles", articleColumns, job.article_id);
      const publication = article ? new Date(article.published_at).getTime() : NaN;
      if (!sub || sub.disabled_at || !article || article.editorial_status !== "published" || !Number.isFinite(publication) || publication < Date.now() - 2 * 3600000 || publication > Date.now()+120000) {
        await finish(db, job, "cancelled", "stale_or_removed"); return "cancelled";
      }
      const { data: prefs, error } = await db.from("user_preferences").select("notify_breaking,notify_categories,notify_countries,browser_notifications").eq("user_id", sub.user_id).maybeSingle();
      if (error) throw new Error("database_unavailable");
      if (!prefs || !matchesPush(article, prefs as Preferences)) { await finish(db, job, "cancelled", "preferences_disabled"); return "cancelled"; }
      sendingStarted = true;
      const provider = await send.push({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, {
        user_id: sub.user_id, article_id: article.id, title: String(article.title || "").slice(0,160),
        body: String(article.summary || "").slice(0,180), url: articlePath(article.id), is_breaking: !!article.is_breaking,
      });
      await finish(db, job, "sent", null, provider); return "sent";
    }
    const optin = await one<{ id: string; email: string; locale: string; cadence: string; topics: string[]; countries: string[]; status: string; token_nonce: string; confirmation_expires_at: string; confirmation_hash: string; unsubscribe_hash: string }>(db, "newsletter_optins", "id,email,locale,cadence,topics,countries,status,confirmed_at,token_nonce,confirmation_expires_at,confirmation_hash,unsubscribe_hash", job.newsletter_id);
    if (!optin || optin.token_nonce !== job.token_nonce || (job.kind === "confirmation" ? optin.status !== "pending" || new Date(optin.confirmation_expires_at).getTime() <= Date.now() : optin.status !== "confirmed")) {
      await finish(db, job, "cancelled", "consent_unavailable"); return "cancelled";
    }
    const unsubToken = await tokenFor(env.NOTIFICATION_TOKEN_SECRET, optin.id, optin.token_nonce, "unsubscribe");
    if (await hash(unsubToken) !== optin.unsubscribe_hash) { await finish(db, job, "failed", "token_key_changed"); return "failed"; }
    let snapshot = job.content;
    if (!snapshot) {
      const articles = job.kind === "digest" ? await rpc<Article[]>(db, "notification_digest_articles", { p_newsletter_id: optin.id, p_start: job.period_start, p_end: job.period_end, p_limit: 20 }) : [];
      snapshot = { articles, locale: optin.locale, cadence: optin.cadence, topics: optin.topics, countries: optin.countries };
      // Snapshot public editorial text, never raw confirmation/unsubscribe tokens.
      snapshot = await rpc(db, "notification_prepare_delivery", { p_id: job.id, p_lease: job.lease_token, p_content: snapshot });
      if (!snapshot) throw new Error("lease_lost");
    }
    const en = snapshot.locale === "en";
    const site = env.SITE_URL.replace(/\/$/, "");
    const unsub = `${site}/newsletter.html#unsubscribe=${unsubToken}`;
    const oneClick = `${env.SUPABASE_URL}/functions/v1/notification-center/unsubscribe?token=${unsubToken}`;
    let mail: Mail;
    if (job.kind === "confirmation") {
      const token = await tokenFor(env.NOTIFICATION_TOKEN_SECRET, optin.id, optin.token_nonce, "confirm");
      if (await hash(token) !== optin.confirmation_hash) { await finish(db, job, "failed", "token_key_changed"); return "failed"; }
      const link = `${site}/newsletter.html#confirm=${token}`;
      const subject = en ? "Confirm your WRLDLINE newsletter" : "أكّد اشتراكك في نشرة WRLDLINE";
      const topicChoice = snapshot.topics?.join("، ") || (en ? "All topics" : "جميع الأقسام"), countryChoice = snapshot.countries?.join("، ") || (en ? "All countries" : "جميع الدول");
      const description = en ? `You requested the ${snapshot.cadence} newsletter. Topics: ${topicChoice}. Countries: ${countryChoice}. Confirm within 48 hours. Ignore this email if you did not request it; no newsletter will be sent.` : `طلبت نشرة ${snapshot.cadence === "daily" ? "يومية" : "أسبوعية"}. الأقسام: ${topicChoice}. الدول: ${countryChoice}. أكّد بريدك خلال 48 ساعة. إن لم تطلب الاشتراك فتجاهل الرسالة؛ لن نرسل النشرة دون التأكيد.`;
      mail = { to: optin.email, subject, html: `<div dir="${en ? "ltr" : "rtl"}"><h1>WRLDLINE NEWS</h1><p>${escapeHtml(description)}</p><p><a href="${link}">${en ? "Confirm subscription" : "تأكيد الاشتراك"}</a></p><p><a href="${unsub}">${en ? "Cancel request" : "إلغاء الطلب"}</a></p></div>`, text: `${subject}\n${description}\n${link}\n${unsub}` };
    } else {
      const articles = snapshot.articles || [];
      if (!articles.length) { await finish(db, job, "cancelled", "empty_digest"); return "cancelled"; }
      const subject = en ? `WRLDLINE · ${snapshot.cadence === "daily" ? "Daily" : "Weekly"} briefing` : `WRLDLINE · النشرة ${snapshot.cadence === "daily" ? "اليومية" : "الأسبوعية"}`;
      const links = articles.map(a => ({ ...a, link: site + articlePath(a.id) }));
      mail = { to: optin.email, subject, html: `<div dir="${en ? "ltr" : "rtl"}"><h1>${escapeHtml(subject)}</h1><p>${job.period_start.slice(0,10)} — ${job.period_end.slice(0,10)} UTC</p>${links.map(a => `<article><h2><a href="${a.link}">${escapeHtml(a.title)}</a></h2><p>${escapeHtml(a.summary || "")}</p></article>`).join("")}<p><a href="${unsub}">${en ? "Unsubscribe" : "إلغاء الاشتراك"}</a></p></div>`, text: `${subject}\n${links.map(a => `${a.title}\n${a.summary || ""}\n${a.link}`).join("\n\n")}\n${en ? "Unsubscribe" : "إلغاء الاشتراك"}: ${unsub}`,
        headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
    }
    // Resend accepts an idempotency key for 24h; all retries use the same immutable public snapshot.
    sendingStarted = true;
    const provider = await send.email(mail, "wrldline-" + job.id);
    await finish(db, job, "sent", null, provider); return "sent";
  } catch (error) {
    const e = error instanceof DeliveryError ? error : new DeliveryError("worker_internal", !sendingStarted, sendingStarted);
    if (e.stale && job.push_subscription_id) {
      // Remove unusable endpoints/keys. ON DELETE SET NULL preserves the delivery ledger.
      const { error: pruneError } = await db.from("push_subscriptions").delete().eq("id", job.push_subscription_id);
      if (pruneError) { /* terminal ledger still prevents resend; maintenance may prune later */ }
    }
    const age = Date.now() - new Date(job.created_at).getTime();
    const retry = e.retryable && job.attempts < 5 && age < 23 * 3600000;
    const state = retry ? "retry" : e.ambiguous ? "uncertain" : "failed";
    await finish(db, job, state, e.code, null, retryDelay(job.attempts));
    return state;
  }
}
export function createHandler(env: Env, db: DB, send?: Senders) {
  return async (req: Request): Promise<Response> => {
    // Existing app-native Vault secret verifier; never accepts a public key or user JWT.
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    try {
      const secret = req.headers.get("x-wrldline-cron-secret") || "";
      if (!secret || secret.length > 512) return new Response("Unauthorized", { status: 401 });
      const { data: authorized, error: authError } = await db.rpc("verify_wrldline_cron_secret", { p_secret: secret });
      if (authError || authorized !== true) return new Response("Unauthorized", { status: 401 });
      const effectiveEnv = await resolveEnv(db,env);
      const sender = send || adapters(effectiveEnv);
      const config = await health(db, effectiveEnv);
      const url = new URL(req.url);
      if (url.searchParams.get("action") === "health") return json(env, { ok: true, ...config });
      const channel = url.searchParams.get("channel") || "all";
      if (!["all", "push", "email"].includes(channel)) return json(env, { error: "invalid_channel" }, 400);
      const kinds: string[] = [];
      // Email-only scheduling must never plan or claim push deliveries.
      if (channel !== "email" && config.push_ready) { kinds.push("push"); await rpc(db, "notification_plan_push", { p_limit: 100 }); }
      if (channel !== "push" && config.email_ready) {
        kinds.push("digest", "confirmation");
        for (const cadence of ["daily", "weekly"] as const) {
          const period = previousPeriod(cadence);
          await rpc(db, "notification_plan_digest", { p_cadence: cadence, p_start: period.start, p_end: period.end, p_limit: 100 });
        }
      }
      if (!kinds.length) return json(env, { ok: true, configured: false, claimed: 0, sent: 0 });
      const jobs = await rpc<Delivery[]>(db, "notification_claim", { p_kinds: kinds, p_limit: 20 });
      const counts: Record<string, number> = { claimed: jobs.length, sent: 0, retry: 0, failed: 0, uncertain: 0, cancelled: 0 };
      // Four bounded lanes, 20 jobs maximum; 12-second per-provider timeout.
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
        while (cursor < jobs.length) { const job = jobs[cursor++]; const outcome = await deliver(db, effectiveEnv, job, sender); counts[outcome]++; }
      }));
      return json(env, { ok: true, configured: true, ...counts });
    } catch { return json(env, { error: "dispatch_unavailable" }, 503); }
  };
}
if (import.meta.main) {
  const env = environment();
  let db: DB | undefined;
  Deno.serve(async req => { try { db ||= database(env); return await createHandler(env, db)(req); } catch { return json(env, { error: "dispatch_unavailable" }, 503); } });
}
