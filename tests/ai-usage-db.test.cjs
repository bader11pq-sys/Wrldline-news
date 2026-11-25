const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const UP = 'supabase/migrations/20261125180000_ai_usage_log.sql';
const DOWN = 'supabase/rollbacks/20261125180000_ai_usage_log.down.sql';

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    grant usage on schema public to anon,authenticated,service_role;
    -- simulate production: cooldown table already exists with a row
    create table public.ai_provider_cooldowns(provider text primary key, disabled_until timestamptz not null, reason text, updated_at timestamptz not null default now());
    insert into public.ai_provider_cooldowns(provider,disabled_until) values('gemini', now()+interval '1 hour');`);
  await db.exec(read(UP));
  return db;
}
const as = async (db, role, appRole) => {
  await db.exec(`reset role; select set_config('request.jwt.claims','${JSON.stringify({ role, app_metadata: appRole ? { role: appRole } : {} })}',false); set role ${role}`);
};
const row = `insert into public.ai_usage_log(function_name,task,provider,ok,cost_usd,input_tokens,output_tokens,latency_ms) values('translate-articles','translate','groq',true,0.0123,100,50,420)`;

test('migration is idempotent and preserves pre-existing cooldown data', async () => {
  const db = await setup();
  await db.exec(read(UP));
  const r = await db.query('select count(*)::int n from public.ai_provider_cooldowns');
  assert.equal(r.rows[0].n, 1);
});
test('service role writes; anon and plain users cannot read or write; editors can read only', async () => {
  const db = await setup();
  await db.exec(`grant insert, select on public.ai_usage_log to service_role`);
  await as(db, 'service_role'); await db.exec(row);
  await as(db, 'anon');
  await assert.rejects(db.query('select * from public.ai_usage_log'), /permission denied/);
  await assert.rejects(db.exec(row), /permission denied/);
  await as(db, 'authenticated');
  assert.equal((await db.query('select * from public.ai_usage_log')).rows.length, 0, 'plain user sees nothing (RLS)');
  await assert.rejects(db.exec(row), /permission denied/);
  await as(db, 'authenticated', 'editor');
  assert.equal((await db.query('select * from public.ai_usage_log')).rows.length, 1);
  await assert.rejects(db.exec(row), /permission denied/);
  const d = await db.query('select calls, cost_usd::text c from public.ai_usage_daily');
  assert.equal(d.rows[0].calls, 1); assert.equal(d.rows[0].c, '0.012300');
});
test('check constraints reject malformed rows', async () => {
  const db = await setup();
  await assert.rejects(db.exec(`insert into public.ai_usage_log(function_name,task,provider,ok,error_kind) values('f','t','p',false,'weird')`), /check/i);
  await assert.rejects(db.exec(`insert into public.ai_usage_log(function_name,task,provider,ok,cost_usd) values('f','t','p',true,-1)`), /check/i);
  await assert.rejects(db.exec(`insert into public.ai_usage_log(function_name,task,provider,ok,message) values('f','t','p',false,'${'x'.repeat(301)}')`), /check/i);
});
test('prune enforces a 30-day floor and only deletes old rows', async () => {
  const db = await setup();
  await db.exec(row); await db.exec(`insert into public.ai_usage_log(function_name,task,provider,ok,created_at) values('f','t','p',true, now()-interval '400 days')`);
  await assert.rejects(db.query(`select public.ai_usage_prune(interval '1 day')`), /at least 30 days/);
  assert.equal((await db.query(`select public.ai_usage_prune()`)).rows[0].ai_usage_prune, 1);
  assert.equal((await db.query('select count(*)::int n from public.ai_usage_log')).rows[0].n, 1);
  await as(db, 'authenticated');
  await assert.rejects(db.query(`select public.ai_usage_prune()`), /permission denied/);
});
test('rollback removes only new objects, keeps production cooldown table, and migration can be re-applied', async () => {
  const db = await setup();
  await db.exec(read(DOWN));
  const names = (await db.query(`select to_regclass('public.ai_usage_log') l, to_regclass('public.ai_usage_daily') v, to_regclass('public.ai_provider_cooldowns') c`)).rows[0];
  assert.equal(names.l, null); assert.equal(names.v, null); assert.ok(names.c);
  assert.equal((await db.query('select count(*)::int n from public.ai_provider_cooldowns')).rows[0].n, 1);
  await db.exec(read(DOWN)); // idempotent
  await db.exec(read(UP));
  assert.ok((await db.query(`select to_regclass('public.ai_usage_log') l`)).rows[0].l);
});
