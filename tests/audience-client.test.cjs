const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../analytics.js'), 'utf8');
const articleId = '33333333-3333-4333-8333-333333333333';
function fixture(options = {}) {
  const dom = new JSDOM('<!doctype html><html lang="ar"><head></head><body><button data-analytics-settings>Settings</button><article data-article-id="' + articleId + '" data-category="politics">Private title</article></body></html>', { url: options.url || 'https://al-ghaib.us.ci/', referrer: options.referrer || 'https://www.google.com/search?q=private-email%40example.test', runScripts: 'outside-only' });
  const w = dom.window;
  let time = Date.parse('2026-11-15T04:00:00.000Z'), focus = true, hidden = false, sequence = 0;
  const timers = new Map(), calls = [];
  const NativeDate = w.Date;
  w.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } };
  Object.defineProperty(w.performance, 'now', { value: () => time });
  Object.defineProperty(w.crypto, 'randomUUID', { value: randomUUID });
  Object.defineProperty(w.document, 'readyState', { get: () => 'complete' });
  Object.defineProperty(w.document, 'hidden', { get: () => hidden });
  w.document.hasFocus = () => focus;
  w.matchMedia = () => ({ matches: false });
  w.setInterval = (fn, period) => { const id = ++sequence; timers.set(id, { fn, period, next: time + period }); return id; };
  w.clearInterval = id => timers.delete(id);
  w.fetch = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ accepted: 1 }) }; };
  w.WRLDLINE_ANALYTICS_CONFIG = { enabled: true, endpoint: 'https://collector.invalid/audience-events', browserRetentionDays: 7, sessionIdleMinutes: 30 };
  const article = w.document.querySelector('article');
  article.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 500 });
  function advance(ms) {
    const end = time + ms;
    while (true) {
      const next = [...timers.entries()].sort((a, b) => a[1].next - b[1].next)[0];
      if (!next || next[1].next > end) break;
      time = next[1].next; next[1].next += next[1].period; next[1].fn();
    }
    time = end;
  }
  w.eval(source);
  return { w, dom, calls, timers, article, advance, focus: value => { focus = value; }, hidden: value => { hidden = value; w.document.dispatchEvent(new w.Event('visibilitychange')); }, jump: ms => { time += ms; }, events: () => calls.flatMap(call => call.body.events || []), close: () => { w.WRLDLINE_ANALYTICS.withdraw(); dom.window.close(); } };
}
test('no pre-consent queue, identifiers, observers or transport; rejection sends nothing', () => {
  const f = fixture(), api = f.w.WRLDLINE_ANALYTICS;
  assert.equal(api.track('plus_interest', { plan: 'monthly' }), false);
  f.advance(15000); assert.equal(f.calls.length, 0); assert.equal(f.timers.size, 0);
  assert.equal(f.w.sessionStorage.length, 0); assert.equal(f.w.localStorage.length, 0);
  api.setConsent('denied'); api.track('page_view'); api.flush(); assert.equal(f.calls.length, 0);
  api.setConsent('granted'); api.flush();
  assert.deepEqual(f.events().map(event => event.name), ['page_view']);
  assert.equal(f.events()[0].browser_id, undefined);
  assert.equal(f.w.localStorage.getItem('wrldline:analytics-browser-v2'), null);
  f.close();
});
test('acceptance never transports free text, URL/query, title, emails or client-paid conversion', () => {
  const f = fixture(), api = f.w.WRLDLINE_ANALYTICS;
  api.setConsent('granted'); api.track('search', { has_query: true, results_count: 10, query: 'private@example.test', referrer: 'https://private.test/path?q=secret', title: 'Private title' });
  assert.equal(api.track('plus_paid', { paid: true }), false); api.flush();
  const body = JSON.stringify(f.calls.map(call => call.body));
  assert(!body.includes('private@example.test')); assert(!body.includes('secret')); assert(!body.includes('Private title')); assert(!body.includes('google.com'));
  assert.equal(f.events()[0].referrer_category, 'search');
  assert.equal(f.calls[0].init.referrerPolicy, 'no-referrer'); assert.equal(f.calls[0].init.credentials, 'omit');
  assert.equal(f.calls[0].init.keepalive, undefined); f.close();
});
test('withdrawal clears pending events/IDs, aborts transport, removes timers and can reopen settings', () => {
  const f = fixture(), api = f.w.WRLDLINE_ANALYTICS;
  f.w.fetch = (_url, init) => { f.calls.push({ init }); return new Promise(() => {}); };
  api.setConsent('granted', { returning: true }); api.flush();
  assert(f.w.localStorage.getItem('wrldline:analytics-browser-v2')); assert(f.calls[0].init.signal);
  api.track('plus_interest', { plan: 'monthly' }); api.withdraw();
  assert.equal(f.calls[0].init.signal.aborted, true); assert.equal(f.timers.size, 0);
  assert.equal(f.w.localStorage.getItem('wrldline:analytics-browser-v2'), null); assert.equal(f.w.sessionStorage.getItem('wrldline:analytics-session-v2'), null);
  assert.equal(api.track('page_view'), false); api.flush(); assert.equal(f.calls.length, 1);
  f.w.document.querySelector('[data-analytics-settings]').click(); assert(f.w.document.querySelector('.wrldline-consent')); f.close();
});
test('canonical SSR article automatically measures active visible time, pauses hidden/unfocused, and ignores title', () => {
  const f = fixture({ url: 'https://al-ghaib.us.ci/news/' + articleId }), api = f.w.WRLDLINE_ANALYTICS;
  api.setConsent('granted'); f.advance(16000); api.flush();
  assert.equal(f.events().filter(event => event.name === 'view_article').length, 1);
  const initial = f.events().filter(event => event.name === 'article_read').reduce((sum, event) => sum + event.active_ms, 0);
  assert(initial >= 15000 && initial <= 16000);
  f.hidden(true); const paused = f.events().filter(event => event.name === 'article_read').reduce((sum, event) => sum + event.active_ms, 0);
  f.advance(10000); api.flush();
  assert.equal(f.events().filter(event => event.name === 'article_read').reduce((sum, event) => sum + event.active_ms, 0), paused);
  f.focus(false); f.hidden(false); f.advance(10000); api.flush();
  assert.equal(f.events().filter(event => event.name === 'article_read').reduce((sum, event) => sum + event.active_ms, 0), paused);
  assert(f.events().every(event => !('title' in event))); f.close();
});
test('opt-in browser identifier rotates after seven days; session rotates after idle; email referrers classified correctly', () => {
  const f = fixture({ referrer: 'https://mail.google.com/mail/u/0/?email=private@example.test' }), api = f.w.WRLDLINE_ANALYTICS;
  api.setConsent('granted', { returning: true }); api.flush();
  const first = f.events()[0]; assert(first.browser_id); assert.equal(first.referrer_category, 'email');
  f.jump(8 * 86400000); api.track('page_view'); api.flush(); const last = f.events().at(-1);
  assert.notEqual(first.browser_id, last.browser_id); assert.notEqual(first.session_id, last.session_id); f.close();
});
test('separate returning permission disabled clears old identifier and legacy blanket consent is not reused', () => {
  const f = fixture(), api = f.w.WRLDLINE_ANALYTICS;
  api.setConsent('granted', { returning: true }); api.flush(); assert(f.events()[0].browser_id);
  api.setConsent('granted', { returning: false }); api.flush(); assert.equal(f.events().at(-1).browser_id, undefined);
  assert.equal(f.w.localStorage.getItem('wrldline:analytics-browser-v2'), null); f.close();
});
