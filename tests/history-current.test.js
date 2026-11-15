const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'history.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map(match => match[1].split('?')[0]);
test('current history encyclopedia modules exist and load before application initialization', () => {
  const required = ['history-data.js','history-entities-a.js','history-entities-b.js','history-entities-c.js','history-events.js','history-learning.js','history-app.js'];
  let previous = -1;
  for (const file of required) {
    assert.ok(fs.existsSync(path.join(root, file)), file + ' missing');
    const index = scripts.indexOf(file);
    assert.ok(index > previous, file + ' load order invalid'); previous = index;
  }
});
test('history uses the pinned SDK before current app without resurrecting unused modules', () => {
  const sdk = scripts.indexOf('/vendor/supabase-2.119.0.js');
  assert.ok(sdk >= 0 && sdk < scripts.indexOf('history-app.js'));
  assert.ok(!scripts.includes('history-expansion.js'));
  assert.ok(!scripts.includes('history-research.js'));
});
test('retained research database migrations and seed remain intact', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261113203000_linked_historical_research_catalog.sql'),'utf8');
  const seed = fs.readFileSync(path.join(root, 'supabase/seed/history_catalog.sql'),'utf8');
  assert.ok(migration.includes('history_event_sources'));
  assert.ok(migration.includes('history_comparison_observations'));
  assert.ok(seed.includes('history_events'));
});
