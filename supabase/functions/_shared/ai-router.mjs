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
  const quotaText = /quota|exhaust|insufficient|credit|per.?day|daily|billing|free-models-per-day/.test(text);
  if (status === 402 || status === 456) return ERROR_KINDS.QUOTA;
  if (status === 429) return quotaText ? ERROR_KINDS.QUOTA : ERROR_KINDS.RATE_LIMIT;
  if (status === 401 || status === 403) return ERROR_KINDS.AUTH;
  if (status === 408 || status === 425 || status === 529 || (status >= 500 && status <= 599)) return ERROR_KINDS.TRANSIENT;
  if (!status) return ERROR_KINDS.TRANSIENT; // network error / timeout
  return ERROR_KINDS.FATAL;
}

/** Best-effort HTTP status from an error message such as "Groq API 429: ..." (adapters throw strings). */
export function statusFromError(error) {
  const direct = Number(error?.status);
  if (Number.isInteger(direct) && direct >= 100 && direct < 600) return direct;
  const m = String(error?.message ?? error ?? "").match(/\b(?:API|HTTP|status)\s*(\d{3})\b/i) || String(error?.message ?? error ?? "").match(/\b(4\d\d|5\d\d)\b/);
  return m ? Number(m[1]) : 0;
}

/** Parse a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.min(24 * 3600e3, Math.max(0, Math.round(n * 1000)));
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? Math.min(24 * 3600e3, Math.max(0, t - now)) : null;
}

/** Exponential backoff with full jitter, bounded; a Retry-After value wins. */
export function backoffMs(attempt, { baseMs = 500, capMs = 8000, retryAfterMs = null, random = Math.random } = {}) {
  if (retryAfterMs !== null && retryAfterMs !== undefined) return Math.min(retryAfterMs, 30000);
  return Math.floor(random() * Math.min(capMs, baseMs * 2 ** attempt));
}

/**
 * Extract the first parseable JSON object from model text. Ported from the
 * production translate-articles parser: strips <think> blocks, fences and chat
 * tokens, scans balanced braces respecting strings, escapes raw control
 * characters inside strings and drops trailing commas.
 */
export function extractJson(raw) {
  const cleaned = String(raw ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "")
    .replace(/<\|[^|]*\|>/g, "").trim();
  const candidates = [];
  let depth = 0, inString = false, escaped = false, start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true;
    else if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}" && depth > 0) { depth--; if (depth === 0 && start >= 0) { candidates.push(cleaned.slice(start, i + 1)); start = -1; } }
  }
  for (const candidate of candidates) {
    let safe = "", inside = false, esc = false;
    for (const ch of candidate) {
      if (inside) {
        if (esc) { safe += ch; esc = false; continue; }
        if (ch === "\\") { safe += ch; esc = true; continue; }
        if (ch === '"') { safe += ch; inside = false; continue; }
        const code = ch.charCodeAt(0);
        if (code < 32) { safe += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : " "; continue; }
        safe += ch;
      } else {
        if (ch === '"') inside = true;
        // drop a trailing comma only outside strings
        if ((ch === "}" || ch === "]") && /,\s*$/.test(safe)) safe = safe.replace(/,\s*$/, "");
        safe += ch;
      }
    }
    try { const v = JSON.parse(safe); if (v && typeof v === "object" && !Array.isArray(v)) return v; } catch { /* next */ }
  }
  return null;
}

/** Remove bearer tokens / key-like strings from text before it is stored or logged. */
export function redact(text, max = 240) {
  return String(text ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(sk|gsk|gnk|nvapi|AIza|key)[-_A-Za-z0-9]{16,}/g, "[redacted]")
    .replace(/(api[_-]?key|token|secret)(["'=:\s]+)[A-Za-z0-9._~+\/=-]{8,}/gi, "$1$2[redacted]")
    .slice(0, max);
}

/** Per-provider circuit breaker: consecutive failures open it; hard failures open it at once. */
export class CircuitBreaker {
  constructor({ threshold = 3, cooldownMs = 60000, quotaCooldownMs = 3600000, now = () => Date.now() } = {}) {
    Object.assign(this, { threshold, cooldownMs, quotaCooldownMs, now });
    this.state = new Map();
  }
  isOpen(name) { const s = this.state.get(name); return !!s && s.openUntil > this.now(); }
  /** Seed/force an open circuit (e.g. from persisted cooldown rows). */
  open(name, ms) { const s = this.state.get(name) || { failures: 0, openUntil: 0 }; s.openUntil = this.now() + ms; this.state.set(name, s); }
  success(name) { this.state.delete(name); }
  /** Returns the cooldown applied in ms (0 when the circuit stays closed). */
  failure(name, kind, retryAfterMs = null) {
    const s = this.state.get(name) || { failures: 0, openUntil: 0 };
    s.failures += 1;
    const hard = kind === ERROR_KINDS.QUOTA || kind === ERROR_KINDS.AUTH;
    let applied = 0;
    if (hard || s.failures >= this.threshold || (retryAfterMs && kind === ERROR_KINDS.RATE_LIMIT)) {
      applied = retryAfterMs ?? (hard ? this.quotaCooldownMs : this.cooldownMs);
      s.openUntil = this.now() + applied;
    }
    this.state.set(name, s);
    return applied;
  }
}

/** Order providers for a task: capability match first, then declared priority (stable). */
export function orderProviders(providers, task, breaker) {
  return providers
    .map((p, i) => [p, i])
    .filter(([p]) => !p.tasks || p.tasks.includes(task))
    .filter(([p]) => !(breaker && breaker.isOpen(p.name)))
    .sort((a, b) => ((a[0].priority ?? 100) - (b[0].priority ?? 100)) || a[1] - b[1])
    .map(([p]) => p);
}

/** Estimate USD cost from token counts and per-million prices. */
export function estimateCostUsd(usage = {}, price = {}) {
  const i = Number(usage?.inputTokens) || 0, o = Number(usage?.outputTokens) || 0;
  return +((i * (price?.inputPerM || 0) + o * (price?.outputPerM || 0)) / 1e6).toFixed(6);
}

/**
 * Run `task` across providers with retry/fallback.
 *   call(provider, request) -> { ok, status, text?, json?, error?, retryAfter?, usage? }
 *   cooldownFor(provider, kind, errorText) -> ms|null  (optional provider-specific override)
 *   onCooldown(provider, ms, kind, reason)  persists a cooldown (optional)
 *   onUsage(record)  receives secret-free attempt records (errors are swallowed)
 *   deadlineMs  total wall-clock budget; no retry sleep may exceed it
 * Returns { ok, provider, result, attempts[] }.
 */
/** @param {any} opts */
export async function runWithFallback(opts) {
  const { providers, task, request, call, breaker = new CircuitBreaker(),
    maxRetries = 2, sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)), validate = (/** @type {any} */ v) => !!v,
    onUsage = (/** @type {any} */ _r) => {}, onCooldown = (/** @type {any[]} */ ..._a) => {}, cooldownFor = null, deadlineMs = Infinity,
    now = () => Date.now(), random = Math.random } = opts;
  /** @type {any[]} */
  const attempts = [];
  const t0 = now();
  const emit = (rec) => { attempts.push(rec); try { onUsage(rec); } catch { /* telemetry must never break routing */ } };
  for (const provider of orderProviders(providers, task, breaker)) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (now() - t0 >= deadlineMs) return { ok: false, provider: null, result: null, attempts, deadline_exceeded: true };
      const started = now();
      let res;
      try { res = await call(provider, request); }
      catch (e) { res = { ok: false, status: statusFromError(e), error: String(e?.message ?? e) }; }
      res = res || { ok: false, status: 0 };
      let kind, value = null;
      if (res.ok) {
        value = res.json ?? extractJson(res.text);
        let valid = false;
        try { valid = !!validate(value); } catch { valid = false; }
        if (valid) {
          breaker.success(provider.name);
          emit({ provider: provider.name, task, ok: true, ms: now() - started, usage: res.usage || null,
            costUsd: estimateCostUsd(res.usage, provider.price) });
          return { ok: true, provider: provider.name, result: value, attempts };
        }
        kind = ERROR_KINDS.INVALID_OUTPUT;
      } else kind = classifyError(res.status, res.error || res.text);
      const retryAfterMs = parseRetryAfter(res.retryAfter);
      emit({ provider: provider.name, task, ok: false, kind, status: res.status ?? 0, ms: now() - started,
        message: redact(res.error || "", 200) });
      const custom = cooldownFor ? cooldownFor(provider, kind, String(res.error || "")) : null;
      let applied = breaker.failure(provider.name, kind, custom ?? (kind === ERROR_KINDS.RATE_LIMIT ? retryAfterMs : null));
      if (custom && !applied) { breaker.open(provider.name, custom); applied = custom; }
      if (applied) { try { await onCooldown(provider.name, applied, kind, redact(res.error || "", 240)); } catch { /* ignore */ } }
      const retryable = kind === ERROR_KINDS.TRANSIENT || kind === ERROR_KINDS.RATE_LIMIT;
      if (!retryable || attempt === maxRetries || breaker.isOpen(provider.name)) break;
      const wait = backoffMs(attempt, { retryAfterMs, random });
      if (now() - t0 + wait >= deadlineMs) break;
      await sleep(wait);
    }
  }
  return { ok: false, provider: null, result: null, attempts };
}
