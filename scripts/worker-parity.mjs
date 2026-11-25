#!/usr/bin/env node
/**
 * Compare two deployments of the public Worker route by route.
 *
 * The intended use is the approval gate: deploy to preview, then diff preview
 * against production so a reviewer sees exactly which pages change before
 * promoting. The diff is normalised for the things that legitimately differ
 * between two requests (nonce, Server-Timing, absolute timestamps, the host
 * name), otherwise every page would look changed.
 *
 * Usage:
 *   node scripts/worker-parity.mjs --left=https://al-ghaib.us.ci --right=https://preview.example
 *   node scripts/worker-parity.mjs --left=... --right=... --markdown   # for a job summary
 *   node scripts/worker-parity.mjs --left=... --right=... --strict     # exit 1 when pages differ
 */
const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = name => args.includes(`--${name}`);

const LEFT = value('left', 'https://al-ghaib.us.ci').replace(/\/$/, '');
const RIGHT = value('right');
const MARKDOWN = flag('markdown');
const STRICT = flag('strict');
const LIMIT = Number(value('limit', '40'));

if (!RIGHT) {
  console.error('worker-parity: --right=<base url> is required');
  process.exit(2);
}

const ROUTES = [
  ['/__version', 'version'],
  ['/news/', 'news index'],
  ['/section/politics', 'section page'],
  ['/section/economy', 'section page'],
  ['/rss.xml', 'RSS'],
  ['/atom.xml', 'Atom'],
  ['/news-sitemap.xml', 'news sitemap'],
  ['/article-sitemap-1.xml', 'article sitemap']
];

function normalise(text, base) {
  return text
    .replace(/nonce-[a-f0-9]{16,}/gi, 'nonce-<redacted>')
    .replace(/"reported_at":\s*"[^"]+"/g, '"reported_at":"<redacted>"')
    .replace(/wrldline;dur=[0-9.]+/g, 'wrldline;dur=<ms>')
    .replace(/\b(?:news_article|section_feed|news_recent|news_sitemap_recent|get_public_article_trust|news_article_intelligence|related_articles);dur=[0-9.]+/g, '<rpc>;dur=<ms>')
    .replace(/\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, '<iso>')
    .replace(new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '<base>')
    .replace(/al-ghaib\.us\.ci/g, '<site>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/[ \t]+/g, ' ');
}

async function sample(base, route) {
  try {
    const response = await fetch(base + route, { headers: { 'User-Agent': 'Mozilla/5.0 (worker-parity)' }, redirect: 'manual' });
    const body = await response.text();
    return {
      status: response.status,
      location: (response.headers.get('location') || '').replace(base, '<base>'),
      type: (response.headers.get('content-type') || '').split(';')[0],
      commit: response.headers.get('x-wrldline-commit') || '',
      worker: (response.headers.get('server-timing') || '').includes('wrldline;dur'),
      body: normalise(body, base)
    };
  } catch (error) {
    return { status: 0, location: '', type: '', commit: '', worker: false, body: `request failed: ${error.message}` };
  }
}

function firstDifference(left, right) {
  const a = left.split('\n'), b = right.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      const clip = s => (s === undefined ? '<missing>' : s.length > 180 ? s.slice(0, 180) + '…' : s);
      return `line ${i + 1}: left ${clip(a[i])} | right ${clip(b[i])}`;
    }
  }
  return '';
}

const rows = [];
for (const [route, label] of ROUTES) {
  const [left, right] = await Promise.all([sample(LEFT, route), sample(RIGHT, route)]);
  const same = left.status === right.status && left.location === right.location && left.body === right.body;
  rows.push({ route, label, same, left, right, difference: same ? '' : firstDifference(left.body, right.body) });
}

const changed = rows.filter(r => !r.same);

if (MARKDOWN) {
  console.log('| Route | Left | Right | Same output | Note |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const note = (r.difference || '').slice(0, LIMIT * 4).replace(/\|/g, '\\|');
    console.log(`| \`${r.route}\` | ${r.left.status} | ${r.right.status} | ${r.same ? 'yes' : '**no**'} | ${note || '—'} |`);
  }
  console.log(`\n${changed.length} of ${rows.length} routes differ.`);
} else {
  console.log(`left  ${LEFT}\nright ${RIGHT}\n`);
  for (const r of rows) {
    console.log(`${r.same ? 'same' : 'DIFF'}  ${r.route.padEnd(24)} left=${r.left.status}/${r.left.commit.slice(0, 7) || 'nocommit'} right=${r.right.status}/${r.right.commit.slice(0, 7) || 'nocommit'}`);
    if (!r.same) console.log(`      ${r.difference.slice(0, LIMIT * 6)}`);
  }
  console.log(`\n${changed.length} of ${rows.length} routes differ`);
}

if (STRICT && changed.length) process.exitCode = 1;
