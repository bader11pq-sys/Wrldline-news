import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeProviderStates,
  normalizeClassificationStats,
  summarizeRuns
} from "../supabase/functions/ops-dashboard/metrics.mjs";

test("normalizes live classification queue statistics without inventing zeros", () => {
  const stats = normalizeClassificationStats({
    pending: "8756",
    processing: 0,
    failed: 45,
    expired: 51427,
    classified: 2105,
    needs_review: 21,
    oldest_pending_age_minutes: "5038672",
    oldest_pending_at: "2017-04-20T12:24:43Z"
  });
  assert.equal(stats.pending, 8756);
  assert.equal(stats.processing, 0);
  assert.equal(stats.oldest_pending_age_minutes, 5038672);
  assert.equal(stats.oldest_pending_at, "2017-04-20T12:24:43Z");
  assert.equal(normalizeClassificationStats(null), null);
});

test("preserves unavailable numeric metrics as null, not zero", () => {
  const stats = normalizeClassificationStats({
    pending: null,
    processing: undefined,
    failed: "",
    expired: "   ",
    classified: "not-a-number",
    needs_review: 0,
    skipped: "0",
    oldest_pending_age_minutes: null,
    oldest_pending_at: null
  });
  assert.equal(stats.pending, null);
  assert.equal(stats.processing, null);
  assert.equal(stats.failed, null);
  assert.equal(stats.expired, null);
  assert.equal(stats.classified, null);
  assert.equal(stats.needs_review, 0);
  assert.equal(stats.skipped, 0);
  assert.equal(stats.oldest_pending_age_minutes, null);
  assert.equal(stats.oldest_pending_at, null);
});

test("summarizes ingestion successes and failures independently", () => {
  const summary = summarizeRuns([
    { pipeline: "general", started_at: "2026-11-18T10:00:00Z", finished_at: "2026-11-18T10:01:00Z", source_count: 5, successful_sources: 5, failed_sources: 0, parsed_items: 12 },
    { pipeline: "general", started_at: "2026-11-18T10:02:00Z", finished_at: "2026-11-18T10:03:00Z", source_count: 5, successful_sources: 3, failed_sources: 2, parsed_items: 4, error_summary: "2 feeds failed" },
    { pipeline: "breaking", started_at: "2026-11-18T10:04:00Z", finished_at: null, source_count: 0, successful_sources: 0, failed_sources: 0, parsed_items: 0 },
    { pipeline: "translation", started_at: "2026-11-18T10:19:00Z", finished_at: "2026-11-18T10:20:00Z", source_count: 2, successful_sources: 2, failed_sources: 0, parsed_items: 2 }
  ]);
  assert.equal(summary.pipelines.general.runs, 2);
  assert.equal(summary.pipelines.general.failed, 2);
  assert.equal(summary.pipelines.general.parsed, 16);
  assert.equal(summary.last_success_at, "2026-11-18T10:01:00Z");
  assert.equal(summary.last_failure_at, "2026-11-18T10:03:00Z");
  assert.notEqual(summary.last_success_at, "2026-11-18T10:20:00Z");
  assert.equal(summarizeRuns([{ pipeline: "translation", started_at: "2026-11-18T10:19:00Z", finished_at: "2026-11-18T10:20:00Z", successful_sources: 2, failed_sources: 0 }]).last_success_at, null);
});

test("merges provider state and identifies active cooldowns", () => {
  const providers = mergeProviderStates(
    [{ provider: "groq", disabled_until: "2026-11-18T12:00:00Z", reason: "429", updated_at: "2026-11-18T11:00:00Z" }],
    [{ provider: "deepl", disabled_until: "2026-11-18T14:00:00Z", reason: "quota", updated_at: "2026-11-18T13:00:00Z" }],
    Date.parse("2026-11-18T13:30:00Z")
  );
  assert.equal(providers.find((x) => x.provider === "groq").disabled_now, false);
  assert.equal(providers.find((x) => x.provider === "deepl").disabled_now, true);
  assert.deepEqual(providers.find((x) => x.provider === "deepl").sources, ["translation"]);
});
