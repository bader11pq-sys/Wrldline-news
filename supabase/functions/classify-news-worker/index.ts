import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-wrldline-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function isTelegram(article: any) {
  return /t\\.me|telegram\\.me|telegram/i.test(
    [article.url, article.source_url, article.source_name].filter(Boolean).join(" "),
  );
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

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await db
    .from("articles")
    .select("id,url,source_url,source_name,published_at,ai_classification_status")
    .eq("editorial_status", "published")
    .gte("published_at", cutoff)
    .in("ai_classification_status", ["pending", "failed"])
    .order("published_at", { ascending: true })
    .limit(50);

  if (error) return json({ error: "Could not load pending articles", detail: error.message }, 500);

  const candidates = (rows || []).filter((article: any) => !isTelegram(article)).slice(0, 5);
  if (!candidates.length) return json({ ok: true, selected: 0, processed: 0, message: "No eligible recent articles" });

  const response = await fetch(url + "/functions/v1/classify-news", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + serviceKey,
      "apikey": serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ article_ids: candidates.map((article: any) => article.id) }),
    signal: AbortSignal.timeout(115000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("CLASSIFICATION_WORKER_ERROR", response.status, JSON.stringify(payload).slice(0, 500));
    return json({ ok: false, selected: candidates.length, error: payload?.error || "Classifier request failed", status: response.status }, 502);
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  const summary = {
    ok: true,
    selected: candidates.length,
    processed: results.length,
    classified: results.filter((item: any) => item.status === "classified").length,
    needs_review: results.filter((item: any) => item.status === "needs_review").length,
    failed: results.filter((item: any) => item.status === "failed").length,
    deferred: results.filter((item: any) => item.status === "deferred").length,
    expired_ignored: results.filter((item: any) => item.status === "expired_ignored").length,
  };
  console.log("WRLDLINE_CLASSIFICATION_WORKER", JSON.stringify(summary));
  return json({ ...summary, results });
});
