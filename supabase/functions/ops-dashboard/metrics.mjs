export function normalizeClassificationStats(value) {
  const source = Array.isArray(value) ? value[0] : value;
  if (!source || typeof source !== "object") return null;

  const numericKeys = [
    "pending",
    "processing",
    "failed",
    "expired",
    "classified",
    "needs_review",
    "skipped",
    "oldest_pending_age_minutes"
  ];
  const normalized = {};
  for (const key of numericKeys) {
    const raw = source[key];
    if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
      normalized[key] = null;
      continue;
    }
    const number = typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.trim())
        : Number.NaN;
    normalized[key] = Number.isFinite(number) ? number : null;
  }
  normalized.oldest_pending_at =
    typeof source.oldest_pending_at === "string"
      ? source.oldest_pending_at
      : null;

  return normalized;
}

export function summarizeRuns(rows = []) {
  const pipelines = {};
  for (const run of rows) {
    const key = run.pipeline || "unknown";
    const current = pipelines[key] || {
      runs: 0,
      failed: 0,
      parsed: 0,
      latest_at: run.started_at || null
    };
    current.runs += 1;
    current.failed += Number(run.failed_sources || 0);
    current.parsed += Number(run.parsed_items || 0);
    if (
      run.started_at &&
      (!current.latest_at || run.started_at > current.latest_at)
    ) {
      current.latest_at = run.started_at;
    }
    pipelines[key] = current;
  }

  // Translation is a separate pipeline and must not make ingestion look healthy.
  const ingestionRows = rows.filter((run) =>
    /general|breaking|ingest|feed|newsdata/i.test(String(run.pipeline || ""))
  );
  const ordered = [...ingestionRows].sort((a, b) =>
    String(b.finished_at || b.started_at || "").localeCompare(
      String(a.finished_at || a.started_at || "")
    )
  );
  const latestSuccess = ordered.find((run) =>
    run.finished_at &&
    Number(run.successful_sources || 0) > 0 &&
    Number(run.failed_sources || 0) === 0 &&
    !run.error_summary
  );
  const latestFailure = ordered.find((run) =>
    run.finished_at &&
    (
      Number(run.failed_sources || 0) > 0 ||
      Boolean(run.error_summary)
    )
  );

  return {
    pipelines,
    last_success_at: latestSuccess?.finished_at || null,
    last_failure_at: latestFailure?.finished_at || null
  };
}

export function mergeProviderStates(aiRows = [], translationRows = [], now = Date.now()) {
  const providers = new Map();

  for (const [source, rows] of [
    ["classification", aiRows],
    ["translation", translationRows]
  ]) {
    for (const row of rows || []) {
      const name = String(row.provider || "unknown");
      const existing = providers.get(name) || {
        provider: name,
        disabled_until: null,
        reasons: [],
        sources: [],
        updated_at: null
      };

      if (
        row.disabled_until &&
        (!existing.disabled_until || row.disabled_until > existing.disabled_until)
      ) {
        existing.disabled_until = row.disabled_until;
      }
      if (row.reason && !existing.reasons.includes(row.reason)) {
        existing.reasons.push(row.reason);
      }
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (!existing.updated_at || String(row.updated_at || "") > existing.updated_at) {
        existing.updated_at = row.updated_at || null;
      }
      providers.set(name, existing);
    }
  }

  return [...providers.values()]
    .map((provider) => ({
      ...provider,
      disabled_now: Boolean(
        provider.disabled_until &&
        new Date(provider.disabled_until).getTime() > now
      )
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}
