// Integration test: runs the real translate-articles Edge Function handler with a stubbed network.
// No real provider, database or key is contacted. Needs: --allow-env --allow-read (+ --allow-net=none)
function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }

type Call = { method: string; url: string; body: any };
async function run(providers: Record<string, (body: any) => Response>, usageStatus = 201) {
  const calls: Call[] = [];
  const captured: { h?: (r: Request) => Promise<Response> } = {};
  const realServe = Deno.serve, realFetch = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (h: any) => { captured.h = h; return { finished: Promise.resolve() }; };
  const env: Record<string, string> = { SUPABASE_URL: 'https://fixture.supabase.test', SUPABASE_ANON_KEY: 'anon-fixture',
    SUPABASE_SERVICE_ROLE_KEY: 'service-fixture', GEMINI_API_KEY: 'gem-fixture-key', GROQ_API_KEY: 'groq-fixture-key' };
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
  const article = { id: '11111111-1111-4111-8111-111111111111', title: 'Central bank raises rates', summary: 'The bank raised rates by 25 basis points.',
    ai_summary: '', lang: 'en', url: 'https://example.com/a', source_url: null, source_name: 'Example', published_at: new Date().toISOString(),
    received_at: new Date().toISOString(), translation_attempts: 0, translation_retry_after: null };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url ?? input), method = String(init?.method ?? input?.method ?? 'GET');
    let body: any = null; try { body = init?.body ? JSON.parse(init.body) : null; } catch { /* not json */ }
    calls.push({ method, url, body });
    if (url.includes('generativelanguage.googleapis.com')) return providers.gemini(body);
    if (url.includes('api.groq.com')) return providers.groq(body);
    if (url.includes('/rest/v1/ai_provider_cooldowns')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    if (url.includes('/rest/v1/translation_provider_state')) return json([]);
    if (url.includes('/rest/v1/articles')) return method === 'GET' ? json([article]) : new Response(null, { status: 204 });
    if (url.includes('/rest/v1/article_translations')) return method === 'GET' ? json([]) : json([{ id: 'tr-1' }], 201);
    if (url.includes('/rest/v1/ai_usage_log')) return usageStatus === 201 ? new Response(null, { status: 201 }) : json({ message: 'relation "public.ai_usage_log" does not exist' }, usageStatus);
    throw new Error('Unexpected network operation: ' + method + ' ' + url);
  }) as typeof fetch;
  try {
    await import('../supabase/functions/translate-articles/index.ts?scenario=' + crypto.randomUUID());
    assert(captured.h, 'handler registered');
    const res = await captured.h!(new Request('https://fixture.test', { method: 'POST', headers: { Authorization: 'Bearer service-fixture' },
      body: JSON.stringify({ article_ids: [article.id] }) }));
    return { res, body: await res.json(), calls };
  } finally { Deno.serve = realServe; globalThis.fetch = realFetch; for (const k of Object.keys(env)) Deno.env.delete(k); }
}
const groqOk = () => Response.json({ choices: [{ message: { content: '{"title":"رفع البنك المركزي الفائدة","summary":"رفع البنك الفائدة 25 نقطة أساس.","ai_summary":""}' } }], usage: { prompt_tokens: 210, completion_tokens: 60 } });
const geminiQuota = () => new Response('{"error":{"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota"}}', { status: 429 });

Deno.test('quota-exhausted provider is cooled down, router falls back, draft stays in review, usage is recorded', async () => {
  const { body, calls } = await run({ gemini: geminiQuota, groq: groqOk });
  assert(body.results[0].status === 'awaiting_human_review', JSON.stringify(body));
  assert(body.results[0].provider === 'groq' && body.results[0].translation_status === 'review');
  const save = calls.find((c) => c.url.includes('/article_translations') && c.method === 'POST')!;
  assert(save.body.translation_status === 'review' && save.body.translation_source === 'machine_draft', 'never auto-published');
  assert(!('__usage' in save.body), 'usage metadata not persisted as content');
  const cooldown = calls.find((c) => c.url.includes('/ai_provider_cooldowns') && c.method === 'POST')!;
  const cd = Array.isArray(cooldown.body) ? cooldown.body[0] : cooldown.body;
  assert(cd.provider === 'gemini' && Date.parse(cd.disabled_until) - Date.now() > 20 * 3600e3, 'gemini quota cooldown ~24h');
  const usage = calls.find((c) => c.url.includes('/ai_usage_log'))!.body as any[];
  assert(usage.length === 2, 'one failed + one successful attempt');
  const g = usage.find((u) => u.provider === 'gemini'), q = usage.find((u) => u.provider === 'groq');
  assert(g.ok === false && g.error_kind === 'quota' && g.http_status === 429);
  assert(q.ok === true && q.input_tokens === 210 && q.output_tokens === 60 && q.article_id && q.function_name === 'translate-articles');
  assert(!JSON.stringify(usage).includes('fixture-key'), 'no key material in usage rows');
});
Deno.test('all providers failing defers the article without publishing and logs failures only', async () => {
  const { body, calls } = await run({ gemini: geminiQuota, groq: () => new Response('{"error":"Rate limit: tokens per day (TPD) quota"}', { status: 429 }) });
  assert(body.results[0].status === 'deferred', JSON.stringify(body));
  assert(!calls.some((c) => c.url.includes('/article_translations') && c.method === 'POST'), 'nothing saved');
  const usage = calls.find((c) => c.url.includes('/ai_usage_log'))!.body as any[];
  assert(usage.length === 2 && usage.every((u) => !u.ok && u.error_kind === 'quota'));
});
Deno.test('usage table missing (migration not yet applied) does not break translation', async () => {
  const { body } = await run({ gemini: geminiQuota, groq: groqOk }, 404);
  assert(body.results[0].generated === true && body.results[0].status === 'awaiting_human_review', JSON.stringify(body));
});
