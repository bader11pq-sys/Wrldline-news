#!/usr/bin/env node
/**
 * Reconcile the three things that can drift apart:
 *
 *   1. the committed release      (main, or --expect-sha)
 *   2. the GitHub Pages deployment (which commit the static site was built from)
 *   3. the Cloudflare Worker       (which commit the live bundle reports)
 *
 * Read-only. No credentials are required; GITHUB_TOKEN only raises rate limits.
 *
 * Usage:
 *   node scripts/verify-deployment.mjs                 # report, exit 0 unless a check is fatal
 *   node scripts/verify-deployment.mjs --strict        # exit 1 on any mismatch (used by deploy CI)
 *   node scripts/verify-deployment.mjs --json          # machine-readable output
 *   node scripts/verify-deployment.mjs --expect-worker-sha=<sha> --strict
 *   node scripts/verify-deployment.mjs --base=https://preview.example
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = (name, fallback = null) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const REPO = value('repo', process.env.GITHUB_REPOSITORY || 'bader11pq-sys/Wrldline-news');
const BASE = value('base', 'https://al-ghaib.us.ci').replace(/\/$/, '');
const EXPECT_SHA = value('expect-sha');
const EXPECT_WORKER = value('expect-worker-sha');
const STRICT = flag('strict');
const JSON_OUT = flag('json');
const TOKEN = process.env.GITHUB_TOKEN || '';

const STATIC_FILES = [
  'index.html', 'script.js', 'quality.css', 'sw.js',
  'admin.html', 'for-you.html', 'news-map.html',
  'countries.html', 'country.html', 'economy.html'
];

const results = [];
function record(name, ok, detail, fatal = false) {
  results.push({ name, ok, detail, fatal });
  return ok;
}

function git(args, cwd = process.cwd()) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
}

async function ghJson(pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'wrldline-deploy-verifier',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
    }
  });
  if (!response.ok) throw new Error(`GitHub API ${pathname} -> ${response.status}`);
  return response.json();
}

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

async function main() {
  // 1. The release commit under test.
  let mainSha = EXPECT_SHA;
  if (!mainSha) {
    try { mainSha = (await ghJson(`/repos/${REPO}/commits/main`)).sha; }
    catch { mainSha = git(['rev-parse', 'HEAD']); }
  }
  record('release commit resolved', /^[0-9a-f]{40}$/.test(mainSha), mainSha);

  // 2. GitHub Pages: which commit it built, and whether the build succeeded.
  let pagesSha = null;
  try {
    const builds = await ghJson(`/repos/${REPO}/pages/builds?per_page=5`);
    const latest = builds[0];
    pagesSha = latest?.commit || null;
    record('pages build status', latest?.status === 'built', `${latest?.status} @ ${pagesSha?.slice(0, 7)} (${latest?.created_at})`);
    record('pages serves the release commit', pagesSha === mainSha, `pages=${pagesSha?.slice(0, 7) || 'unknown'} release=${mainSha.slice(0, 7)}`);
    const failed = builds.filter(b => b.status === 'errored');
    record('no failed pages builds in the last five', failed.length === 0, failed.length ? `${failed.length} errored: ${failed.map(b => b.commit?.slice(0, 7)).join(', ')}` : 'none');
  } catch (error) {
    const hint = /404/.test(error.message) && !TOKEN ? 'GitHub API needs a token (CI supplies GITHUB_TOKEN)' : error.message;
    record('pages build status', false, `unavailable: ${hint}`);
  }

  // 3. Static files: live bytes versus the bytes committed at the release.
  if (pagesSha) {
    for (const file of STATIC_FILES) {
      let expected = null;
      try { expected = sha256(execFileSync('git', ['show', `${pagesSha}:${file}`], { maxBuffer: 32 * 1024 * 1024 })); }
      catch { record(`static ${file}`, false, 'not present in the deployed commit'); continue; }
      try {
        const response = await fetch(`${BASE}/${file}`, { headers: { 'User-Agent': 'Mozilla/5.0 (deployment-verifier)' } });
        const body = Buffer.from(await response.arrayBuffer());
        const actual = sha256(body);
        record(`static ${file}`, response.ok && actual === expected, `${response.status} ${actual.slice(0, 12)} vs ${expected.slice(0, 12)}`);
      } catch (error) {
        record(`static ${file}`, false, error.message);
      }
    }
  }

  // 4. Origin split: the root must stay on Pages, the Worker must own only its routes.
  try {
    const home = await fetch(`${BASE}/`, { headers: { 'User-Agent': 'Mozilla/5.0 (deployment-verifier)' } });
    const origin = home.headers.get('x-github-request-id');
    record('home page is served by GitHub Pages', Boolean(origin), origin ? `x-github-request-id ${origin.slice(0, 8)}` : 'no Pages origin header — the Worker may be shadowing /');
  } catch (error) {
    record('home page is served by GitHub Pages', false, error.message);
  }

  // 5. The Worker's own version statement.
  let worker = null;
  try {
    const response = await fetch(`${BASE}/__version`, { headers: { 'User-Agent': 'wrldline-deploy-verifier' } });
    const type = response.headers.get('content-type') || '';
    if (!type.includes('json')) {
      record('worker /__version reachable', false, `${response.status} but ${type.split(';')[0] || 'unknown'} from the origin — the version route is not installed`);
      worker = null;
    } else {
      worker = await response.json();
      record('worker /__version reachable', response.ok, `${response.status} ${worker.environment}`);
    }
    if (worker) {
      record('worker reports a real commit', /^[0-9a-f]{7,40}$/.test(worker.commit), worker.commit);
      record('worker deployment is timestamped', worker.deployed_at !== 'unknown', worker.deployed_at);
    }
    if (worker && EXPECT_WORKER) record('worker matches the approved release', worker.commit === EXPECT_WORKER || worker.commit.startsWith(EXPECT_WORKER.slice(0, 7)), `worker=${String(worker.commit).slice(0, 7)} expected=${EXPECT_WORKER.slice(0, 7)}`);
    else if (worker) record('worker matches the release commit', worker.commit === mainSha, `worker=${String(worker.commit).slice(0, 7)} release=${mainSha.slice(0, 7)}`);
  } catch (error) {
    record('worker /__version reachable', false, error.message);
    worker = null;
  }

  // 6. Every Worker-owned route answers, and none of them is a Pages page.
  let sampleArticle = null;
  try {
    const xml = await (await fetch(`${BASE}/news-sitemap.xml`, { headers: { 'User-Agent': 'Mozilla/5.0 (deployment-verifier)' } })).text();
    sampleArticle = xml.match(/\/news\/([0-9a-f-]{36})/i)?.[1] || null;
  } catch { /* reported below through the sitemap check */ }

  const workerRoutes = ['/news/', '/section/politics', '/rss.xml', '/atom.xml', '/news-sitemap.xml', '/__version'];
  if (sampleArticle) workerRoutes.unshift(`/news/${sampleArticle}`);
  for (const route of workerRoutes) {
    try {
      const response = await fetch(`${BASE}${route}`, { headers: { 'User-Agent': 'Mozilla/5.0 (deployment-verifier)' } });
      const timing = response.headers.get('server-timing') || '';
      const fromWorker = timing.includes('wrldline;dur');
      const ok = response.ok && fromWorker;
      let note = `${response.status} ${fromWorker ? 'worker' : 'not-worker'}`;
      if (ok && worker?.commit && worker.commit !== 'unknown') {
        const stamped = response.headers.get('x-wrldline-commit');
        if (stamped !== worker.commit) { note += ` stale stamp ${stamped}`; }
      }
      record(`worker route ${route}`, ok, note);
    } catch (error) {
      record(`worker route ${route}`, false, error.message);
    }
  }

  // 7. Verdict.
  const failures = results.filter(r => !r.ok);
  const summary = {
    repository: REPO,
    base: BASE,
    release: mainSha,
    pages: pagesSha,
    worker: worker ? { commit: worker.commit, environment: worker.environment, deployed_at: worker.deployed_at } : null,
    checked_at: new Date().toISOString(),
    failures: failures.length,
    consistent: failures.length === 0,
    results
  };

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    const pad = Math.max(...results.map(r => r.name.length));
    console.log(`release ${mainSha.slice(0, 7)}  pages ${String(pagesSha).slice(0, 7)}  worker ${String(worker?.commit).slice(0, 7)} (${worker?.environment ?? 'n/a'})`);
    for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(pad)}  ${r.detail}`);
    console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
  }

  if (STRICT && failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(`verifier crashed: ${error.stack || error.message}`);
  process.exitCode = 1;
});

export { results, STATIC_FILES };
