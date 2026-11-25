// Integration test: real classify-news handler, stubbed network. No real provider/database/key is contacted.
function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
type Call = { method: string; url: string; body: any };
const cls = { country: 'Egypt', country_code: 'EG', region: 'Africa', country_evidence: 'Cairo', country_confidence: 0.9, event_type: 'economy',
  risk_level: 'low', risk_score: 10, confidence: 0.9, summary: 'ملخص', reader_impact: 'أثر', watch_next: 'لا يوجد', location_name: null, latitude: null,
  longitude: null, is_exclusive: false, exclusive_type: 'none', exclusive_confidence: 0.1, exclusive_reason: 'لا قرينة', topic: 'economy',
  secondary_topics: [], geographic_scope: 'national', topic_confidence: 0.92, topic_reason: 'Central bank' };
const chat = (content: unknown, usage = { prompt_tokens: 300, completion_tokens: 120 }) =>
  Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage });

async function run(providers: Record<string, () => Response>) {
  const calls: Call[] = [];
  const captured: { h?: (r: Request) => Promise<Response> } = {};
  const realServe = Deno.serve, realFetch = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (h: any) => { captured.h = h; return { finished: Promise.resolve() }; };
  const env: Record<string, string> = { SUPABASE_URL: 'https://fixture.supabase.test', SUPABASE_ANON_KEY: 'anon-fixture',
    SUPABASE_SERVICE_ROLE_KEY: 'service-fixture', GROQ_API_KEY: 'groq-fixture-key', NVIDIA_API_KEY: 'nvidia-fixture-key', BAZAARLINK_API_KEY: 'bazaar-fixture-key' };
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
  const article = { id: '22222222-2222-4222-8222-222222222222', title: 'Central bank raises rates', summary: 'The bank raised rates by 25 basis points in Cairo.',
    source_name: 'Example', source_url: null, url: 'https://example.com/a', published_at: new Date().toISOString(), received_at: new Date().toISOString(),
    event_country: null, classification_claimed_at: null, classification_attempts: 0, ai_classification_status: 'pending', classification_reason: null };
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url ?? input), method = String(init?.method ?? input?.method ?? 'GET');
    let body: any = null; try { body = init?.body ? JSON.parse(init.body) : null; } catch { /* */ }
    calls.push({ method, url, body });
    if (url.includes('api.groq.com')) return providers.groq();
    if (url.includes('integrate.api.nvidia.com')) return providers.nvidia();
    if (url.includes('api.bazaarlink.ai')) return providers.bazaarlink();
    if (url.includes('/rest/v1/ai_provider_cooldowns')) return method === 'GET' ? Response.json([]) : new Response(null, { status: 201 });
    if (url.includes('/rest/v1/article_content_cache')) return Response.json([]);
    if (url.includes('/rest/v1/ai_usage_log')) return new Response(null, { status: 201 });
    if (url.includes('/rest/v1/articles')) return method === 'GET' ? Response.json([article]) : Response.json([{ id: article.id }]);
    throw new Error('Unexpected network operation: ' + method + ' ' + url);
  }) as typeof fetch;
  try {
    await import('../supabase/functions/classify-news/index.ts?scenario=' + crypto.randomUUID());
    assert(captured.h, 'handler registered');
    const res = await captured.h!(new Request('https://fixture.test', { method: 'POST', headers: { Authorization: 'Bearer service-fixture' },
      body: JSON.stringify({ article_ids: [article.id] }) }));
    return { res, body: await res.json(), calls };
  } finally { Deno.serve = realServe; globalThis.fetch = realFetch; for (const k of Object.keys(env)) Deno.env.delete(k); }
}

Deno.test('primary failure falls back to BazaarLink; cooldown persisted; usage rows are secret-free', async () => {
  const { body, calls } = await run({ groq: () => chat(cls), nvidia: () => new Response('unauthorized', { status: 401 }), bazaarlink: () => chat(cls) });
  const r = body.results[0];
  assert(r.status === 'classified' || r.status === 'needs_review', JSON.stringify(body));
  assert(String(r.provider).includes('groq') && String(r.provider).includes('bazaarlink'), 'provider mix: ' + r.provider);
  const cd = calls.find((c) => c.url.includes('/ai_provider_cooldowns') && c.method === 'POST')!;
  const row = Array.isArray(cd.body) ? cd.body[0] : cd.body;
  assert(row.provider === 'nvidia' && Date.parse(row.disabled_until) - Date.now() > 25 * 60e3, 'nvidia 30 minute auth cooldown');
  const usage = calls.find((c) => c.url.includes('/ai_usage_log'))!.body as any[];
  assert(usage.length === 3, 'groq ok + nvidia fail + bazaarlink ok, got ' + usage.length);
  const g = usage.find((u) => u.provider === 'groq'), n = usage.find((u) => u.provider === 'nvidia');
  assert(g.ok && g.input_tokens === 300 && g.output_tokens === 120 && g.function_name === 'classify-news' && g.task === 'classify');
  assert(!n.ok && n.error_kind === 'auth' && n.http_status === 401);
  assert(!JSON.stringify(usage).includes('fixture-key'));
});
Deno.test('every provider failing defers the article instead of inventing a classification', async () => {
  const fail = () => new Response('{"error":"daily quota exceeded"}', { status: 429 });
  const { body, calls } = await run({ groq: fail, nvidia: fail, bazaarlink: fail });
  assert(body.results[0].status === 'deferred', JSON.stringify(body));
  const usage = calls.find((c) => c.url.includes('/ai_usage_log'))!.body as any[];
  assert(usage.length === 3 && usage.every((u) => !u.ok));
});
