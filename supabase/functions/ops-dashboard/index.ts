import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  mergeProviderStates,
  normalizeClassificationStats,
  summarizeRuns
} from "./metrics.mjs";

const cors = {
  "Access-Control-Allow-Origin": "https://al-ghaib.us.ci",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Vary": "Origin"
};

type FeedRow = {
  id: string;
  name: string | null;
  active: boolean;
  last_fetched: string | null;
  last_error: string | null;
};

type IngestionRun = {
  pipeline: string | null;
  started_at: string;
  finished_at: string | null;
  source_count: number | null;
  successful_sources: number | null;
  failed_sources: number | null;
  parsed_items: number | null;
  error_summary: string | null;
  trigger_source: string | null;
};

type ProviderState = {
  provider: string;
  disabled_until: string | null;
  reason: string | null;
  updated_at: string | null;
};

type QueryResult<T> = {
  data: T | null;
  count: number | null;
  error: { message?: string } | null;
};

type ClassificationStats = {
  pending: number | null;
  processing: number | null;
  failed: number | null;
  expired: number | null;
  classified: number | null;
  needs_review: number | null;
  skipped: number | null;
  oldest_pending_age_minutes: number | null;
  oldest_pending_at: string | null;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: cors });
}

async function safeQuery<T>(query: PromiseLike<unknown>): Promise<QueryResult<T>> {
  try {
    return await query as QueryResult<T>;
  } catch (error: unknown) {
    return {
      data: null,
      count: null,
      error: { message: error instanceof Error ? error.message : String(error) }
    };
  }
}

function errorMessage(result: QueryResult<unknown>): string {
  return String(result.error?.message || "Unknown query error").slice(0, 220);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return json({ error: "Monitoring service is not configured" }, 503);
  }

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: authError } = await authClient.auth.getUser();
  if (authError || !userData.user) return json({ error: "Unauthorized" }, 401);

  const role = userData.user.app_metadata?.role;
  if (!["admin", "editor"].includes(role)) {
    return json({ error: "Forbidden" }, 403);
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [
    feedsResult,
    runsResult,
    articleCountsResult,
    translationErrorsResult,
    aiCooldownsResult,
    translationStateResult,
    breakingResult,
    classificationResult
  ] = await Promise.all([
    safeQuery<FeedRow[]>(db.from("feeds")
      .select("id,name,active,last_fetched,last_error")
      .eq("active", true)),
    safeQuery<IngestionRun[]>(db.from("news_ingestion_runs")
      .select("pipeline,started_at,finished_at,source_count,successful_sources,failed_sources,parsed_items,error_summary,trigger_source")
      .gte("started_at", dayAgo)
      .order("started_at", { ascending: false })
      .limit(200)),
    safeQuery<null>(db.from("articles")
      .select("id", { count: "exact", head: true })
      .eq("editorial_status", "published")
      .gte("published_at", hourAgo)),
    safeQuery(db.from("articles")
      .select("id", { count: "exact", head: true })
      .not("translation_last_error", "is", null)
      .gte("received_at", dayAgo)),
    safeQuery<ProviderState[]>(db.from("ai_provider_cooldowns")
      .select("provider,disabled_until,reason,updated_at")),
    safeQuery<ProviderState[]>(db.from("translation_provider_state")
      .select("provider,disabled_until,reason,updated_at")),
    safeQuery(db.from("articles")
      .select("id", { count: "exact", head: true })
      .eq("is_breaking", true)
      .gte("published_at", hourAgo)),
    safeQuery<unknown>(db.rpc("classification_queue_stats"))
  ]);

  const results = {
    feeds: feedsResult,
    ingestion: runsResult,
    published: articleCountsResult,
    translation_errors: translationErrorsResult,
    ai_providers: aiCooldownsResult,
    translation_providers: translationStateResult,
    breaking: breakingResult,
    classification: classificationResult
  };
  const issues = Object.entries(results)
    .filter(([, result]) => result?.error)
    .map(([name, result]) => ({ metric: name, message: errorMessage(result) }));

  const feedRows = feedsResult.data || [];
  const runRows = runsResult.data || [];
  const stats: ClassificationStats | null = classificationResult.error
    ? null
    : normalizeClassificationStats(classificationResult.data) as ClassificationStats | null;
  const runSummary = summarizeRuns(runRows);
  const recentRuns = runRows.filter((run) => run.started_at >= hourAgo);
  const latest = [...runRows].sort((a, b) =>
    String(b.started_at || "").localeCompare(String(a.started_at || ""))
  );
  const latestIngest = latest.find((run) =>
    /ingest|feed|newsdata|breaking/i.test(run.pipeline || "")
  ) || null;
  const failedFeeds = feedRows.filter((feed) => Boolean(feed.last_error));
  const staleFeeds = feedRows.filter((feed) =>
    !feed.last_fetched ||
    new Date(feed.last_fetched).getTime() < now.getTime() - 30 * 60 * 1000
  );
  const pipelineStats = runSummary.pipelines;
  const providerRows = mergeProviderStates(
    aiCooldownsResult.data || [],
    translationStateResult.data || [],
    now.getTime()
  );

  const content = {
    published_last_hour: articleCountsResult.error ? null : articleCountsResult.count || 0,
    ai_pending: stats?.pending ?? null,
    translation_errors_24h: translationErrorsResult.error ? null : translationErrorsResult.count || 0,
    classification: stats ? { available: true, ...stats } : {
      available: false,
      pending: null,
      processing: null,
      failed: null,
      expired: null,
      classified: null,
      needs_review: null,
      oldest_pending_age_minutes: null,
      oldest_pending_at: null
    }
  };

  const availability = Object.fromEntries(
    Object.entries(results).map(([name, result]) => [name, !result?.error])
  );

  return json({
    generated_at: now.toISOString(),
    health: {
      status: issues.length ? "degraded" : "ok",
      issues,
      availability
    },
    feeds: {
      available: !feedsResult.error,
      active: feedsResult.error ? null : feedRows.length,
      failed: feedsResult.error ? null : failedFeeds.length,
      stale: feedsResult.error ? null : staleFeeds.length,
      failed_samples: feedsResult.error ? [] : failedFeeds.slice(0, 15).map((feed) => ({
        name: feed.name,
        last_error: feed.last_error,
        last_fetched: feed.last_fetched
      }))
    },
    ingestion: {
      available: !runsResult.error,
      runs_24h: runsResult.error ? null : runRows.length,
      runs_1h: runsResult.error ? null : recentRuns.length,
      latest: runsResult.error ? null : latestIngest,
      latest_runs: runsResult.error ? [] : latest.slice(0, 12),
      pipelines: runsResult.error ? {} : pipelineStats,
      parsed_24h: runsResult.error ? null : runRows.reduce((sum, run) => sum + Number(run.parsed_items || 0), 0),
      failed_source_attempts_24h: runsResult.error ? null : runRows.reduce((sum, run) => sum + Number(run.failed_sources || 0), 0),
      last_success_at: runsResult.error ? null : runSummary.last_success_at,
      last_failure_at: runsResult.error ? null : runSummary.last_failure_at
    },
    content,
    providers: providerRows,
    breaking_last_hour: breakingResult.error ? null : breakingResult.count || 0,
    queue: {
      available: false,
      source: "cloudflare",
      reason: "Cloudflare Queue metrics are not connected to this Supabase Edge Function. Do not interpret this as a zero backlog."
    }
  });
});
