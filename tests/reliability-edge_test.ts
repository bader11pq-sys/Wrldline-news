import { createHandler } from '../supabase/functions/source-freshness/handler.ts';
function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const source = { source_key: 'rss:https://example.test/rss', expected_cadence_seconds: 900, attempt_grace_multiplier: 2,
  max_published_age_seconds: 3600, max_received_age_seconds: 3600, created_at: '2026-11-14T00:00:00Z',
  last_attempt_at: '2026-11-14T23:59:00Z', last_success_at: '2026-11-14T23:59:00Z', last_result: 'success',
  last_poll_had_new_news: false, last_published_at: '2026-11-14T23:58:00Z', last_received_at: '2026-11-14T23:58:00Z' };
function fixture(role = '', cron = false) {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'fixture-user', app_metadata: { role } });
    if (url.endsWith('verify_wrldline_cron_secret')) return Response.json(cron);
    if (url.endsWith('get_source_freshness_snapshot')) return Response.json([source]);
    if (url.includes('source_freshness_metrics')) {
      assert(new Headers(init?.headers).get('Prefer')?.includes('resolution=merge-duplicates'));
      const rows = JSON.parse(String(init?.body)); assert(rows[0].status === 'no_new_news');
      assert(!('actionable' in rows[0])); return new Response(null, { status: 204 });
    }
    throw new Error('Unexpected network operation');
  };
  return { calls, handler: createHandler({ url: 'https://fixture.test', serviceKey: 'fixture-server-key', fetch: fetcher, now: () => new Date('2026-11-15T00:00:00Z') }) };
}
Deno.test('anonymous endpoint access neither reads nor writes metrics', async () => {
  const { handler, calls } = fixture(); const result = await handler(new Request('https://fixture.test', { method: 'POST' }));
  assert(result.status === 401); assert(calls.length === 0);
});
Deno.test('untrusted caller role and invalid cron never authorize', async () => {
  const { handler, calls } = fixture('editor');
  const result = await handler(new Request('https://fixture.test', { method: 'POST', headers: { Authorization: 'Bearer fixture', 'x-wrldline-cron-secret': 'wrong' }, body: '{"role":"admin"}' }));
  assert(result.status === 401); assert(!calls.some((call) => call.includes('snapshot')));
});
for (const mode of ['cron','admin']) Deno.test(`${mode} authentication allows only snapshot and operational metrics`, async () => {
  const { handler, calls } = fixture(mode === 'admin' ? 'admin' : '', mode === 'cron');
  const result = await handler(new Request('https://fixture.test', { method: 'POST', headers: mode === 'cron' ? { 'x-wrldline-cron-secret': 'fixture-secret' } : { Authorization: 'Bearer fixture' } }));
  assert(result.status === 200); const body = await result.json(); assert(body.checked_sources === 1);
  assert(body.alert_delivery === 'not_configured'); assert(!JSON.stringify(body).includes('example.test'));
  assert(!calls.some((call) => call.includes('/articles')));
});
Deno.test('only POST accepted', async () => { const { handler, calls } = fixture(); assert((await handler(new Request('https://fixture.test'))).status === 405); assert(calls.length === 0); });

Deno.test('all source pages are checked and metrics are batched without outbound calls', async () => {
  const offsets: number[] = []; const sizes: number[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('verify_wrldline_cron_secret')) return Response.json(true);
    if (url.endsWith('get_source_freshness_snapshot')) {
      const { p_offset, p_limit } = JSON.parse(String(init?.body)); offsets.push(p_offset); assert(p_limit === 500);
      return Response.json(p_offset === 0 ? Array.from({length:500},(_,index)=>({...source,source_key:'rss:fixture-'+index})) : [{...source,source_key:'rss:last'}]);
    }
    if (url.includes('source_freshness_metrics')) { sizes.push(JSON.parse(String(init?.body)).length); return new Response(null,{status:204}); }
    throw new Error('Unexpected outbound call');
  };
  const handler = createHandler({url:'https://fixture.test',serviceKey:'fixture',fetch:fetcher,now:()=>new Date('2026-11-15T00:00:00Z')});
  const response = await handler(new Request('https://fixture.test',{method:'POST',headers:{'x-wrldline-cron-secret':'fixture'}}));
  assert(response.status === 200); assert((await response.json()).checked_sources === 501);
  assert(JSON.stringify(offsets) === '[0,500]'); assert(JSON.stringify(sizes) === '[250,250,1]');
});
Deno.test('failed persistence returns generic no-store failure, never private excerpts', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('verify_wrldline_cron_secret')) return Response.json(true);
    if (url.endsWith('get_source_freshness_snapshot')) return Response.json([source]);
    return Response.json({error:'fixture-private-secret'}, {status:500});
  };
  const handler = createHandler({url:'https://fixture.test',serviceKey:'fixture',fetch:fetcher,now:()=>new Date('2026-11-15T00:00:00Z')});
  const response = await handler(new Request('https://fixture.test',{method:'POST',headers:{'x-wrldline-cron-secret':'fixture'}}));
  assert(response.status === 503); assert(response.headers.get('Cache-Control') === 'no-store');
  assert(!(await response.text()).includes('private-secret'));
});
