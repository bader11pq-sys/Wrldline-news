import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSource } from "../supabase/functions/source-freshness/evaluate.mjs";
import { diagnose, summarize, CATEGORIES as C } from "../supabase/functions/source-freshness/diagnose.mjs";
import { classifyProbe } from "../scripts/source-reachability-probe.mjs";

const now = new Date("2026-11-25T12:00:00Z");
const base = { source_key: "rss:x", expected_cadence_seconds: 900, attempt_grace_multiplier: 2, max_published_age_seconds: 172800, max_received_age_seconds: 86400,
  created_at: "2026-01-01T00:00:00Z" };
const ago = (h) => new Date(now.getTime() - h * 3600e3).toISOString();

test("paused ingestion: overdue/stale sources are expected, not defects", () => {
  const m = evaluateSource({ ...base, last_attempt_at: ago(72), last_success_at: ago(72), last_result: "success", last_published_at: ago(80), last_received_at: ago(80) }, now);
  assert.equal(m.status, "stale");
  assert.equal(diagnose(m, { ingestionPaused: true }).category, C.PAUSED_EXPECTED);
  assert.equal(diagnose(m, { ingestionPaused: false }).category, C.STALE_SOURCE);
});
test("recorded errors remain real defects even while paused", () => {
  const never = evaluateSource({ ...base, last_attempt_at: ago(5), last_result: "error" }, now);
  assert.equal(diagnose(never).category, C.NEVER_SUCCEEDED);
  assert.equal(diagnose(never).severity, 4);
  const failed = evaluateSource({ ...base, last_attempt_at: ago(5), last_success_at: ago(30), last_result: "error", last_published_at: ago(40), last_received_at: ago(40) }, now);
  assert.equal(diagnose(failed).category, C.LAST_ATTEMPT_FAILED);
});
test("future timestamps stay actionable even while paused", () => {
  const m = evaluateSource({ ...base, last_attempt_at: ago(-5), last_success_at: ago(1), last_result: "success", last_published_at: ago(-9), last_received_at: ago(1) }, now);
  assert.equal(diagnose(m).category, C.STALE_SOURCE);
});
test("healthy, quiet, misconfigured, never polled", () => {
  const ok = evaluateSource({ ...base, last_attempt_at: ago(0.1), last_success_at: ago(0.1), last_result: "success", last_poll_had_new_news: true, last_published_at: ago(1), last_received_at: ago(1) }, now);
  assert.equal(diagnose(ok).category, C.HEALTHY);
  const quiet = evaluateSource({ ...base, last_attempt_at: ago(0.1), last_success_at: ago(0.1), last_result: "success", last_poll_had_new_news: false, last_published_at: ago(1), last_received_at: ago(1) }, now);
  assert.equal(diagnose(quiet).category, C.QUIET);
  assert.equal(diagnose(evaluateSource({ ...base, expected_cadence_seconds: null, last_attempt_at: ago(0.1), last_result: "success", last_published_at: ago(1), last_received_at: ago(1) }, now)).category, C.MISCONFIGURED);
  assert.equal(diagnose(evaluateSource({ ...base }, now)).category, C.NEVER_POLLED);
});
test("summary separates defects from expected pause effects", () => {
  const ds = [C.PAUSED_EXPECTED, C.PAUSED_EXPECTED, C.NEVER_SUCCEEDED, C.STALE_SOURCE, C.HEALTHY].map((category) => ({ category }));
  const s = summarize(ds);
  assert.deepEqual([s.true_defects, s.expected_from_pause, s.counts.healthy], [2, 2, 1]);
});
test("probe classification", () => {
  assert.equal(classifyProbe({ status: 200, head: "<?xml?><rss version='2'><channel>" }), "ok");
  assert.equal(classifyProbe({ status: 200, head: "<!doctype html><html>" }), "html_not_feed");
  assert.equal(classifyProbe({ status: 404 }), "gone");
  assert.equal(classifyProbe({ status: 403 }), "blocked_or_auth");
  assert.equal(classifyProbe({ status: 502 }), "server_error");
  assert.equal(classifyProbe({ error: "getaddrinfo ENOTFOUND x" }), "dns_failure");
  assert.equal(classifyProbe({ error: "The operation was aborted due to timeout" }), "timeout");
  assert.equal(classifyProbe({ status: 200, head: "<rss><channel>", finalHost: "b.com", host: "a.com" }), "ok_redirected_host");
});
