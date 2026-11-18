import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { classifyCronVerifierResult } from "../_shared/cron-auth.mjs";
import { resolveSupabaseServiceKey, serviceApiHeaders, serviceClientOptions } from "../_shared/service-key.mjs";

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
  const serviceKey = resolveSupabaseServiceKey({
    SUPABASE_SECRET_KEY: Deno.env.get("SUPABASE_SECRET_KEY") || "",
    SUPABASE_SECRET_KEYS: Deno.env.get("SUPABASE_SECRET_KEYS") || "",
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  });
  if (!url || !serviceKey) return json({ error: "Server configuration is incomplete" }, 500);

  const db = createClient(url, serviceKey, serviceClientOptions(serviceKey));
  const secret = req.headers.get("x-wrldline-cron-secret") || "";
  const { data: authorized, error: authError } = await db.rpc("verify_wrldline_cron_secret", { p_secret: secret });
  const authResult = classifyCronVerifierResult({ ok: !authError, value: authorized });
  if (authResult.status === 503) return json({ error: "Authorization verifier temporarily unavailable" }, 503);
  if (!authResult.authorized) return json({ error: "Unauthorized" }, 401);

  // No-write probe for the Worker-to-classifier path. Keep it before expiry,
  // claim, provider calls, and every database mutation.
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (body.mode === "auth-check") return json({ ok: true, mode: "auth-check" });

  // Maintenance is deliberately idempotent. The first run expires the legacy
  // backlog; subsequent runs are cheap because the queue indexes cover it.
  const expired = await db.rpc("expire_stale_classification_queue");
  if (expired.error) return json({ error: "Could not expire out-of-window queue rows", detail: expired.error.message }, 500);
  const released = await db.rpc("release_stale_classification_claims");
  if (released.error) return json({ error: "Could not release stale claims", detail: released.error.message }, 500);

  const claimed = await db.rpc("claim_classification_batch", { p_limit: 10 });
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
        headers: serviceApiHeaders(serviceKey),
        body: JSON.stringify({ article_ids: batch.map((article: any) => article.id) }),
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
    const returnedIds = new Set<string>();
    for (const item of results) {
      if (typeof item.id === "string") returnedIds.add(item.id);
      if (item.status === "classified") summary.classified++;
      else if (item.status === "needs_review") summary.needs_review++;
      else if (item.status === "failed") summary.failed++;
      else if (item.status === "deferred") summary.deferred++;
      else if (item.status === "expired_ignored") summary.expired_ignored++;
      else if (item.status === "telegram_ticker_only") summary.telegram_ticker_only++;
    }

    // If the classifier stopped early (for example, all providers were rate
    // limited), release every claimed ID that did not receive an explicit
    // result. Do not strand those articles in "processing" for 15 minutes.
    const unreturnedIds = batch.filter((article: any) => !returnedIds.has(article.id)).map((article: any) => article.id);
    if (unreturnedIds.length) {
      const releaseMissing = await db.rpc("release_classification_claims", { p_ids: unreturnedIds });
      summary.deferred += unreturnedIds.length;
      if (releaseMissing.error) summary.errors.push("release unreturned claims: " + releaseMissing.error.message.slice(0, 180));
    }

    // Stop after a partial result or provider-wide quota signal. The next
    // minute's run will retry only stories still inside the 60-minute window.
    if (payload.rate_limited || response.status === 429 || response.status === 503 || unreturnedIds.length > 0) {
      break;
    }
  }

  const stats = await db.rpc("classification_queue_stats");
  console.log("WRLDLINE_CLASSIFICATION_WORKER", JSON.stringify({ ...summary, stats: stats.data || null }));
  return json({ ok: true, ...summary, stats: stats.data || null });
});
