// Head-level contracts for Worker-rendered pages.
//
// Both assertions here exist because production proved them missing: article
// and section pages shipped with no hreflang alternates, and the Worker's
// content-security-policy blocked the Cloudflare Web Analytics beacon on every
// page it rendered, which showed up as a console error for readers and silently
// discarded analytics.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { loadWorkerModule } = require('./helpers/load-worker.mjs');

const ROOT = path.resolve(__dirname, '..');
const modulePromise = loadWorkerModule(path.join(ROOT, 'cloudflare/workers/wrldline-public'));

const NOW = new Date('2026-11-25T12:00:00.000Z');
const ARTICLE_ID = '00000000-0000-4000-8000-000000000007';
const ENV = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_fixture',
  ENVIRONMENT: 'production',
  GIT_COMMIT: 'b'.repeat(40),
  DEPLOYED_AT: '2026-11-26T09:15:00Z'
};

function workerWith(rows) {
  return modulePromise.then(mod => mod.createWorker({
    now: () => NOW,
    fetchImpl: async (url) => {
      const name = new URL(String(url)).pathname.split('/').at(-1);
      const payload = name === 'public_news_article' ? rows : [];
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }));
}

const article = {
  id: ARTICLE_ID,
  title: 'عنوان خبر منشور للاختبار',
  summary: 'ملخص منشور كافٍ لاختبار الوسوم في رأس الصفحة، مع تفاصيل مسندة إلى المصدر الأصلي.',
  lang: 'ar',
  category: 'world',
  source_name: 'Fixture News',
  source_url: 'https://source.example/story',
  published_at: '2026-11-25T08:00:00.000Z',
  editorial_status: 'published'
};

async function get(pathname, rows = [article]) {
  const worker = await workerWith(rows);
  const response = await worker.fetch(new Request('https://al-ghaib.us.ci' + pathname), ENV);
  return { response, html: await response.text() };
}

function hreflangs(html) {
  return [...html.matchAll(/<link rel="alternate" hreflang="([a-z-]+)" href="([^"]+)"/g)].map(m => [m[1], m[2]]);
}

test('article pages declare no language alternates, because they are Arabic-only', async () => {
  // Any query string on an article URL is 308-redirected to the clean canonical,
  // so ?lang=en never renders an English article. Advertising an alternate that
  // redirects back would be worse than declaring none.
  const { html } = await get(`/news/${ARTICLE_ID}`);
  assert.equal(hreflangs(html).length, 0);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)[1];
  assert.equal(canonical, `https://al-ghaib.us.ci/news/${ARTICLE_ID}`);
});

test('an article URL with a query string redirects to the canonical form', async () => {
  const worker = await workerWith([article]);
  const response = await worker.fetch(new Request(`https://al-ghaib.us.ci/news/${ARTICLE_ID}?lang=en`), ENV);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), `https://al-ghaib.us.ci/news/${ARTICLE_ID}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('the English news index declares the same alternates as the Arabic one', async () => {
  const { html } = await get('/news/?lang=en');
  const map = Object.fromEntries(hreflangs(html));
  assert.equal(map.ar, 'https://al-ghaib.us.ci/news/');
  assert.equal(map.en, 'https://al-ghaib.us.ci/news/?lang=en');
  assert.equal(map['x-default'], 'https://al-ghaib.us.ci/news/');
});

test('section pages declare alternates too', async () => {
  const { html } = await get('/section/politics');
  const map = Object.fromEntries(hreflangs(html));
  assert.equal(map.ar, 'https://al-ghaib.us.ci/section/politics');
  assert.equal(map.en, 'https://al-ghaib.us.ci/section/politics?lang=en');
});

test('non-indexable pages stay free of alternates', async () => {
  const { html } = await get('/news/00000000-0000-4000-8000-000000000404', []);
  assert.equal(hreflangs(html).length, 0);
});

test('the content-security-policy permits the Cloudflare analytics beacon', async () => {
  const { response } = await get(`/news/${ARTICLE_ID}`);
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /script-src [^;]*https:\/\/static\.cloudflareinsights\.com/);
  assert.match(csp, /connect-src [^;]*https:\/\/cloudflareinsights\.com/);
});

test('the content-security-policy still forbids inline and third-party scripts', async () => {
  const { response } = await get(`/news/${ARTICLE_ID}`);
  const csp = response.headers.get('content-security-policy');
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), 'script-src must not allow inline script');
  assert.ok(!/script-src[^;]*\*/.test(csp), 'script-src must not allow a wildcard');
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
});
