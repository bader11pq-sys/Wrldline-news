// Source captured from the deployed Supabase edge function `ops-dashboard` (version 8,
// verify_jwt=true) on 2026-11-24. It existed only in production before this commit.
// Behaviour is intentionally unchanged; see docs/ops/deployed-only-functions.md.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://al-ghaib.us.ci",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: authError } = await authClient.auth.getUser();
  if (authError || !userData.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const role = userData.user.app_metadata?.role;
  if (!["admin", "editor"].includes(role)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [feeds, runs, latestRuns, articleCounts, aiPending, translationErrors, aiCooldowns, translationState, breaking] = await Promise.all([
    db.from("feeds").select("id,name,active,last_fetched,last_error").eq("active", true),
    db.from("news_ingestion_runs").select("pipeline,started_at,finished_at,source_count,successful_sources,failed_sources,parsed_items,error_summary,trigger_source").gte("started_at", dayAgo).order("started_at", { ascending: false }).limit(120),
    db.from("news_ingestion_runs").select("pipeline,started_at,finished_at,source_count,successful_sources,failed_sources,parsed_items,error_summary").order("started_at", { ascending: false }).limit(12),
    db.from("articles").select("id", { count: "exact", head: true }).eq("editorial_status", "published").gte("published_at", hourAgo),
    db.from("articles").select("id", { count: "exact", head: true }).eq("editorial_status", "published").neq("ai_classification_status", "classified"),
    db.from("articles").select("id", { count: "exact", head: true }).not("translation_last_error", "is", null).gte("received_at", dayAgo),
    db.from("ai_provider_cooldowns").select("provider,disabled_until,reason,updated_at"),
    db.from("translation_provider_state").select("provider,disabled_until,reason,updated_at"),
    db.from("articles").select("id", { count: "exact", head: true }).eq("is_breaking", true).gte("published_at", hourAgo)
  ]);

  const errors = [feeds,runs,latestRuns,articleCounts,aiPending,translationErrors,aiCooldowns,translationState,breaking].filter(x => x.error);
  if (errors.length) return new Response(JSON.stringify({ error: "تعذر قراءة بعض مؤشرات التشغيل", details: errors.map(x => x.error?.message) }), { status: 502, headers: cors });

  const feedRows = feeds.data || [];
  const runRows = runs.data || [];
  const latest = latestRuns.data || [];
  const recentRuns = runRows.filter(x => x.started_at >= hourAgo);
  const latestIngest = latest.find(x => /ingest|feed|newsdata|breaking/i.test(x.pipeline || "")) || null;
  const latestTranslation = latest.find(x => /translat/i.test(x.pipeline || "")) || null;
  void latestTranslation;
  const providerMap = new Map();
  for (const item of [...(aiCooldowns.data || []), ...(translationState.data || [])]) {
    const prev = providerMap.get(item.provider) || { provider: item.provider, disabled_until: null, reasons: [] };
    if (item.disabled_until && (!prev.disabled_until || item.disabled_until > prev.disabled_until)) prev.disabled_until = item.disabled_until;
    if (item.reason) prev.reasons.push(item.reason);
    providerMap.set(item.provider, prev);
  }
  const failedFeeds = feedRows.filter(x => !!x.last_error);
  const staleFeeds = feedRows.filter(x => !x.last_fetched || new Date(x.last_fetched) < new Date(now.getTime() - 30 * 60 * 1000));
  const publishedLastHour = articleCounts.count || 0;
  const pipelineStats: Record<string, { runs: number; failed: number; parsed: number; latest_at: string }> = {};
  for (const run of runRows) {
    const key = run.pipeline || "unknown";
    const p = pipelineStats[key] || { runs: 0, failed: 0, parsed: 0, latest_at: run.started_at };
    p.runs++; p.failed += Number(run.failed_sources || 0); p.parsed += Number(run.parsed_items || 0);
    if (run.started_at > p.latest_at) p.latest_at = run.started_at;
    pipelineStats[key] = p;
  }
  return new Response(JSON.stringify({
    generated_at: now.toISOString(),
    feeds: { active: feedRows.length, failed: failedFeeds.length, stale: staleFeeds.length, failed_samples: failedFeeds.slice(0, 15).map(x => ({ name:x.name, last_error:x.last_error, last_fetched:x.last_fetched })) },
    ingestion: { runs_24h: runRows.length, runs_1h: recentRuns.length, latest: latestIngest, latest_runs: latest, pipelines: pipelineStats, parsed_24h: runRows.reduce((n,x)=>n+Number(x.parsed_items||0),0), failed_source_attempts_24h: runRows.reduce((n,x)=>n+Number(x.failed_sources||0),0) },
    content: { published_last_hour: publishedLastHour, ai_pending: aiPending.count || 0, translation_errors_24h: translationErrors.count || 0, classification_24h: {} },
    providers: [...providerMap.values()],
    breaking_last_hour: breaking.count || 0
  }), { headers: cors });
});
