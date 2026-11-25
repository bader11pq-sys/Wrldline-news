// Dependency-free AI provider router: error classification, Retry-After aware
// backoff, per-provider circuit breaker, task-aware ordering and usage/cost
// accounting. It never reads, logs or returns API keys: callers inject
// `call(provider, request)` closures that hold credentials themselves.
// NOTE: not yet wired into production functions (see docs/audit/BACKLOG.md).

export const ERROR_KINDS = Object.freeze({
  RATE_LIMIT: "rate_limit", QUOTA: "quota", AUTH: "auth",
  INVALID_OUTPUT: "invalid_output", TRANSIENT: "transient", FATAL: "fatal",
});

/** Classify an HTTP status / body into a retry policy. */
export function classifyError(status, body = "") {
  const text = String(body || "").toLowerCase();
  if (status === 401 || status === 403) return ERROR_KINDS.AUTH;
  if (status === 402 || /quota|exhaust|insufficient|credit|daily|billing/.test(text)) {
    if (status === 429 || status === 402 || status === 403) return ERROR_KINDS.QUOTA;
  }
  if (status === 429) return ERROR_KINDS.RATE_LIMIT;
  if (status === 408 || status === 425 || (status >= 500 && status <= 599)) return ERROR_KINDS.TRANSIENT;
  if (status === 0 || status === undefined || status === null) return ERROR_KINDS.TRANSIENT;
  return ERROR_KINDS.FATAL;
}

/** Parse a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, Math.round(n * 1000));
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? Math.max(0, t - now) : null;
}

/** Exponential backoff with full jitter, bounded; a Retry-After value wins. */
export function backoffMs(attempt, { baseMs = 500, capMs = 8000, retryAfterMs = null, random = Math.random } = {}) {
  if (retryAfterMs !== null && retryAfterMs !== undefined) return Math.min(retryAfterMs, 30000);
  return Math.floor(random() * Math.min(capMs, baseMs * 2 ** attempt));
}

/** Extract a JSON object from model text, tolerating fences and prose. */
export function extractJson(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  for (const candidate of [cleaned, cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1)]) {
    if (!candidate) continue;
    try { const v = JSON.parse(candidate); if (v && typeof v === "object") return v; } catch { /* next */ }
  }
  return null;
}

/** Per-provider circuit breaker: open after N failures, cool down by kind. */
export class CircuitBreaker {
  constructor({ threshold = 3, cooldownMs = 60000, quotaCooldownMs = 3600000, now = () => Date.now() } = {}) {
    Object.assign(this, { threshold, cooldownMs, quotaCooldownMs, now });
    this.state = new Map();
  }
  isOpen(name) { const s = this.state.get(name); return !!s && s.openUntil > this.now(); }
  success(name) { this.state.delete(name); }
  failure(name, kind, retryAfterMs = null) {
    const s = this.state.get(name) || { failures: 0, openUntil: 0 };
    s.failures += 1;
    const hard = kind === ERROR_KINDS.QUOTA || kind === ERROR_KINDS.AUTH;
    if (hard || s.failures >= this.threshold) {
      const wait = retryAfterMs ?? (hard ? this.quotaCooldownMs : this.cooldownMs);
      s.openUntil = this.now() + wait;
    }
    this.state.set(name, s);
  }
}

/** Order providers for a task: capability match first, then declared priority. */
export function orderProviders(providers, task, breaker) {
  return providers
    .filter((p) => !p.tasks || p.tasks.includes(task))
    .filter((p) => !(breaker && breaker.isOpen(p.name)))
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/** Estimate USD cost from token counts and per-million prices. */
export function estimateCostUsd(usage = {}, price = {}) {
  const i = Number(usage.inputTokens) || 0, o = Number(usage.outputTokens) || 0;
  return +((i * (price.inputPerM || 0) + o * (price.outputPerM || 0)) / 1e6).toFixed(6);
}

/**
 * Run `task` across providers with retry/fallback.
 * call(provider, request) -> { ok, status, text?, json?, retryAfter?, usage? }
 * Returns { ok, provider, result, attempts[] }; attempts hold no secrets.
 */
export async function runWithFallback({ providers, task, request, call, breaker = new CircuitBreaker(),
  maxRetries = 2, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), validate = (v) => !!v, onUsage = () => {}, random = Math.random }) {
  const attempts = [];
  for (const provider of orderProviders(providers, task, breaker)) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const started = Date.now();
      let res;
      try { res = await call(provider, request); }
      catch (e) { res = { ok: false, status: 0, error: e?.name || "Error" }; }
      let kind = null, value = null;
      if (res.ok) {
        value = res.json ?? extractJson(res.text);
        if (validate(value)) {
          breaker.success(provider.name);
          const rec = { provider: provider.name, task, ok: true, ms: Date.now() - started, usage: res.usage || null,
            costUsd: estimateCostUsd(res.usage, provider.price) };
          attempts.push(rec); onUsage(rec);
          return { ok: true, provider: provider.name, result: value, attempts };
        }
        kind = ERROR_KINDS.INVALID_OUTPUT;
      } else kind = classifyError(res.status, res.error || res.text);
      const retryAfterMs = parseRetryAfter(res.retryAfter);
      const rec = { provider: provider.name, task, ok: false, kind, status: res.status ?? 0, ms: Date.now() - started };
      attempts.push(rec); onUsage(rec);
      breaker.failure(provider.name, kind, kind === ERROR_KINDS.RATE_LIMIT ? retryAfterMs : null);
      const retryable = kind === ERROR_KINDS.TRANSIENT || kind === ERROR_KINDS.RATE_LIMIT;
      if (!retryable || attempt === maxRetries || breaker.isOpen(provider.name)) break;
      await sleep(backoffMs(attempt, { retryAfterMs, random }));
    }
  }
  return { ok: false, provider: null, result: null, attempts };
}
