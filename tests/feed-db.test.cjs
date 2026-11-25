const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const UP = "supabase/migrations/20261126010000_personalized_feed.sql";
const DOWN = "supabase/rollbacks/20261126010000_personalized_feed.down.sql";
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const art = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on all functions in schema auth to anon,authenticated;
    grant usage on schema public to anon,authenticated;
    create table public.articles(id uuid primary key, editorial_status text not null default 'published');
    alter table public.articles enable row level security;
    create policy pub on public.articles for select to authenticated using (editorial_status = 'published');
    grant select on public.articles to authenticated;
    create table public.user_follows(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
      target_type text not null check (target_type in ('category','country')), target_value text not null, unique(user_id,target_type,target_value));
    alter table public.user_follows enable row level security;
    create policy own_f on public.user_follows for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
    grant select, insert, delete on public.user_follows to authenticated;
    create table public.user_preferences(user_id uuid primary key references auth.users(id) on delete cascade, followed_categories text[] not null default '{}');
    alter table public.user_preferences enable row level security;
    create policy own_p on public.user_preferences for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
    grant select, insert, update on public.user_preferences to authenticated;
    insert into auth.users values ('${U1}'),('${U2}');
    insert into public.user_preferences(user_id) values ('${U1}'),('${U2}');
    insert into public.articles(id, editorial_status) select ('00000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid, 'published' from generate_series(1,600) g;
    insert into public.articles(id, editorial_status) values ('${art(9000)}','draft');`);
  await db.exec(read(UP));
  return db;
}
const as = async (db, user) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user || ""}',false); set role ${user ? "authenticated" : "anon"}`);
};

test("migration is idempotent where re-applicable and keeps existing follows", async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table public.articles(id uuid primary key, editorial_status text);
    create table public.user_follows(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), target_type text not null check (target_type in ('category','country')), target_value text not null);
    create table public.user_preferences(user_id uuid primary key references auth.users(id));
    insert into auth.users values ('${U1}'); insert into public.user_follows(user_id,target_type,target_value) values ('${U1}','category','economy');`);
  await db.exec(read(UP)); await db.exec(read(UP));
  assert.equal((await db.query("select count(*)::int n from public.user_follows")).rows[0].n, 1);
});

test("topic and interest follows are accepted; unknown types and per-user limit are rejected", async () => {
  const db = await setup(); await as(db, U1);
  await db.exec(`insert into public.user_follows(user_id,target_type,target_value) values ('${U1}','topic','ai'),('${U1}','interest','solar')`);
  await assert.rejects(db.exec(`insert into public.user_follows(user_id,target_type,target_value) values ('${U1}','device','x')`), /check/);
  await db.exec(`insert into public.user_follows(user_id,target_type,target_value) select '${U1}','interest','i'||g from generate_series(1,198) g`);
  await assert.rejects(db.exec(`insert into public.user_follows(user_id,target_type,target_value) values ('${U1}','interest','overflow')`), /follow limit/);
});

test("reading is NOT recorded without opt-in, and is recorded after opt-in", async () => {
  const db = await setup(); await as(db, U1);
  assert.equal((await db.query(`select public.record_article_read('${art(1)}') r`)).rows[0].r, false);
  assert.equal((await db.query("select count(*)::int n from public.user_reading_history")).rows[0].n, 0);
  await db.exec(`update public.user_preferences set personalize_from_history = true where user_id = '${U1}'`);
  assert.equal((await db.query(`select public.record_article_read('${art(1)}') r`)).rows[0].r, true);
  await db.exec(`select public.record_article_read('${art(1)}')`);
  const r = (await db.query("select read_count from public.user_reading_history")).rows;
  assert.equal(r.length, 1); assert.equal(r[0].read_count, 2);
});

test("unpublished articles and anonymous callers are never recorded; direct writes are blocked", async () => {
  const db = await setup(); await as(db, U1);
  await db.exec(`update public.user_preferences set personalize_from_history = true where user_id = '${U1}'`);
  assert.equal((await db.query(`select public.record_article_read('${art(9000)}') r`)).rows[0].r, false);
  await assert.rejects(db.exec(`insert into public.user_reading_history(user_id,article_id) values ('${U1}','${art(2)}')`), /permission denied/);
  await as(db, null);
  await assert.rejects(db.query(`select public.record_article_read('${art(1)}')`), /permission denied/);
  await assert.rejects(db.query("select * from public.user_reading_history"), /permission denied/);
});

test("readers see and delete only their own history; the cap keeps the newest 500", async () => {
  const db = await setup(); await as(db, U1);
  await db.exec(`update public.user_preferences set personalize_from_history = true where user_id = '${U1}'`);
  for (let i = 1; i <= 505; i++) await db.query(`select public.record_article_read('${art(i)}')`);
  assert.equal((await db.query("select count(*)::int n from public.user_reading_history")).rows[0].n, 500);
  await as(db, U2);
  assert.equal((await db.query("select count(*)::int n from public.user_reading_history")).rows[0].n, 0);
  await db.exec(`delete from public.user_reading_history`);
  await as(db, U1);
  assert.equal((await db.query("select count(*)::int n from public.user_reading_history")).rows[0].n, 500);
  assert.equal((await db.query("select public.clear_reading_history() n")).rows[0].n, 500);
});

test("withdrawing consent wipes stored history", async () => {
  const db = await setup(); await as(db, U1);
  await db.exec(`update public.user_preferences set personalize_from_history = true where user_id = '${U1}'`);
  await db.exec(`select public.record_article_read('${art(1)}'), public.record_article_read('${art(2)}')`);
  await db.exec(`update public.user_preferences set personalize_from_history = false where user_id = '${U1}'`);
  assert.equal((await db.query("select count(*)::int n from public.user_reading_history")).rows[0].n, 0);
});

test("rollback restores the original schema and removes new objects", async () => {
  const db = await setup();
  await db.exec(`insert into public.user_follows(user_id,target_type,target_value) values ('${U1}','topic','ai'),('${U1}','category','economy')`);
  await db.exec(read(DOWN));
  const left = (await db.query("select user_follows_target_type from (select target_type user_follows_target_type from public.user_follows) s")).rows;
  assert.deepEqual(left.map((r) => r.user_follows_target_type), ["category"]);
  assert.equal((await db.query("select to_regclass('public.user_reading_history') t")).rows[0].t, null);
  assert.equal((await db.query("select count(*)::int n from pg_proc where proname in ('record_article_read','clear_reading_history')")).rows[0].n, 0);
  await assert.rejects(db.exec(`insert into public.user_follows(user_id,target_type,target_value) values ('${U1}','topic','x')`), /check/);
  await db.exec(read(UP)); // re-apply after rollback works
});
