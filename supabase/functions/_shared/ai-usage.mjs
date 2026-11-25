// Persists secret-free AI usage records produced by ai-router to public.ai_usage_log.
// Telemetry is best-effort: a failed or missing table must never fail a user-facing job.
import { redact, estimateCostUsd } from "./ai-router.mjs";

/** OpenAI-compatible `usage` or Gemini `usageMetadata` -> { inputTokens, outputTokens } | null */
export function tokensFromPayload(payload) {
  const u = payload?.usage, g = payload?.usageMetadata;
  if (u && (u.prompt_tokens != null || u.completion_tokens != null)) {
    return { inputTokens: Number(u.prompt_tokens) || 0, outputTokens: Number(u.completion_tokens) || 0 };
  }
  if (g && (g.promptTokenCount != null || g.candidatesTokenCount != null)) {
    return { inputTokens: Number(g.promptTokenCount) || 0, outputTokens: Number(g.candidatesTokenCount) || 0 };
  }
  return null;
}

/** Attach usage to a parsed result without making it enumerable (so it is never persisted as content). */
export function attachUsage(data, usage) {
  if (data && typeof data === "object" && usage) Object.defineProperty(data, "__usage", { value: usage, enumerable: false, configurable: true });
  return data;
}

const nn = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : null);

export function toRow(rec, ctx) {
  return {
    function_name: String(ctx.functionName).slice(0, 80),
    task: String(rec.task || ctx.task || "unknown").slice(0, 40),
    provider: String(rec.provider || "unknown").slice(0, 40),
    model: rec.model ? String(rec.model).slice(0, 120) : null,
    ok: !!rec.ok,
    error_kind: rec.ok ? null : (rec.kind || null),
    http_status: rec.status != null ? Math.min(599, Math.max(0, nn(rec.status) ?? 0)) : null,
    latency_ms: nn(rec.ms),
    input_tokens: nn(rec.usage?.inputTokens),
    output_tokens: nn(rec.usage?.outputTokens),
    input_chars: nn(rec.usage?.inputChars),
    cost_usd: Number.isFinite(rec.costUsd) && rec.costUsd >= 0 ? rec.costUsd : 0,
    article_id: ctx.articleId || null,
    message: rec.ok ? null : redact(rec.message || "", 300) || null,
  };
}

/** Buffering recorder. `record()` is sync; `flush()` does one batched insert and never throws. */
export function createUsageRecorder(db, ctx) {
  const buffer = [];
  let warned = false;
  return {
    record(rec) { buffer.push(toRow(rec, ctx)); },
    /** For non-router providers (e.g. DeepL), which report characters rather than tokens. */
    recordDirect(rec, price) {
      buffer.push(toRow({ ...rec, costUsd: rec.costUsd ?? estimateCostUsd(rec.usage, price) }, ctx));
    },
    get pending() { return buffer.length; },
    async flush() {
      if (!buffer.length) return 0;
      const rows = buffer.splice(0, buffer.length);
      try {
        const { error } = await db.from("ai_usage_log").insert(rows);
        if (error) { if (!warned) console.warn("ai_usage_log insert skipped:", String(error.message || error).slice(0, 160)); warned = true; return 0; }
        return rows.length;
      } catch (e) {
        if (!warned) console.warn("ai_usage_log insert failed:", String(e).slice(0, 160)); warned = true;
        return 0;
      }
    },
  };
}
