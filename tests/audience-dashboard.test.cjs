const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../audience.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../audience.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const data = { generated_at: '2026-11-15T04:00:00.000Z', summary: { measured_sessions: 2, reading_sessions: 1, active_seconds: 30, returning_opt_in_browsers: 0, opt_in_browsers: 1, engagement_events: 1 }, top_news: [{ article_id: '33333333-3333-4333-8333-333333333333', title: '<img src=x onerror=alert(1)> Fixture', views: 1, read_sessions: 1, active_seconds: 30, avg_active_seconds: 30 }], categories: [], arrivals: [], engagement: [], funnel: { plus_interest_sessions: 1, account_signup_sessions: 1, newsletter_signup_sessions: 0, verified_active_plus_sessions: 0 }, billing_snapshot: { active_provider_plus: 1, trialing_plus: 0, paid_conversion_available: false }, retention: { cron_installed: false } };
function setup(role) {
  const dom = new JSDOM(html, { url: 'https://al-ghaib.us.ci/audience.html', runScripts: 'outside-only' }), w = dom.window;
  let onAuth, rpcCalls = 0, roleValue = role;
  Object.defineProperty(w.document, 'readyState', { get: () => 'complete' });
  w.supabase = { createClient: () => ({ auth: { getUser: async () => ({ data: { user: roleValue ? { app_metadata: { role: roleValue }, user_metadata: { role: 'admin' } } : null }, error: null }), onAuthStateChange: callback => { onAuth = callback; }, signOut: async () => { roleValue = null; onAuth('SIGNED_OUT'); } }, rpc: async (name, args) => { rpcCalls++; assert.equal(name, 'audience_dashboard'); assert.equal(args.p_days, 7); return { data, error: null }; } }) };
  w.eval(js);
  return { w, dom, rpcCalls: () => rpcCalls, auth: event => onAuth(event) };
}
test('no anonymous/ordinary-user aggregate calls; user_metadata admin is never trusted', async () => {
  for (const role of [null, 'reader']) {
    const f = setup(role); await tick(); await tick();
    assert.equal(f.rpcCalls(), 0); assert.equal(f.w.document.getElementById('audienceDashboard').hidden, true); assert.equal(f.w.document.getElementById('audienceAccess').hidden, false); f.dom.window.close();
  }
});
test('editor loads only secure RPC, safely renders titles/canonical links, and clears on logout', async () => {
  const f = setup('editor'); await tick(); await tick();
  assert.equal(f.rpcCalls(), 1); assert.equal(f.w.document.getElementById('audienceDashboard').hidden, false);
  assert.equal(f.w.document.querySelector('#audienceNews img'), null);
  assert.equal(f.w.document.querySelector('#audienceNews a').pathname, '/news/33333333-3333-4333-8333-333333333333');
  assert(f.w.document.getElementById('audienceFunnel').textContent.includes('غير متاح'));
  f.auth('SIGNED_OUT'); assert.equal(f.w.document.getElementById('audienceDashboard').hidden, true); assert.equal(f.w.document.getElementById('audienceNews').children.length, 0); f.dom.window.close();
});
