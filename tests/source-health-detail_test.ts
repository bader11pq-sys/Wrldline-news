import { createHandler } from '../supabase/functions/source-freshness/handler.ts';
function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const row = (key: string, extra: Record<string, unknown> = {}) => ({ source_key: key, source_name: 'Secret Publisher ' + key, source_kind: 'rss', expected_cadence_seconds: 900,
  attempt_grace_multiplier: 2, max_published_age_seconds: 3600, max_received_age_seconds: 3600, created_at: '2026-01-01T00:00:00Z', ...extra });
const rows = [
  row('rss:err', { last_attempt_at: '2026-11-24T23:59:00Z', last_result: 'error' }),
  row('rss:old', { last_attempt_at: '2026-11-20T00:00:00Z', last_success_at: '2026-11-20T00:00:00Z', last_result: 'success', last_published_at: '2026-11-20T00:00:00Z', last_received_at: '2026-11-20T00:00:00Z' }),
];
function make(role: string, cron: boolean, paused = true) {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'u', app_metadata: { role } });
    if (url.endsWith('verify_wrldline_cron_secret')) return Response.json(cron);
    if (url.endsWith('get_source_freshness_snapshot')) return Response.json(rows);
    if (url.includes('source_freshness_metrics')) return new Response(null, { status: 204 });
    throw new Error('unexpected ' + url);
  };
  return createHandler({ url: 'https://fx.test', serviceKey: 'k', fetch: fetcher, now: () => new Date('2026-11-25T00:00:00Z'), ingestionPaused: paused });
}
const post = (headers: Record<string, string>, body = '{}') => new Request('https://fx.test', { method: 'POST', headers, body });

Deno.test('default response carries diagnosis counts but no source names', async () => {
  const body = await (await make('admin', false)(post({ Authorization: 'Bearer t' }))).json();
  assert(body.ingestion_paused === true && body.diagnosis.expected_from_pause === 1 && body.diagnosis.counts.never_succeeded === 1, JSON.stringify(body));
  assert(!JSON.stringify(body).includes('Secret Publisher') && body.detail === undefined);
});
Deno.test('admin session may request per-source detail', async () => {
  const body = await (await make('admin', false)(post({ Authorization: 'Bearer t' }, '{"detail":true}'))).json();
  assert(body.detail.length === 1 && body.detail[0].category === 'never_succeeded' && body.detail[0].name.includes('Secret Publisher'));
});
Deno.test('cron and editor callers never receive names even if they ask', async () => {
  const cron = await (await make('', true)(post({ 'x-wrldline-cron-secret': 's' }, '{"detail":true}'))).json();
  assert(cron.ok && cron.detail === undefined && !JSON.stringify(cron).includes('Secret Publisher'));
  const editor = await make('editor', false)(post({ Authorization: 'Bearer t' }, '{"detail":true}'));
  assert(editor.status === 401);
});
Deno.test('when ingestion is not paused, stale sources count as defects', async () => {
  const body = await (await make('admin', false, false)(post({ Authorization: 'Bearer t' }))).json();
  assert(body.diagnosis.counts.stale_source === 1 && body.diagnosis.expected_from_pause === 0);
});
