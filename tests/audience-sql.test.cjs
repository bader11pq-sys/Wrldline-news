const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const article = '33333333-3333-4333-8333-333333333333';
const session = '22222222-2222-4222-8222-222222222222';
const browser = '44444444-4444-4444-8444-444444444444';
const user = '55555555-5555-4555-8555-555555555555';
const { randomUUID } = require('node:crypto');
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    create table public.articles(id uuid primary key,title text,category text,editorial_status text);
    create table public.subscriptions(user_id uuid,plan text,status text,stripe_subscription_id text,current_period_end timestamptz);
    insert into public.articles values('${article}','Fixture headline','politics','published'),('66666666-6666-4666-8666-666666666666','Private fixture','security','review');
    insert into public.subscriptions values('${user}','plus','active','sub_fixture_verified',now()+interval '1 day');`);
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261115040000_audience_analytics.sql'), 'utf8'));
  return db;
}
async function claims(db, role = 'service_role', editorial = null) {
  await db.query(`select set_config('request.jwt.claims',$1,false)`, [JSON.stringify({ role, sub: role === 'anon' ? undefined : user, app_metadata: editorial ? { role: editorial } : {} })]);
}
function event(name = 'page_view', extra = {}) {
  return { event_id: randomUUID(), name, occurred_at: new Date().toISOString(), session_id: session, browser_id: browser, page: 'news', device_type: 'desktop', locale: 'ar', referrer_category: 'search', ...extra };
}
async function ingest(db, events) { return (await db.query('select public.audience_ingest_events($1::jsonb) as result', [JSON.stringify(events)])).rows[0].result; }
async function dashboard(db) { await claims(db, 'authenticated', 'editor'); return (await db.query('select public.audience_dashboard(7) as result')).rows[0].result; }
test('isolated migration executes; no anonymous/authenticated raw reads; server signed editor role required', async () => {
  const db = await setup();
  try {
    await claims(db, 'anon'); await db.exec('set role anon');
    await assert.rejects(db.query('select event_id from public.audience_events limit 1'), /permission denied/);
    await assert.rejects(db.query('select public.audience_dashboard(7)'), /permission denied/);
    await db.exec('reset role'); await claims(db, 'authenticated'); await db.exec('set role authenticated');
    await assert.rejects(db.query('select event_id from public.audience_events limit 1'), /permission denied/);
    await assert.rejects(db.query('select public.audience_dashboard(7)'), /Editorial role required/);
    await assert.rejects(db.query('select public.audience_ingest_events(\'[]\'::jsonb)'), /permission denied/);
    await db.exec('reset role'); await claims(db, 'authenticated', 'editor'); await db.exec('set role authenticated');
    const data = (await db.query('select public.audience_dashboard(7) as result')).rows[0].result;
    assert.equal(data.summary.measured_sessions, 0); assert.equal(data.billing_snapshot.active_provider_plus, 1);
    await assert.rejects(db.query('select public.audience_dashboard(365)'), /Choose 1, 7 or 30 days/);
  } finally { await db.close(); }
});
test('dedupe event IDs, reject free text, ignore unpublished/nonexistent articles, derive category, accurate read-session averages', async () => {
  const db = await setup();
  try {
    await claims(db);
    const view = event('view_article', { article_id: article, category: 'security' });
    assert.equal((await ingest(db, [view])).accepted, 1); assert.equal((await ingest(db, [view])).accepted, 0);
    assert.equal((await ingest(db, [event('view_article', { article_id: '66666666-6666-4666-8666-666666666666' })])).accepted, 0);
    assert.equal((await ingest(db, [event('view_article', { article_id: '77777777-7777-4777-8777-777777777777' })])).accepted, 0);
    await assert.rejects(ingest(db, [event('search', { title: 'PII is not accepted' })]), /invalid_audience_payload/);
    await ingest(db, [event('article_read', { article_id: article, active_ms: 15000 }), event('article_read', { article_id: article, active_ms: 15000 }), event('engagement', { article_id: article, engagement_type: 'share' }), event('plus_interest', { plan: 'monthly' }), event('signup', { signup_type: 'account' })]);
    const data = await dashboard(db);
    assert.equal(data.summary.measured_sessions, 1); assert.equal(data.summary.active_seconds, 30);
    assert.equal(data.top_news[0].avg_active_seconds, 30); assert.equal(data.top_news[0].read_sessions, 1); assert.equal(data.top_news[0].views, 1);
    assert.equal(data.categories[0].category, 'politics'); assert.equal(data.funnel.plus_interest_sessions, 1); assert.equal(data.funnel.account_signup_sessions, 1);
    assert.equal(data.funnel.paid_receipt_verified, false);
    assert(!JSON.stringify(data).includes(user)); assert(!JSON.stringify(data).includes('sub_fixture_verified'));
  } finally { await db.close(); }
});
test('atomic session/global caps enforce bounded writes even across edge isolates', async () => {
  const db = await setup();
  try {
    await claims(db);
    for (let i = 0; i < 12; i++) await ingest(db, Array.from({ length: 10 }, () => event()));
    await assert.rejects(ingest(db, [event()]), /audience_rate_limit/);
    assert.equal((await db.query('select count(*)::int as n from public.audience_events')).rows[0].n, 120);
    await db.exec(`update public.audience_rate_limits set events=5000 where bucket='global'`);
    await assert.rejects(ingest(db, [event('page_view', { session_id: randomUUID() })]), /audience_rate_limit/);
  } finally { await db.close(); }
});
test('PLUS verifies only trusted active provider-linked nonexpired subscriptions; trialing is not paid; dedupes subscription', async () => {
  const db = await setup();
  try {
    await claims(db);
    const verify = async () => (await db.query('select public.audience_verify_plus($1,$2,$3,$4) as result', [user, randomUUID(), session, browser])).rows[0].result;
    const first = await verify(); assert.equal(first.verified, true); assert.equal(first.new_verification, true); assert.equal(first.paid_receipt_verified, false);
    assert.equal((await verify()).new_verification, false);
    await db.exec(`update public.subscriptions set status='trialing'`); assert.equal((await verify()).verified, false);
    await db.exec(`update public.subscriptions set status='active',current_period_end=now()-interval '1 day'`); assert.equal((await verify()).verified, false);
    await db.exec(`update public.subscriptions set current_period_end=now()+interval '1 day',stripe_subscription_id=null`); assert.equal((await verify()).verified, false);
    const data = await dashboard(db); assert.equal(data.funnel.verified_active_plus_sessions, 1); assert.equal(data.billing_snapshot.paid_conversion_available, false);
  } finally { await db.close(); }
});
test('retention deletes old rows, scrubs seven-day browser linkage, prunes budgets; returning scoped only to opt-in IDs', async () => {
  const db = await setup();
  try {
    await claims(db);
    await ingest(db, [event(), event('page_view', { session_id: session })]);
    await ingest(db, [event('page_view', { session_id: randomUUID() })]);
    let data = await dashboard(db); assert.equal(data.summary.returning_opt_in_browsers, 1);
    await db.exec(`update public.audience_events set received_at=now()-interval '8 days'; insert into public.audience_rate_limits values('old',now()-interval '3 hours',1); select public.audience_prune();`);
    assert.equal((await db.query('select count(browser_id)::int as n from public.audience_events')).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from public.audience_rate_limits where bucket='old'")).rows[0].n, 0);
    await db.exec(`update public.audience_events set received_at=now()-interval '31 days'; select public.audience_prune();`);
    assert.equal((await db.query('select count(*)::int as n from public.audience_events')).rows[0].n, 0);
  } finally { await db.close(); }
});
