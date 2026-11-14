import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") || "https://al-ghaib.us.ci",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-wrldline-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default; } catch { return null; } })();
  if (!url || !serviceKey) return json({ error: "Server configuration is incomplete" }, 500);

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const secret = req.headers.get("x-wrldline-cron-secret") || "";
  const { data: authorized, error: authError } = await db.rpc("verify_wrldline_cron_secret", { p_secret: secret });
  if (authError || authorized !== true) return json({ error: "Unauthorized" }, 401);

  // Maintenance is deliberately idempotent. The first run expires the legacy
  // backlog; subsequent runs are cheap because the queue indexes cover it.
  await db.rpc("expire_stale_classification_queue");
  await db.rpc("release_stale_classification_claims");

  const claimed = await db.rpc("claim_classification_batch", { p_limit: 20 });
  if (claimed.error) {
    return json({ error: "Could not claim classification batch", detail: claimed.error.message }, 500);
  }
  const rows = Array.isArray(claimed.data) ? claimed.data : [];
  if (!rows.length) {
    const stats = await db.rpc("classification_queue_stats");
    return json({ ok: true, selected: 0, processed: 0, stats: stats.data || null });
  }

  const summary = {
    selected: rows.length,
    processed: 0,
    classified: 0,
    needs_review: 0,
    failed: 0,
    deferred: 0,
    expired_ignored: 0,
    telegram_ticker_only: 0,
    batches: 0,
    errors: [] as string[],
  };

  // classify-news accepts at most 10 ids per request.
  for (let offset = 0; offset < rows.length; offset += 10) {
    const batch = rows.slice(offset, offset + 10);
    summary.batches++;
    let response: Response;
    try {
      response = await fetch(url + "/functions/v1/classify-news", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + serviceKey,
          "apikey": serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ article_ids: batch.map((article: any) => article.id), allow_backlog: true }),
        signal: AbortSignal.timeout(115000),
      });
    } catch (error) {
      await db.rpc("release_classification_claims", { p_ids: batch.map((article: any) => article.id) });
      summary.failed += batch.length;
      summary.errors.push("request: " + String(error).slice(0, 220));
      break;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      await db.rpc("release_classification_claims", { p_ids: batch.map((article: any) => article.id) });
      summary.failed += batch.length;
      summary.errors.push("classifier HTTP " + response.status + ": " + String(payload?.error || "").slice(0, 220));
      break;
    }

    const results = Array.isArray(payload.results) ? payload.results : [];
    summary.processed += results.length;
    for (const item of results) {
      if (item.status === "classified") summary.classified++;
      else if (item.status === "needs_review") summary.needs_review++;
      else if (item.status === "failed") summary.failed++;
      else if (item.status === "deferred") summary.deferred++;
      else if (item.status === "expired_ignored") summary.expired_ignored++;
      else if (item.status === "telegram_ticker_only") summary.telegram_ticker_only++;
    }
    // A provider-wide quota signal should stop this run, not burn the rest of
    // the batch. The remaining claims will be retried by the stale-claim sweep.
    if (payload.rate_limited || response.status === 429 || response.status === 503) {
      summary.deferred += batch.length - results.length;
      break;
    }
  }

  const stats = await db.rpc("classification_queue_stats");
  console.log("WRLDLINE_CLASSIFICATION_WORKER", JSON.stringify({ ...summary, stats: stats.data || null }));
  return json({ ok: true, ...summary, stats: stats.data || null });
});
