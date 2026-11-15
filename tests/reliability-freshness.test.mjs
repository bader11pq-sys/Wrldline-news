import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSource } from '../supabase/functions/source-freshness/evaluate.mjs';
import { checkFreshness } from '../scripts/source-freshness-check.mjs';
const now = new Date('2026-11-15T00:00:00Z');
const ago = (seconds) => new Date(now.getTime() - seconds * 1000).toISOString();
const healthy = { source_key: 'rss:https://example.test/feed', created_at: ago(86400), expected_cadence_seconds: 900,
  attempt_grace_multiplier: 2, max_published_age_seconds: 3600, max_received_age_seconds: 1800,
  last_attempt_at: ago(60), last_success_at: ago(60), last_result: 'success', last_poll_had_new_news: true,
  last_published_at: ago(120), last_received_at: ago(90) };
test('per-feed clocks remain independent and healthy', () => {
  assert.equal(evaluateSource(healthy, now).status, 'healthy');
  assert.equal(evaluateSource({ ...healthy, source_key: 'rss:https://example.test/other', last_received_at: ago(4000) }, now).status, 'stale');
});
test('no new news on a successful poll is not an error', () => {
  const result = evaluateSource({ ...healthy, last_poll_had_new_news: false }, now);
  assert.equal(result.status, 'no_new_news'); assert.equal(result.actionable, false);
});
test('attempt/error/published/received signals are separate', () => {
  const result = evaluateSource({ ...healthy, last_attempt_at: ago(1900), last_result: 'error', last_published_at: ago(3700), last_received_at: ago(2000) }, now);
  assert.equal(result.status, 'error');
  for (const flag of ['attempt_overdue', 'last_attempt_error', 'published_stale', 'received_stale']) assert.ok(result.flags.includes(flag));
});
test('uninitialized sources get finite grace, never become healthy', () => {
  const empty = { ...healthy, last_attempt_at: null, last_result: null, last_published_at: null, last_received_at: null };
  assert.equal(evaluateSource(empty, now).actionable, true);
  assert.equal(evaluateSource({ ...empty, created_at: ago(5) }, now).actionable, false);
  assert.equal(evaluateSource({ ...empty, created_at: ago(5) }, now).status, 'not_initialized');
});
test('NewsData discovery does not establish expected cadence or attempts', () => {
  const result = evaluateSource({ ...healthy, source_key: 'newsdata:example', expected_cadence_seconds: null, last_attempt_at: null }, now);
  assert.equal(result.status, 'configuration_required'); assert.ok(result.flags.includes('attempt_not_initialized'));
});
test('future timestamps and invalid times are not silently healthy', () => {
  assert.ok(evaluateSource({ ...healthy, last_received_at: ago(-600) }, now).flags.includes('future_timestamp'));
  assert.throws(() => evaluateSource(healthy, 'invalid'), /Invalid/);
});
test('CLI requires explicit HTTPS credentials and propagates operational failure', async () => {
  await assert.rejects(checkFreshness({}), /SUPABASE_URL/);
  const env = { SUPABASE_URL: 'https://example.test', WRLDLINE_CRON_SECRET: 'fixture-secret', SUPABASE_PUBLISHABLE_KEY: 'fixture-public' };
  const result = await checkFreshness(env, async (url, init) => {
    assert.equal(url.pathname, '/functions/v1/source-freshness');
    assert.equal(init.headers['x-wrldline-cron-secret'], 'fixture-secret');
    return Response.json({ ok: true, checked_sources: 2, actionable_sources: 1, counts: { stale: 1, healthy: 1 }, alert_delivery: 'not_configured' });
  });
  assert.equal(result.ok, false);
  await assert.rejects(checkFreshness(env, async () => Response.json({error:'secret'}, {status:503})), /Protected freshness endpoint failed/);
});
