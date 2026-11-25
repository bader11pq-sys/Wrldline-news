const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const UP = "supabase/migrations/20261126020000_newsroom_desk.sql";
const GRANT = "supabase/migrations/20261126030000_editor_role_helper_execute.sql";
const DOWN = "supabase/rollbacks/20261126020000_newsroom_desk.down.sql";
const ED = "11111111-1111-4111-8111-111111111111", READER = "22222222-2222-4222-8222-222222222222", ADMIN = "33333333-3333-4333-8333-333333333333";
const art = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated; grant execute on all functions in schema auth to anon,authenticated;
    grant usage on schema public to anon,authenticated;
    create function private.trust_is_editor() returns boolean language sql stable set search_path=pg_catalog as $$
      select auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'role','') in ('editor','admin'); $$;
    -- Production ships this revoked (20261115030000). Mirrored here so the harness cannot hide a
    -- policy that needs an EXECUTE privilege authenticated does not hold.
    revoke all on function private.trust_is_editor() from public, anon, authenticated;
    create function public.wrldline_source_key(n text, u text) returns text language sql immutable as $$ select lower(btrim(n)) $$;
    create table public.articles(id uuid primary key, title text not null, editorial_status text not null default 'draft', editorial_trust_status text default 'unconfirmed',
      trust_needs_review boolean not null default true, audience_lane text default 'pending', source_name text, source_url text, published_at timestamptz, corrected_at timestamptz);
    create table public.article_change_log(id uuid primary key default gen_random_uuid(), article_id uuid not null, changed_at timestamptz not null default now(), change_type text not null);
    create table public.article_updates(id uuid primary key default gen_random_uuid(), article_id uuid not null, kind text not null, created_at timestamptz not null default now());
    create table public.article_translations(id uuid primary key default gen_random_uuid(), translation_status text);
    create table public.source_policy(source_key text primary key, tier text not null);
    insert into auth.users values ('${ED}'),('${READER}'),('${ADMIN}');
    insert into public.source_policy values ('wire a','priority');
    insert into public.articles(id,title,editorial_status,editorial_trust_status,trust_needs_review,source_name,published_at,corrected_at) values
      ('${art(1)}','Published confirmed','published','confirmed',false,'Wire A', now() - interval '1 day', null),
      ('${art(2)}','Published developing','published','unconfirmed',true,'Wire A', now() - interval '2 days', now() - interval '1 day'),
      ('${art(3)}','Draft piece 100%','draft','unconfirmed',true,'Wire B', null, null),
      ('${art(4)}','In review','review','unconfirmed',true,null, null, null),
      ('${art(5)}','Old published','published','confirmed',false,'Wire C', now() - interval '60 days', null),
      ('${art(6)}','Draft piece 100x','draft','unconfirmed',true,'Wire B', null, null);
    insert into public.article_change_log(article_id,change_type) values ('${art(2)}','correction'),('${art(2)}','updated'),('${art(1)}','created');
    insert into public.article_updates(article_id,kind) values ('${art(2)}','correction');
    insert into public.article_translations(translation_status) values ('review'),('published');`);
  await db.exec(read(GRANT)); await db.exec(read(UP));
  return db;
}
const as = async (db, who, role) => {
  const claims = who ? JSON.stringify({ app_metadata: role ? { role } : {} }) : "";
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${who || ""}',false); select set_config('request.jwt.claims','${claims}',false); set role ${who ? "authenticated" : "anon"}`);
};

test("anonymous callers and ordinary readers cannot call any desk function", async () => {
  const db = await setup();
  await as(db, null);
  await assert.rejects(db.query("select public.editor_newsroom_overview()"), /permission denied/);
  await assert.rejects(db.query("select * from public.editor_article_queue()"), /permission denied/);
  await assert.rejects(db.query("select * from public.editor_source_summary()"), /permission denied/);
  await as(db, READER);
  await assert.rejects(db.query("select public.editor_newsroom_overview()"), /Editor\/admin required/);
  await assert.rejects(db.query("select * from public.editor_article_queue()"), /Editor\/admin required/);
  await assert.rejects(db.query("select * from public.editor_source_summary()"), /Editor\/admin required/);
  await as(db, READER, "subscriber");
  await assert.rejects(db.query("select public.editor_newsroom_overview()"), /Editor\/admin required/);
});

test("overview reports workflow counts, trust mix, corrections and the review backlog", async () => {
  const db = await setup(); await as(db, ED, "editor");
  const o = (await db.query("select public.editor_newsroom_overview(30) o")).rows[0].o;
  assert.deepEqual(o.by_status, { draft: 2, review: 1, published: 3 });
  assert.equal(o.review_backlog, 3);
  assert.equal(o.needs_trust_review, 1);
  assert.deepEqual(o.published_by_trust, { confirmed: 1, unconfirmed: 1 });
  assert.equal(o.published_by_day.reduce((s, r) => s + r.count, 0), 2);
  assert.equal(o.changes_by_type.correction, 1);
  assert.equal(o.story_updates_by_kind.correction, 1);
  assert.equal(o.translations_awaiting_review, 1);
  await as(db, ADMIN, "admin");
  assert.equal((await db.query("select public.editor_newsroom_overview(5000) o")).rows[0].o.window_days, 90);
});

test("queue filters by status and trust, searches literally, and puts the backlog first", async () => {
  const db = await setup(); await as(db, ED, "editor");
  const q = async (...a) => (await db.query("select * from public.editor_article_queue($1,$2,$3)", a)).rows;
  const all = await q(null, null, null);
  assert.equal(all.length, 6);
  assert.deepEqual(all.slice(0, 3).map((r) => r.editorial_status).sort(), ["draft", "draft", "review"]);
  assert.equal((await q("published", null, null)).length, 3);
  assert.equal((await q("published", "confirmed", null)).length, 2);
  assert.equal((await q(null, null, "100%")).length, 1, "percent is a literal, not a wildcard");
  assert.equal((await q(null, null, "wire b")).length, 2, "source search");
  const two = (await q(null, null, "developing"))[0];
  assert.equal(Number(two.change_count), 2); assert.equal(Number(two.correction_count), 1); assert.equal(Number(two.update_count), 1);
  await assert.rejects(q("archived", null, null), /invalid status/);
  await assert.rejects(q(null, "maybe", null), /invalid trust/);
});

test("queue paging is bounded", async () => {
  const db = await setup(); await as(db, ED, "editor");
  assert.equal((await db.query("select * from public.editor_article_queue(null,null,null,2,0)")).rows.length, 2);
  assert.equal((await db.query("select * from public.editor_article_queue(null,null,null,2,5)")).rows.length, 1);
  assert.equal((await db.query("select * from public.editor_article_queue(null,null,null,100000,0)")).rows.length, 6);
});

test("source summary joins policy tier and counts corrections inside the window", async () => {
  const db = await setup(); await as(db, ED, "editor");
  const rows = (await db.query("select * from public.editor_source_summary(30)")).rows;
  const a = rows.find((r) => r.source_name === "Wire A");
  assert.equal(a.policy_tier, "priority"); assert.equal(Number(a.published), 2); assert.equal(Number(a.confirmed), 1);
  assert.equal(Number(a.needs_review), 1); assert.equal(Number(a.corrections), 1);
  assert.equal(rows.some((r) => r.source_name === "Wire C"), false, "outside the window and not in the backlog");
  assert.ok(rows.some((r) => r.source_name === "(unattributed)"));
});

test("review notes: editors can add and read; readers and anonymous cannot; notes are append-only", async () => {
  const db = await setup(); await as(db, ED, "editor");
  await db.exec(`insert into public.article_review_notes(article_id,kind,body) values ('${art(3)}','request_changes','Needs a second source')`);
  await assert.rejects(db.exec(`insert into public.article_review_notes(article_id,body) values ('${art(3)}','x')`), /check/);
  await assert.rejects(db.exec(`insert into public.article_review_notes(article_id,body,created_by) values ('${art(3)}','spoofed author','${ADMIN}')`), /row-level security/);
  assert.equal((await db.query("select count(*)::int n from public.article_review_notes")).rows[0].n, 1);
  const open = (await db.query("select public.editor_newsroom_overview(30) o")).rows[0].o.open_review_requests;
  assert.equal(open, 1);
  const row = (await db.query("select note_count, last_note_kind from public.editor_article_queue('draft') where id = $1", [art(3)])).rows[0];
  assert.equal(Number(row.note_count), 1); assert.equal(row.last_note_kind, "request_changes");
  await assert.rejects(db.exec("update public.article_review_notes set body = 'edited text'"), /permission denied/);
  await assert.rejects(db.exec("delete from public.article_review_notes"), /permission denied/);
  await as(db, READER);
  await assert.rejects(db.exec(`insert into public.article_review_notes(article_id,body) values ('${art(3)}','reader note')`), /row-level security/);
  assert.equal((await db.query("select count(*)::int n from public.article_review_notes")).rows[0].n, 0, "RLS hides notes from readers");
  await as(db, null);
  await assert.rejects(db.query("select * from public.article_review_notes"), /permission denied/);
});

test("a later non-request note closes an open change request", async () => {
  const db = await setup(); await as(db, ED, "editor");
  await db.exec(`insert into public.article_review_notes(article_id,kind,body,created_at) values ('${art(3)}','request_changes','Add source', now() - interval '1 hour')`);
  await db.exec(`insert into public.article_review_notes(article_id,kind,body) values ('${art(3)}','note','Source added')`);
  assert.equal((await db.query("select public.editor_newsroom_overview(30) o")).rows[0].o.open_review_requests, 0);
});

test("the desk does not touch articles and rollback removes everything it added", async () => {
  const db = await setup(); await db.exec("reset role");
  assert.equal((await db.query("select count(*)::int n from public.articles")).rows[0].n, 6);
  await db.exec(read(GRANT)); await db.exec(read(UP)); // idempotent re-application
  await db.exec(read(DOWN));
  const left = await db.query(`select (select count(*)::int from pg_proc where proname like 'editor\\_%') f,
    (select count(*)::int from pg_tables where tablename = 'article_review_notes') t`);
  assert.deepEqual(left.rows[0], { f: 0, t: 0 });
  assert.equal((await db.query("select count(*)::int n from public.articles")).rows[0].n, 6);
  await db.exec(read(DOWN)); // rollback is re-runnable
});
