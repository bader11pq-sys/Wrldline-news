const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function violations(content) {
  const issues = [];
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(content)) issues.push('Supabase secret literal');
  for (const jwt of content.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(jwt[0].split('.')[1], 'base64url').toString()).role === 'service_role') issues.push('Service-role JWT literal'); } catch {}
  }
  if (/(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*[:=]\s*["'][^"']{16,}["']/.test(content)) issues.push('Service role key literal');
  if (/\b(?:href|src)\s*=\s*["']?\s*(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(content)) issues.push('Executable raw URL');
  if (/(?:\.href\s*=|setAttribute\s*\(\s*["']href["']\s*,)\s*(?:article|record|row|a)\.(?:url|source_url|sponsor_url)\b/.test(content)) issues.push('Unsanitized record URL sink');
  return issues;
}
function browserFiles() {
  const result = [];
  const seen = new Set();
  // Browser scope is the dependency graph of HTML script tags, not server bot files
  // that merely happen to live in the static root.
  for (const name of fs.readdirSync(root).filter((name) => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, name), 'utf8'); result.push([name, html]);
    for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
      if (/^(https?:|\/\/)/i.test(src)) continue;
      const file = path.resolve(root, src.split(/[?#]/)[0].replace(/^\//, ''));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || seen.has(file)) continue;
      seen.add(file); result.push([path.relative(root, file), fs.readFileSync(file, 'utf8')]);
    }
  }
  // Also follow literal local JS references used by dynamic script loaders/imports.
  // The traversal stays within the repository and never fetches external scripts.
  for (let index = 0; index < result.length; index++) {
    const [parent, source] = result[index];
    for (const [, raw] of source.matchAll(/["']((?:\/?[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.js(?:[?#][^"']*)?)["']/g)) {
      const local = raw.split(/[?#]/)[0];
      const file = path.resolve(local.startsWith('/') ? root : path.dirname(path.join(root,parent)),local.replace(/^\//,''));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || seen.has(file)) continue;
      seen.add(file); result.push([path.relative(root,file),fs.readFileSync(file,'utf8')]);
    }
  }
  return result;
}
test('scanner rejects privileged literals and malicious raw URL fixtures', () => {
  const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  assert.ok(violations('const key="eyJhbGciOiJIUzI1NiJ9.' + payload + '.fixtureSignature"').length);
  assert.ok(violations('const key="sb_secret_fixture' + 'a'.repeat(20) + '"').length);
  assert.ok(violations('<a href="javascript:alert(1)">').length);
  assert.ok(violations('anchor.href = article.source_url;').length);
  assert.deepEqual(violations('anchor.href = safeURL(article.source_url); const key="sb_publishable_fixture";'), []);
});
test('browser dependency graph contains no service-role literals or obvious unsafe URL sinks', () => {
  const failures = browserFiles().flatMap(([name, source]) => violations(source).map((issue) => `${name}: ${issue}`));
  assert.deepEqual(failures, []);
});
test('browser Supabase SDK URLs must not float on major version 2', () => {
  const failures = browserFiles().filter(([, source]) => /@supabase\/supabase-js@2(?=["'?/#<\s])/.test(source)).map(([name]) => name);
  assert.deepEqual(failures, []);
});
test('existing newsroom URL helper rejects executable and malicious raw fixture URLs', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'newsroom.js'), 'utf8'), { window, URL, console });
  for (const raw of ['javascript:alert(1)', 'data:text/html,<svg onload=alert(1)>', 'vbscript:msgbox(1)', '\u0000javascript:alert(1)', '//attacker.test', 'not a URL']) assert.equal(window.WLNR.safeURL(raw), '');
  assert.equal(window.WLNR.safeURL('https://publisher.test/article'), 'https://publisher.test/article');
});
test('freshness SQL is service-role only and does not widen article access', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261115050000_source_freshness.sql'), 'utf8');
  assert.ok(sql.includes('revoke all on function public.get_source_freshness_snapshot(integer,integer) from public,anon,authenticated'));
  assert.ok(sql.includes('grant execute on function public.get_source_freshness_snapshot(integer,integer) to service_role'));
  assert.ok(!/grant\s+select\s+on\s+(?:public\.)?articles\s+to\s+anon/i.test(sql));
  assert.ok(!/vault\.decrypted_secrets|cron\.schedule|https:\/\/.*secret=/i.test(sql));
});
