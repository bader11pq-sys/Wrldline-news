// /__version is the only trustworthy statement about which bundle is live.
//
// These tests pin three promises: it answers without touching the backend, it
// reports exactly the commit it was built from (never a guess), and it cannot
// be cached or indexed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { loadWorkerModule } = require('./helpers/load-worker.mjs');

const ROOT = path.resolve(__dirname, '..');
const SHA = 'a'.repeat(40);
const modulePromise = loadWorkerModule(path.join(ROOT, 'cloudflare/workers/wrldline-public'));

function harness(env) {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(String(url)); throw new Error('backend must not be called'); };
  return { worker: null, calls, fetchImpl, env };
}

async function request(env, pathname = '/__version', method = 'GET') {
  const mod = await modulePromise;
  const calls = [];
  const worker = mod.createWorker({ fetchImpl: async (url) => { calls.push(String(url)); throw new Error('backend must not be called'); } });
  const response = await worker.fetch(new Request('https://al-ghaib.us.ci' + pathname, { method }), env);
  return { response, calls, mod };
}

test('reports the injected commit, timestamp and environment', async () => {
  const { response, calls } = await request({
    ENVIRONMENT: 'production',
    GIT_COMMIT: SHA,
    DEPLOYED_AT: '2026-11-26T09:15:00Z',
    WORKER_SERVICE: 'wrldline-public'
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.equal(body.commit, SHA);
  assert.equal(body.deployed_at, '2026-11-26T09:15:00.000Z');
  assert.equal(body.environment, 'production');
  assert.equal(body.service, 'wrldline-public');
  assert.equal(calls.length, 0, 'version reporting must not call the database');
  assert.deepEqual(body.routes.includes('/__version'), true);
});

test('JSON endpoint behaves identically to the bare path', async () => {
  const env = { ENVIRONMENT: 'preview', GIT_COMMIT: SHA, DEPLOYED_AT: '2026-11-26T09:15:00Z' };
  const plain = await (await request(env, '/__version')).response.json();
  const dotted = await (await request(env, '/__version.json')).response.json();
  assert.equal(plain.commit, dotted.commit);
  assert.equal(dotted.environment, 'preview');
});

test('never caches and never indexes', async () => {
  const { response } = await request({ ENVIRONMENT: 'production', GIT_COMMIT: SHA, DEPLOYED_AT: '2026-11-26T09:15:00Z' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  assert.equal(response.headers.get('x-wrldline-commit'), SHA);
});

test('an unstamped deploy says unknown instead of borrowing a commit', async () => {
  const { response } = await request({ ENVIRONMENT: 'preview' });
  const body = await response.json();
  assert.equal(body.commit, 'unknown');
  assert.equal(body.deployed_at, 'unknown');
  assert.equal(response.headers.get('x-wrldline-commit'), 'unknown');
});

test('a malformed commit is rejected rather than echoed', async () => {
  const { response } = await request({ GIT_COMMIT: '<script>alert(1)</script>' });
  const body = await response.json();
  assert.equal(body.commit, 'unknown');
});

test('HEAD returns headers only and other methods are refused', async () => {
  const env = { ENVIRONMENT: 'production', GIT_COMMIT: SHA, DEPLOYED_AT: '2026-11-26T09:15:00Z' };
  const head = await request(env, '/__version', 'HEAD');
  assert.equal(head.response.status, 200);
  assert.equal(await head.response.text(), '');
  const post = await request(env, '/__version', 'POST');
  assert.equal(post.response.status, 405);
  assert.equal(post.response.headers.get('allow'), 'GET, HEAD');
});

test('generated pages carry the same commit as /__version', async () => {
  const mod = await modulePromise;
  const worker = mod.createWorker({
    fetchImpl: async (url) => {
      const name = new URL(String(url)).pathname.split('/').at(-1);
      if (name === 'public_news_article') return new Response(JSON.stringify([{
        id: '00000000-0000-4000-8000-000000000001',
        title: 'عنوان منشور', summary: 'ملخص منشور كافٍ لاختبار الصفحة.',
        lang: 'ar', category: 'world', source_name: 'Fixture', source_url: 'https://source.example/a',
        published_at: '2026-11-25T10:00:00.000Z', editorial_status: 'published'
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  const env = { ENVIRONMENT: 'production', GIT_COMMIT: SHA, DEPLOYED_AT: '2026-11-26T09:15:00Z', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_fixture' };
  const page = await worker.fetch(new Request('https://al-ghaib.us.ci/news/00000000-0000-4000-8000-000000000001'), env);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('x-wrldline-commit'), SHA);
});
