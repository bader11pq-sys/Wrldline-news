// Pure function shared by Edge runtime, CLI, and isolated Node fixtures.
export function evaluateSource(source, now = new Date()) {
  const time = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(time)) throw new TypeError("Invalid evaluation time");
  const age = (value) => {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? (time - parsed) / 1000 : null;
  };
  const flags = [];
  const expected = Number(source.expected_cadence_seconds);
  const configured = Number.isFinite(expected) && expected >= 60;
  const attempt = age(source.last_attempt_at);
  const published = age(source.last_published_at);
  const received = age(source.last_received_at);
  const created = age(source.created_at);
  const grace = Number(source.initialization_grace_seconds ?? 3600);
  const initializing = created !== null && created >= -300 && created <= grace && !source.last_attempt_at;
  const noNewNews = source.last_result === "success" && source.last_poll_had_new_news === false;

  if (!configured) flags.push("cadence_not_configured");
  if (attempt === null) flags.push("attempt_not_initialized");
  else if (configured && attempt > expected * Number(source.attempt_grace_multiplier ?? 2)) flags.push("attempt_overdue");
  if (source.last_result === "error") flags.push("last_attempt_error");
  if (noNewNews) flags.push("no_new_news");

  // A successful empty urgent-news window is not a stale publisher.
  if (!noNewNews) {
    if (published === null) flags.push("published_not_initialized");
    else if (published > Number(source.max_published_age_seconds)) flags.push("published_stale");
    if (received === null) flags.push("received_not_initialized");
    else if (received > Number(source.max_received_age_seconds)) flags.push("received_stale");
  }
  if ([attempt, published, received, created].some((value) => value !== null && value < -300)) flags.push("future_timestamp");
  if (initializing) flags.push("initialization_grace");

  const stale = flags.some((flag) => ["attempt_overdue", "published_stale", "received_stale", "future_timestamp"].includes(flag));
  const status = source.last_result === "error" ? "error"
    : stale ? "stale"
    : !configured ? "configuration_required"
    : attempt === null ? "not_initialized"
    : noNewNews ? "no_new_news"
    : [published, received].some((value) => value === null) ? "not_initialized"
    : "healthy";
  const actionable = status === "error" || status === "stale"
    || (!initializing && ["not_initialized", "configuration_required"].includes(status));

  return {
    source_key: source.source_key, checked_at: new Date(time).toISOString(), status, flags,
    last_attempt_at: source.last_attempt_at ?? null, last_success_at: source.last_success_at ?? null,
    last_published_at: source.last_published_at ?? null, last_received_at: source.last_received_at ?? null,
    expected_cadence_seconds: configured ? expected : null, actionable,
  };
}
