// Guards the boundary between the Cloudflare Worker and GitHub Pages.
//
// Why this exists: production once served a Worker bundle that no commit could
// account for, and the file that defines its routes had no test at all. These
// assertions are cheap and they fail before a bad `wrangler deploy` can take a
// route away from the static site.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'cloudflare/workers/wrldline-public');
const RAW = fs.readFileSync(path.join(DIR, 'wrangler.jsonc'), 'utf8');

// Minimal JSONC reader: strips // and /* */ comments and trailing commas while
// respecting string literals, so we can assert on the real config wrangler reads.
function parseJSONC(source) {
  let out = '';
  let inString = false;
  let quote = '';
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i++; } continue; }
    if (inString) {
      out += c;
      if (c === '\\') { out += source[i + 1]; i++; continue; }
      if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") { inString = true; quote = c; out += '"'; continue; }
    if (c === '/' && next === '/') { inLine = true; i++; continue; }
    if (c === '/' && next === '*') { inBlock = true; i++; continue; }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

const config = parseJSONC(RAW);
const workerSource = fs.readFileSync(path.join(DIR, 'worker.js'), 'utf8');

const EXPECTED_ROUTES = [
  'al-ghaib.us.ci/news',
  'al-ghaib.us.ci/news/*',
  'al-ghaib.us.ci/section/*',
  'al-ghaib.us.ci/news-sitemap.xml*',
  'al-ghaib.us.ci/article-sitemap*',
  'al-ghaib.us.ci/rss.xml*',
  'al-ghaib.us.ci/atom.xml*',
  'al-ghaib.us.ci/__version'
];

test('wrangler config parses and keeps the production worker name', () => {
  assert.equal(config.name, 'wrldline-public');
  assert.equal(config.main, 'worker.js');
  assert.equal(config.workers_dev, false);
});

test('production routes are exactly the Worker-owned paths plus /__version', () => {
  const routes = config.routes.map(r => r.pattern).sort();
  assert.deepEqual(routes, [...EXPECTED_ROUTES].sort());
  for (const route of config.routes) assert.equal(route.zone_name, 'al-ghaib.us.ci');
});

test('no route can shadow a GitHub Pages path', () => {
  const forbidden = [
    /^al-ghaib\.us\.ci\/?$/i,              // the home page
    /^al-ghaib\.us\.ci\/\*/i,              // catch-all
    /^al-ghaib\.us\.ci\/\*\.\w+$/i,        // *.html style sweep
    /^al-ghaib\.us\.ci\/(?!news|section|article-sitemap|news-sitemap|rss\.xml|atom\.xml|__version)/i
  ];
  for (const route of config.routes) {
    assert.ok(!forbidden.some(re => re.test(route.pattern)), `route would shadow Pages: ${route.pattern}`);
  }
});

test('the preview environment is isolated and routeless', () => {
  const preview = config.env.preview;
  assert.ok(preview, 'preview environment must exist');
  assert.equal(preview.name, 'wrldline-public-preview');
  assert.notEqual(preview.name, config.name, 'preview must not reuse the production Worker name');
  assert.equal(preview.workers_dev, true);
  assert.deepEqual(preview.routes, [], 'preview must have no custom-domain route');
  assert.equal(preview.vars.ENVIRONMENT, 'preview');
});

test('the production environment keeps the zone routes and its own identity', () => {
  const production = config.env.production;
  assert.ok(production, 'production environment must exist');
  assert.equal(production.name, 'wrldline-public');
  assert.equal(production.workers_dev, false);
  assert.deepEqual(production.routes.map(r => r.pattern).sort(), [...EXPECTED_ROUTES].sort());
  assert.equal(production.vars.ENVIRONMENT, 'production');
});

test('preview and production share the same backend but never the same identity', () => {
  const { preview, production } = config.env;
  assert.equal(preview.vars.SUPABASE_URL, production.vars.SUPABASE_URL);
  assert.equal(preview.vars.SUPABASE_ANON_KEY, production.vars.SUPABASE_ANON_KEY);
  assert.notEqual(preview.vars.WORKER_SERVICE, production.vars.WORKER_SERVICE);
});

test('no publishable key is duplicated into a source file', () => {
  assert.ok(!/sb_secret|service_role/i.test(RAW), 'the Worker config must never hold a service-role key');
  assert.ok(!/service_role|SUPABASE_SERVICE/i.test(workerSource), 'the Worker must not read a service-role key');
});

test('the Worker reports its own routes so /__version cannot drift from wrangler', () => {
  const match = workerSource.match(/export const OWNED_ROUTES = \[([\s\S]*?)\];/);
  assert.ok(match, 'OWNED_ROUTES must be declared in worker.js');
  const ledger = [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).map(r => r.replace(/^al-ghaib\.us\.ci/, '')).sort();
  assert.deepEqual(ledger, EXPECTED_ROUTES.map(r => r.replace(/^al-ghaib\.us\.ci/, '')).sort());
});
