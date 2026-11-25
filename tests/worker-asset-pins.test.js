// Worker-rendered pages reference repo assets through cache-busting pins that
// are hard-coded in worker.js. Two failures are possible and both are silent in
// production: an asset renamed in the repo but not in the Worker (404 styles),
// or one asset referenced with two different pins (half the pages keep old CSS).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'cloudflare/workers/wrldline-public/worker.js'), 'utf8');

function pinnedAssets() {
  const map = new Map();
  for (const match of SOURCE.matchAll(/\/([\w][\w.-]*\.(?:css|js|svg|png|webp))\?v=([\w.:-]+)/g)) {
    const [, file, pin] = match;
    if (!map.has(file)) map.set(file, new Set());
    map.get(file).add(pin);
  }
  return map;
}

test('the Worker pins at least the editorial stylesheets and scripts it renders', () => {
  const assets = pinnedAssets();
  for (const required of ['wrld.css', 'public-news.css', 'public-news.js']) {
    assert.ok(assets.has(required), `worker.js must reference ${required}`);
  }
});

test('every pinned asset exists in the repository', () => {
  for (const file of pinnedAssets().keys()) {
    const target = path.join(ROOT, file);
    assert.ok(fs.existsSync(target), `worker.js references /${file}, which is not in the repository`);
  }
});

test('each asset carries exactly one pin', () => {
  for (const [file, pins] of pinnedAssets()) {
    assert.equal(pins.size, 1, `${file} is referenced with conflicting pins: ${[...pins].join(', ')}`);
  }
});

test('pins are version strings, not accidentally empty or unquoted', () => {
  for (const [file, pins] of pinnedAssets()) {
    for (const pin of pins) {
      assert.match(pin, /^[a-z0-9][a-z0-9.:_-]{3,60}$/i, `${file} has an unusable pin: ${pin}`);
    }
  }
});

test('article pages pull the mobile quality stylesheet', () => {
  // Regression guard: production article pages shipped without quality.css for
  // weeks because the Worker bundle predated the repository change.
  assert.match(SOURCE, /quality\.css/, 'worker.js must link quality.css on article pages');
});
