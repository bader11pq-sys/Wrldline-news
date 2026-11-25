// The deployment tooling is the only thing standing between "it looks fine" and
// "it is provably the approved commit". These tests cover its argument guards and
// the contract it must not quietly lose.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const run = (script, args) => spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
  encoding: 'utf8', timeout: 20000, env: { ...process.env, GITHUB_TOKEN: '' }
});

test('worker-parity refuses to run without a comparison target', () => {
  const result = run('scripts/worker-parity.mjs', ['--left=https://al-ghaib.us.ci']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--right/);
});

test('probe-backend refuses to run without a key', () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/probe-backend.mjs')], {
    encoding: 'utf8', timeout: 20000,
    env: { ...process.env, SUPABASE_ANON_KEY: '', SUPABASE_PUBLISHABLE_KEY: '', GITHUB_TOKEN: '' }
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /SUPABASE_ANON_KEY/);
});

test('the staging runner hard-codes the production project ref and refuses it', () => {
  const script = read('scripts/staging-migrations.sh');
  assert.match(script, /PRODUCTION_REF="vmaxbnogmmfyrcucapnq"/);
  assert.match(script, /refusing to continue/);
  assert.match(script, /--confirm/);
  const result = spawnSync('bash', [path.join(ROOT, 'scripts/staging-migrations.sh'), '--phase', 'up'], {
    encoding: 'utf8', timeout: 20000,
    env: { ...process.env, STAGING_DB_URL: 'postgresql://user:pw@db.vmaxbnogmmfyrcucapnq.supabase.co:5432/postgres' }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production project ref|--confirm/);
});

test('the verifier checks every Worker-owned route and the Pages origin', () => {
  const script = read('scripts/verify-deployment.mjs');
  for (const needle of ['/__version', '/section/politics', '/rss.xml', '/atom.xml', '/news-sitemap.xml', 'x-github-request-id']) {
    assert.ok(script.includes(needle), `verifier must check ${needle}`);
  }
});

test('the deploy workflow cannot reach production without an approval gate', () => {
  const workflow = read('.github/workflows/deploy-wrldline-public.yml');
  assert.match(workflow, /environment:\s*\n\s*name: production-worker/, 'production job must use the protected environment');
  assert.match(workflow, /inputs\.promote == 'production'/, 'production must be dispatch-only');
  assert.ok(!/on:\s*\n\s*push:[\s\S]{0,200}--env production/.test(workflow), 'a push must never deploy production');
  assert.match(workflow, /verify-deployment\.mjs --expect-sha=[^ ]+ --expect-worker-sha=[^ ]+ --strict/);
});

test('the staging workflow never references the production project', () => {
  const workflow = read('.github/workflows/staging-migrations.yml');
  // The production ref may appear only inside the guard that refuses it.
  for (const line of workflow.split('\n')) {
    if (line.includes('vmaxbnogmmfyrcucapnq')) {
      assert.match(line, /refers to the production project|--error|STAGING_DB_URL/, `production ref used as a target: ${line.trim()}`);
    }
  }
  assert.match(workflow, /acknowledge_staging == 'STAGING'/);
  assert.match(workflow, /environment: supabase-staging/);
});

test('the rollback workflow only accepts commits that are on main', () => {
  const workflow = read('.github/workflows/rollback-wrldline-public.yml');
  assert.match(workflow, /merge-base --is-ancestor/);
  assert.match(workflow, /production-worker/);
  assert.match(workflow, /--expect-worker-sha/);
});
