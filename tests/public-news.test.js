const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { loadWorkerModule } = require('./helpers/load-worker.mjs');
const vm = require('node:vm');
const reader = require('../reader-prose.js');
const ROOT = path.resolve(__dirname, '..');
const NOW = new Date('2026-11-15T04:00:00.000Z');
const ORIGIN = 'https://al-ghaib.us.ci';
const ENV = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_fixture' };
const modulePromise = loadWorkerModule(path.join(ROOT, 'cloudflare/workers/wrldline-public'));
const id = n => '00000000-0000-4000-8000-' + n.toString(16).padStart(12, '0');
const article = (n = 1, extra = {}) => ({ id: id(n), title: 'خبر منشور ' + n, summary: 'ملخص منشور قصير مع تفاصيل مسندة إلى المصدر.', author: null, lang: 'ar', category: 'world', country: 'العالم', source_name: 'Fixture News', source_url: 'https://source.example/story/' + n, published_at: new Date(NOW.getTime() - n * 60000).toISOString(), is_breaking: false, verification: 'unconfirmed', editorial_status: 'published', ...extra });
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function fixture(records = [article()], overrides = {}) {
  const calls = [];
  const eligible = () => records.filter(a => a.editorial_status === 'published' && a.published_at && Date.parse(a.published_at) <= NOW.getTime());
  const sorted = () => eligible().slice().sort((a, b) => a.id.localeCompare(b.id));
  const boundaries = () => { const rows = sorted(), pages = [{ page: 1, after_id: null }]; for (let offset = 1000; offset < rows.length; offset += 1000) pages.push({ page: pages.length + 1, after_id: rows[offset - 1].id }); return pages; };
  const fetchImpl = async (url, options) => {
    if (url instanceof Request) { calls.push({ proxy: url.url }); return new Response('origin preserved', { status: 200 }); }
    const name = new URL(url).pathname.split('/').at(-1), args = JSON.parse(options.body);
    calls.push({ url, name, args, options });
    if (overrides[name]) return overrides[name](args, calls);
    if (name === 'public_news_article') return json(eligible().filter(a => a.id === args.p_id).slice(0, 1));
    if (name === 'public_news_article_intelligence') return json(eligible().filter(a => a.id === args.p_id).slice(0, 1).map(a => ({ id: a.id, ai_summary: a.ai_summary || null, ai_reader_impact: a.ai_reader_impact || null, ai_watch_next: a.ai_watch_next || null })));
    if (name === 'public_news_recent') return json(eligible().filter(a => Date.parse(a.published_at) <= Date.parse(args.p_before) && (!args.p_since || Date.parse(a.published_at) >= Date.parse(args.p_since))).sort((a, b) => b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id)).slice(args.p_offset, args.p_offset + args.p_limit));
    // Narrow archive projection: lane filter plus the database's publication order.
    if (name === 'public_news_list') return json(eligible().filter(a => args.p_lane === 'all' || a.audience_lane === args.p_lane).filter(a => !args.p_before || Date.parse(a.published_at) <= Date.parse(args.p_before)).sort((a, b) => b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id)).slice(args.p_offset, args.p_offset + args.p_limit).map(a => ({ id: a.id, title: a.title, summary: a.summary, image_url: a.image_url || null, lang: a.lang, category: a.category, source_name: a.source_name, source_url: a.source_url, url: a.url || null, published_at: a.published_at, content_type: a.content_type || null, audience_lane: a.audience_lane || null })));
    if (name === 'public_news_sitemap_recent') return json(eligible().filter(a => Date.parse(a.published_at) >= NOW.getTime() - args.p_hours * 3600000).sort((a, b) => b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id)).slice(0, args.p_limit).map(a => ({ id: a.id, title: a.title, lang: a.lang, published_at: a.published_at })));
    if (name === 'public_related_articles') return json(eligible().filter(a => a.id !== args.p_id && a.category === (eligible().find(x => x.id === args.p_id) || {}).category).slice(0, args.p_limit).map(a => ({ id: a.id, title: a.title, published_at: a.published_at, category: a.category, source_name: a.source_name, audience_lane: a.audience_lane || null })));
    if (name === 'public_news_sitemap_index') return json(boundaries().filter(p => !args.p_page || p.page === args.p_page).slice(args.p_offset, args.p_offset + 1000));
    if (name === 'public_news_sitemap') return json(sorted().filter(a => !args.p_after || a.id > args.p_after).slice(0, 1000).map(a => ({ id: a.id, published_at: a.published_at, corrected_at: a.corrected_at || null })));
    throw new Error('Unexpected RPC: ' + name);
  };
  return { calls, fetchImpl };
}
async function workerFor(f) { return (await modulePromise).createWorker({ fetchImpl: f.fetchImpl, now: () => NOW }); }
async function get(worker, pathname, options = {}, env = ENV) { return worker.fetch(new Request(ORIGIN + pathname, options), env); }
function urls(xml) { return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]); }
function schema(html) { return JSON.parse(html.match(/<script[^>]*type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]); }

test('initial HTML contains published summary, reader impact context, canonical metadata, attribution and optional trust without auth gate', async () => {
  const a = article(1, { author: ['Real Reporter'], image_url: 'https://source.example/actual.jpg', ai_summary: 'قراءة تحليلية موجزة.', ai_reader_impact: 'قد يؤثر القرار في تكاليف التجارة الإقليمية إذا دخل حيز التنفيذ.', ai_watch_next: 'راقب نشر النص التنفيذي والجدول الزمني الرسمي.' });
  const f = fixture([a]), response = await get(await workerFor(f), '/news/' + a.id, { headers: { Cookie: 'private=session', Authorization: 'Bearer private-session' } });
  const html = await response.text(), ld = schema(html);
  assert.equal(response.status, 200);
  assert.match(html, /<html lang="ar" dir="rtl" data-theme="dark">/);
  assert.ok(html.includes('<h1>' + a.title + '</h1>'));
  assert.ok(html.includes(a.summary));
  assert.ok(html.includes(a.ai_summary));
  assert.ok(html.includes(a.ai_reader_impact));
  assert.ok(html.includes(a.ai_watch_next));
  assert.ok(html.includes("لماذا يهم؟"));
  assert.deepEqual([...html.matchAll(/data-reader-step="([^"]+)"/g)].map(match => match[1]),
    ['event', 'known', 'source', 'impact', 'watch', 'details']);
  assert.ok(html.includes("https://wa.me/?text="));
  assert.ok(html.includes("https://twitter.com/intent/tweet?text="));
  assert.ok(html.includes("https://t.me/share/url?url="));
  assert.ok(html.includes("ما الذي نراقبه تالياً؟"));
  assert.ok(html.includes("لا يُعد تحققاً بشرياً أو تنبؤاً أو نصيحة مالية شخصية"));
  assert.match(html, new RegExp('<link rel="canonical" href="' + ORIGIN + '/news/' + a.id + '">'));
  assert.ok(html.includes('href="' + a.source_url + '"'));
  assert.ok(html.includes('id="articleTrust" data-article-id="' + a.id + '"'));
  assert.match(html, /src="\/article-trust\.js/);
  assert.match(html, /href="\/article-trust\.css/);
  assert.doesNotMatch(html, /auth-guard\.js|supabase-js|signInWith|access_token/);
  assert.equal(ld['@type'], 'NewsArticle');
  assert.equal(ld.datePublished, a.published_at);
  assert.equal(ld.image[0], a.image_url);
  assert.deepEqual(ld.author, [{ '@type': 'Person', name: 'Real Reporter' }]);
  assert.equal(ld.articleBody, a.summary);
  assert.equal(ld.isAccessibleForFree, true);
  assert.equal(ld.dateModified, a.published_at);
  assert.equal(ld.mainEntityOfPage['@type'], 'WebPage');
  assert.equal(ld.mainEntityOfPage['@id'], ORIGIN + '/news/' + a.id + '#webpage');
  assert.equal(ld.publisher.logo.width, 499);
  assert.equal(ld.publisher.logo.height, 233);
  assert.ok(ld.breadcrumb, 'article needs a breadcrumb list');
  assert.equal(ld.breadcrumb['@type'], 'BreadcrumbList');
  const trail = ld.breadcrumb.itemListElement;
  assert.equal(trail[0].item, ORIGIN + '/');
  assert.equal(trail.at(-1).item, ORIGIN + '/news/' + a.id);
  assert.equal(trail.at(-1).name, a.title);
  assert.deepEqual([...trail].map(item => item.position), trail.map((_, index) => index + 1));
  assert.equal(typeof ld.keywords, 'string');
  assert.ok(ld.keywords.includes('حول العالم'), 'keywords should carry the section label');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  // article + reader context + related reading; the trust RPC is opt-in.
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls[0].options.headers.apikey, ENV.SUPABASE_ANON_KEY);
  assert.equal(f.calls[1].name, 'public_news_article_intelligence');
  assert.deepEqual(f.calls[1].args, { p_id: a.id });
  assert.equal(f.calls[2].name, 'public_related_articles');
  assert.equal(f.calls[0].options.headers.Authorization, undefined);
  assert.equal(f.calls[0].options.headers.Cookie, undefined);
});

test('missing or unavailable reader-context RPC never blocks the attributed public summary', async () => {
  const a = article(101, { ai_reader_impact: 'أثر محتمل.', ai_watch_next: 'إشارة لاحقة.' });
  const f = fixture([a], { public_news_article_intelligence: () => json({ error: 'not deployed' }, 404) });
  const response = await get(await workerFor(f), '/news/' + a.id);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(html.includes(a.summary));
  assert.ok(html.includes(a.source_url));
  assert.doesNotMatch(html, /data-reader-step="(?:impact|watch)"/);
});

test('reader split agrees across server and browser and retains structured copy without duplication', async () => {
  const { splitLead } = await modulePromise;
  const structured = '### نطاق التغطية\r\n• خبر أول.\r\n• معلومة ثانية.\r\n\r\nهذه تفاصيل إضافية.';
  const long = `${'كلمة '.repeat(44)}توقّف هنا. ${'تفاصيل '.repeat(80)}`;
  for (const value of ['', 'First line\nSecond line', '## Heading only', structured, long, '• One\n• Two']) {
    const result = splitLead(value);
    assert.deepEqual(result, reader.splitLead(value));
    const normalize = text => text.trim().replace(/\s+/g, ' ');
    assert.equal(normalize(`${result.lead} ${result.details}`), normalize(value));
  }
  const a = article(102, { summary: structured, language: 'ar' });
  const html = await (await get(await workerFor(fixture([a])), '/news/' + a.id)).text();
  assert.match(html, /data-reading-lead><h3 dir="auto">نطاق التغطية<\/h3><ul><li dir="auto">خبر أول\.<\/li><\/ul>/);
  assert.match(html, /data-reading-body><ul><li dir="auto">معلومة ثانية\.<\/li><\/ul><p dir="auto">هذه تفاصيل إضافية\.<\/p>/);
  const visible = html.replace(/<script\b[\s\S]*?<\/script>|<[^>]+>/g, '');
  assert.equal(visible.split('خبر أول.').length - 1, 1);
  assert.equal(visible.split('معلومة ثانية.').length - 1, 1);
  const archive = await (await get(await workerFor(fixture([a])), '/news/')).text();
  assert.match(archive, /class="pn-card-summary"[^>]*>نطاق التغطية خبر أول\. معلومة ثانية\./);
});

test('empty article data renders honest English fallbacks without invented impact or a source link', async () => {
  const a = article(103, { lang: 'en', title: 'An attributed item', summary: null, source_name: null, source_url: null });
  const html = await (await get(await workerFor(fixture([a])), '/news/' + a.id)).text();
  assert.deepEqual([...html.matchAll(/data-reader-step="([^"]+)"/g)].map(match => match[1]),
    ['event', 'known', 'source', 'details']);
  assert.match(html, /<h2>What happened\?<\/h2>/);
  assert.match(html, /<p data-reading-missing>No published summary/);
  assert.match(html, /<p data-source-missing>The original source link is unavailable/);
  assert.doesNotMatch(html, /data-reader-step="source"[^>]*><h2>[^<]*<\/h2><a/);
});

test('unknown/malformed UUID and unpublished, future, undated or missing records are true noindex 404s', async () => {
  const f = fixture([article(2, { editorial_status: 'review' }), article(3, { editorial_status: 'rejected' }), article(4, { published_at: null }), article(5, { published_at: '2026-11-16T00:00:00Z' })]);
  const worker = await workerFor(f);
  for (const p of ['/news/not-a-uuid', '/news/' + id(99), '/news/' + id(2), '/news/' + id(3), '/news/' + id(4), '/news/' + id(5), '/news/a/b']) {
    const r = await get(worker, p); assert.equal(r.status, 404, p); assert.match(r.headers.get('x-robots-tag'), /noindex/); assert.match(await r.text(), /content="noindex,nofollow"/);
  }
  assert.ok(f.calls.every(c => c.name === 'public_news_article'));
});

test('backend failure, malformed response, oversized row count and absent public env produce noindex 503 not soft 404', async () => {
  for (const override of [() => json({ message: 'secret credentials hidden' }, 403), () => new Response('not JSON'), () => json([article(), article(2)]), () => { throw new Error('private error trace'); }]) {
    const f = fixture([], { public_news_article: override }), r = await get(await workerFor(f), '/news/' + id(1));
    const html = await r.text(); assert.equal(r.status, 503); assert.match(r.headers.get('x-robots-tag'), /noindex/); assert.equal(r.headers.get('retry-after'), '60'); assert.doesNotMatch(html, /secret credentials|private error trace|sb_publishable/);
  }
  const f = fixture(), r = await get(await workerFor(f), '/news/' + id(1), {}, {});
  assert.equal(r.status, 503); assert.equal(f.calls.length, 0);
});

test('sanitizes HTML, attributes, URLs and JSON-LD and strips unapproved projected fields', async () => {
  const a = article(1, { title: '</script><img src=x onerror=alert(1)> " &', summary: '<svg/onload=alert(2)>\n\nAuthorized summary.', source_name: '<script>bad()</script>', source_url: 'javascript:alert(3)', url: 'https://safe.example/story?x="evil"&a=b', image_url: 'data:image/svg+xml,<svg/onload=alert(1)>', author: ['<script>Reporter</script>'], ai_confidence: 'SECRET_CONFIDENCE', private_user: 'SECRET_ACCOUNT', received_at: '2026-11-15T03:59:59Z' });
  const r = await get(await workerFor(fixture([a])), '/news/' + a.id), html = await r.text(), ld = schema(html);
  assert.equal(r.status, 200); assert.doesNotMatch(html, /<img src=x|<svg\/onload|href="javascript:|SECRET_CONFIDENCE|SECRET_ACCOUNT|2026-11-15T03:59:59Z/);
  assert.match(html, /&lt;svg\/onload/); assert.ok(!Object.hasOwn(ld, 'image'));
  assert.equal(ld.headline, a.title); assert.equal(ld.datePublished, a.published_at);
  const raw = html.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]; assert.ok(!raw.includes('<')); assert.match(raw, /\\u003c/);
});

test('no author or image is invented; original publication and valid correction control structured dates', async () => {
  const a = article(1, { author: null, image_url: null, received_at: NOW.toISOString(), correction_note: 'تصحيح منشور', corrected_at: '2026-11-15T03:59:30Z', lang: 'en' });
  const html = await (await get(await workerFor(fixture([a])), '/news/' + a.id)).text(), ld = schema(html);
  assert.equal(ld.datePublished, a.published_at); assert.equal(ld.dateModified, '2026-11-15T03:59:30.000Z');
  // An aggregated summary has no invented Person author; the desk that selected
  // and attributed it is named as an Organization instead.
  assert.deepEqual(ld.author, [{ '@type': 'Organization', name: 'WRLDLINE NEWS editorial desk' }]);
  assert.ok(!Object.hasOwn(ld, 'image'));
  assert.match(html, /<html lang="en" dir="ltr"/); assert.match(html, /Published correction/); assert.match(html, /name="twitter:card" content="summary"/);
});

test('canonical normalizes case, trailing slash and query while HEAD has metadata/status and no body', async () => {
  const a = article(2748), worker = await workerFor(fixture([a]));
  for (const p of ['/news/' + a.id.toUpperCase(), '/news/' + a.id + '/', '/news/' + a.id + '?utm_source=test']) {
    const r = await get(worker, p); assert.equal(r.status, 308); assert.equal(r.headers.get('location'), ORIGIN + '/news/' + a.id);
  }
  const head = await get(worker, '/news/' + a.id, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), ''); assert.match(head.headers.get('content-type'), /text\/html/);
});

test('crawler-visible index links actual UUID pages and paginates with ordinary anchors', async () => {
  const f = fixture(Array.from({ length: 105 }, (_, n) => article(n + 1))), worker = await workerFor(f);
  const first = await get(worker, '/news/'), html = await first.text(); assert.equal(first.status, 200);
  assert.equal((html.match(/<h2><a href="https:\/\/al-ghaib\.us\.ci\/news\//g) || []).length, 50);
  assert.match(html, /href="\/news\/\?page=2"/);
  const third = await get(worker, '/news/?page=3'), body = await third.text(); assert.equal(third.status, 200); assert.match(body, /href="\/news\/\?page=2"/); assert.doesNotMatch(body, /href="\/news\/\?page=4"/);
  assert.equal((await get(worker, '/news/?page=4')).status, 404);
  assert.equal((await get(worker, '/news/?page=-1')).status, 404);
});

test('Google News sitemap is bounded to 1000 entries in the original-publication 48h window, not received time', async () => {
  const rows = Array.from({ length: 1500 }, (_, n) => article(n + 1));
  rows.push(article(9000, { published_at: '2026-11-01T00:00:00Z', received_at: NOW.toISOString() }));
  rows.push(article(9001, { editorial_status: 'review' }));
  const f = fixture(rows), r = await get(await workerFor(f), '/news-sitemap.xml'), xml = await r.text();
  assert.equal(r.status, 200); assert.equal(urls(xml).length, 1000); assert.match(xml, /<news:publication_date>/);
  assert.ok(!xml.includes(id(9000))); assert.ok(!xml.includes(id(9001)));
  assert.equal(f.calls[0].name, 'public_news_sitemap_recent');
  assert.equal(f.calls[0].args.p_limit, 1000); assert.equal(f.calls[0].args.p_hours, 48);
});

test('empty news window returns valid empty urlset', async () => {
  const r = await get(await workerFor(fixture([])), '/news-sitemap.xml'), xml = await r.text(); assert.equal(r.status, 200); assert.equal(urls(xml).length, 0); assert.match(xml, /<urlset .*><\/urlset>/);
});

test('all 27,037 published archive rows are discoverable exactly once through numbered stable keyset sitemaps', async () => {
  const rows = Array.from({ length: 27037 }, (_, n) => article(n + 1));
  rows.push(article(99999, { editorial_status: 'rejected' }));
  const f = fixture(rows), worker = await workerFor(f), index = await get(worker, '/article-sitemap.xml'), maps = urls(await index.text());
  assert.equal(index.status, 200); assert.equal(maps.length, 28); assert.equal(maps.at(-1), ORIGIN + '/article-sitemap-28.xml');
  const all = [];
  for (let n = 1; n <= maps.length; n++) { const r = await get(worker, '/article-sitemap-' + n + '.xml'); assert.equal(r.status, 200); const chunk = urls(await r.text()); assert.equal(chunk.length, n === 28 ? 37 : 1000); all.push(...chunk); }
  assert.equal(all.length, 27037); assert.equal(new Set(all).size, 27037); assert.equal(all[0], ORIGIN + '/news/' + id(1)); assert.equal(all.at(-1), ORIGIN + '/news/' + id(27037));
  assert.equal((await get(worker, '/article-sitemap-29.xml')).status, 404);
  assert.ok(f.calls.filter(c => c.name === 'public_news_sitemap').every(c => Object.keys(c.args).join() === 'p_after'));
});

test('sitemap index explicitly paginates beyond PostgREST 1000-row response limit', async () => {
  const pages = Array.from({ length: 1001 }, (_, n) => ({ page: n + 1, after_id: n ? id(n * 1000) : null }));
  const f = fixture([], { public_news_sitemap_index: args => json(pages.slice(args.p_offset, args.p_offset + 1000)) });
  const r = await get(await workerFor(f), '/article-sitemap.xml'); assert.equal(r.status, 200); assert.equal(urls(await r.text()).length, 1001); assert.deepEqual(f.calls.map(c => c.args.p_offset), [0, 1000]);
});

test('exact 1000 article archive does not add an empty terminal page', async () => {
  const rows = Array.from({ length: 1000 }, (_, n) => article(n + 1)), worker = await workerFor(fixture(rows));
  assert.equal(urls(await (await get(worker, '/article-sitemap.xml')).text()).length, 1); assert.equal((await get(worker, '/article-sitemap-2.xml')).status, 404);
});

test('RSS and Atom contain recent escaped summaries, canonical IDs, actual authors when provided and source links', async () => {
  const a = article(1, { title: 'A & B < C', summary: 'Summary <not markup> & attribution', lang: 'en', author: ['Actual Reporter'] });
  const worker = await workerFor(fixture([a, article(99999, { published_at: '2026-10-01T00:00:00Z', received_at: NOW.toISOString() })]));
  const rr = await get(worker, '/rss.xml'), ar = await get(worker, '/atom.xml'), rx = await rr.text(), ax = await ar.text();
  assert.match(rr.headers.get('content-type'), /application\/rss\+xml/); assert.match(ar.headers.get('content-type'), /application\/atom\+xml/);
  for (const xml of [rx, ax]) { assert.match(xml, /A &amp; B &lt; C/); assert.match(xml, /Summary &lt;not markup&gt; &amp; attribution/); assert.ok(xml.includes(ORIGIN + '/news/' + a.id)); assert.ok(xml.includes(a.source_url)); assert.ok(!xml.includes(id(99999))); assert.ok(!xml.includes('received_at')); }
  assert.match(rx, /<guid isPermaLink="true">/); assert.match(ax, /<name>Actual Reporter<\/name>/); assert.match(ax, new RegExp('<published>' + a.published_at + '</published>'));
});

test('unknown origin paths pass through unchanged; owned routes reject mutations without backend writes', async () => {
  const f = fixture(), worker = await workerFor(f);
  for (const p of ['/', '/account.html', '/admin.html', '/wrld.css', '/rest/v1/user_preferences']) { const r = await get(worker, p); assert.equal(await r.text(), 'origin preserved'); }
  const r = await get(worker, '/news/' + id(1), { method: 'POST', body: 'do not write' }); assert.equal(r.status, 405); assert.equal(r.headers.get('allow'), 'GET, HEAD'); assert.equal(f.calls.filter(c => c.name).length, 0);
});

test('migration has explicit owner-safe public projections, bounded queries and exact execution grants without table-wide access', async () => {
  const sql = await fs.readFile(path.join(ROOT, 'supabase/migrations/20261115010000_public_news.sql'), 'utf8');
  assert.equal((sql.match(/security definer set search_path = pg_catalog/g) || []).length, 4);
  assert.equal((sql.match(/grant execute on function public\.public_news_/g) || []).length, 4);
  assert.equal((sql.match(/revoke all on function public\.public_news_/g) || []).length, 4);
  assert.doesNotMatch(sql, /grant\s+select|select\s+\*|a\.\*|a\.(?:received_at|ai_confidence|ai_summary|created_by|verification_note)/i);
  assert.equal((sql.match(/a\.editorial_status = 'published'/g) || []).length, 4);
  assert.match(sql, /a\.published_at <= now\(\)/); assert.match(sql, /order by a\.id asc\s+limit 1000/);
  assert.doesNotMatch(sql, /create policy|service_role|user_preferences|newsletter_subscribers/);
});

async function shareFixture(mode) {
  const code = await fs.readFile(path.join(ROOT, 'share.js'), 'utf8');
  const actions = { shared: [], copied: [], downloaded: [], prompts: [] };
  const gradient = { addColorStop() {} };
  const context2d = new Proxy({}, { get(target, key) { if (key === 'measureText') return value => ({ width: String(value).length * 10 }); if (key === 'createLinearGradient') return () => gradient; return () => {}; }, set() { return true; } });
  const makeNode = tag => tag === 'canvas' ? { getContext: () => context2d, toBlob: callback => callback(new Blob(['png'], { type: 'image/png' })) } : { style: {}, dataset: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, click() { actions.downloaded.push(this.href); } };
  const document = { readyState: 'loading', documentElement: {}, head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {}, createElement: makeNode, getElementById: () => null, querySelector: selector => selector === 'link[rel="canonical"]' ? { href: ORIGIN + '/' } : null, querySelectorAll: () => [] };
  const navigator = { clipboard: { writeText: async value => actions.copied.push(value) } };
  if (mode !== 'copy') navigator.share = async value => actions.shared.push(value);
  if (mode === 'files') navigator.canShare = () => true;
  const window = { prompt: (...args) => actions.prompts.push(args) };
  const sandbox = { window, document, navigator, location: { href: ORIGIN + '/?article=wrong-modal-url' }, localStorage: { getItem: () => 'en' }, MutationObserver: class { observe() {} }, URL, Blob, File, console, Date, setTimeout: () => 1, clearTimeout() {} };
  vm.runInNewContext(code, sandbox, { filename: 'share.js' });
  return { actions, api: window.WRLDLINE_SHARE };
}

test('explicit canonical data.url reaches native file and native URL shares, not modal query address', async () => {
  for (const mode of ['files', 'url']) {
    const f = await shareFixture(mode), target = ORIGIN + '/news/' + id(42);
    assert.equal(await f.api.share({ title: 'Story', description: 'Summary', url: target }), true);
    assert.equal(f.actions.shared[0].url, target); assert.ok(f.actions.shared[0].text.includes(target)); assert.ok(!f.actions.shared[0].text.includes('?article='));
    assert.equal(Boolean(f.actions.shared[0].files), mode === 'files');
  }
});

test('clipboard image caption preserves canonical URL even for oversized description, and rejects unsafe URL', async () => {
  const f = await shareFixture('copy'), target = ORIGIN + '/news/' + id(42);
  await f.api.share({ title: 'Story', description: 'x'.repeat(5000), url: target });
  assert.ok(f.actions.copied[0].endsWith(target)); assert.ok(f.actions.copied[0].length <= 1800); assert.equal(f.actions.downloaded.length, 1);
  await f.api.share({ title: 'Story', url: 'javascript:alert(1)' });
  assert.ok(!f.actions.copied[1].includes('javascript:')); assert.ok(f.actions.copied[1].endsWith(ORIGIN + '/'));
});

test('modal changes retain legacy access/save/audio/history behavior and only generate public UUID links for published records', async () => {
  const code = await fs.readFile(path.join(ROOT, 'script.js'), 'utf8');
  const helper = code.match(/function publicArticleURL\(article\)\{[\s\S]*?\n\}/)[0];
  const context = {}; vm.runInNewContext(helper, context);
  assert.equal(context.publicArticleURL({ id: id(1), editorialStatus: 'published' }), ORIGIN + '/news/' + id(1));
  assert.equal(context.publicArticleURL({ id: id(1), editorialStatus: 'review' }), '');
  assert.equal(context.publicArticleURL({ id: 'bad', editorialStatus: 'published' }), '');
  assert.match(code, /url\.searchParams\.set\("article",id\)/); assert.match(code, /session\?\.access_token/); assert.match(code, /from\("user_saved_articles"\)/);
  assert.match(code, /Open article page/); assert.match(code, /url:url\|\|publicArticleURL\(article\)/);
});

test('English archive keeps original titles and passes language to article links and pagination', async () => {
  const rows = Array.from({ length: 55 }, (_, i) => article(i + 1)), worker = await workerFor(fixture(rows));
  const html = await (await get(worker, '/news/?lang=en')).text();
  assert.match(html, /<html lang="en" dir="ltr"/);
  assert.match(html, /<h1>Published news<\/h1>/);
  assert.match(html, /href="\/news\/" lang="ar">العربية<\/a>/);
  assert.ok(html.includes(`${ORIGIN}/news/${id(1)}#lang=en" lang="ar"`));
  assert.match(html, /href="\/news\/\?page=2&amp;lang=en">Next page/);
  const arabic = await (await get(worker, '/news/?lang=ar')).text();
  assert.match(arabic, /<html lang="ar" dir="rtl"/);
  assert.match(arabic, /href="\/news\/\?lang=en" lang="en">English<\/a>/);
});

test('analytics hooks and server-visible uncertainty exist without trusting legacy confirmed/AI fields', async () => {
  const a = article(1, { verification: 'confirmed', ai_confidence: 1 }), html = await (await get(await workerFor(fixture([a])), '/news/' + a.id)).text();
  assert.match(html, /src="\/analytics-config\.js/); assert.match(html, /src="\/analytics\.js/);
  assert.match(html, /data-audience-article data-article-id=/); assert.match(html, /data-category="world"/); assert.match(html, /data-server-trust="unconfirmed"/);
  assert.match(html, /لم يُثبت تأكيد بشري/); assert.doesNotMatch(html, /<strong>تأكيد تحريري بشري مسجل/);
});

test('optional trust RPC supports human-stamped confirmation only; stale review, untranslated review and optional backend failure remain conservative', async () => {
  const a = article(1, { lang: 'en', source_language: 'ar', verification: 'confirmed' });
  const valid = { id: a.id, editorial_trust_status: 'confirmed', trust_needs_review: false, trust_reviewed_at: '2026-11-15T03:59:00Z', human_translation_status: 'reviewed', human_translation_reviewed_at: '2026-11-15T03:58:00Z' };
  for (const [record, expected] of [[valid, true], [{ ...valid, trust_needs_review: true }, false], [{ ...valid, trust_reviewed_at: null }, false], [{ ...valid, human_translation_status: 'pending' }, false], [{ ...valid, id: id(88) }, false]]) {
    const f = fixture([a], { get_public_article_trust: () => json(record) });
    const r = await get(await workerFor(f), '/news/' + a.id, {}, { ...ENV, PUBLIC_TRUST_ENABLED: 'true' }), html = await r.text();
    assert.equal(r.status, 200); assert.equal(html.includes('<strong>Human editorial confirmation recorded</strong>'), expected);
    assert.equal(f.calls[1].name, 'get_public_article_trust');
  }
  const f = fixture([a], { get_public_article_trust: () => json({ error: 'not applied yet' }, 404) });
  const r = await get(await workerFor(f), '/news/' + a.id, {}, { ...ENV, PUBLIC_TRUST_ENABLED: 'true' }), html = await r.text();
  assert.equal(r.status, 200); assert.ok(html.includes(a.summary)); assert.match(html, /Human confirmation not established/); assert.ok(!html.includes('not applied yet'));
});


test('public RPC uses Worker-compatible manual redirects and never follows a 3xx to another origin', async () => {
  const f = fixture([article()], { public_news_article: () => new Response(null, { status: 302, headers: { Location: 'https://other.example/private' } }) });
  const response = await get(await workerFor(f), '/news/' + id(1));
  assert.equal(response.status, 503);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].options.redirect, 'manual');
  assert.equal(new URL(f.calls[0].url).origin, ENV.SUPABASE_URL);
  assert.ok(!(await response.text()).includes('other.example'));
});

test('an uncategorized story does not claim a section it cannot link to', async () => {
  const { renderArticle } = await modulePromise;
  const html = await renderArticle(article(7, { category: 'uncategorized', source_name: 'WRLDLINE NEWS', content_type: 'original' }), NOW).text();
  const schema = JSON.parse(html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema.articleSection, undefined, 'a database placeholder must not reach structured data');
  assert.ok(!/الأرشيف\s*\/\s*</.test(html), 'the breadcrumb must not end in a dangling separator');
  assert.match(html, /<nav class="public-news-breadcrumb"[^>]*><a href="\/news\/">/);
});

test('a real category still names its section in Arabic', async () => {
  const { renderArticle } = await modulePromise;
  const html = await renderArticle(article(8, { category: 'economy' }), NOW).text();
  const schema = JSON.parse(html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/)[1]);
  // The label comes from site-sections.js via sections.generated.js, so the
  // section page and the navigation use the same editorial name.
  assert.equal(schema.articleSection, 'الاقتصاد والطاقة');
  assert.match(html, /href="\/section\/economy"/);
});

test('a guessed section slug redirects to the section that covers it', async () => {
  const worker = await workerFor(fixture());
  for (const [slug, target] of [['energy', 'economy'], ['defence', 'security'], ['technology', 'tech'], ['human-rights', 'rights']]) {
    const res = await get(worker, `/section/${slug}`, { headers: { Accept: 'text/html' } });
    assert.equal(res.status, 308, `${slug} should redirect`);
    assert.equal(res.headers.get('Location'), `${ORIGIN}/section/${target}`);
  }
  const unknown = await get(worker, '/section/astrology', { headers: { Accept: 'text/html' } });
  assert.equal(unknown.status, 404, 'an unknown slug is still a 404');
});
