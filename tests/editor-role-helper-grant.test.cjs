const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const exists = (p) => fs.existsSync(path.join(__dirname, "..", p));

// Production ships the helper revoked (20261115030000_editorial_trust.sql) while editor RLS
// policies call it. This suite reproduces that exact grant state, so it fails if a policy ever
// depends on an EXECUTE privilege authenticated does not have.
const TRUST = "supabase/migrations/20261115030000_editorial_trust.sql";
const UPDATES = "supabase/migrations/20261125170000_story_updates.sql";
const DESK = "supabase/migrations/20261126020000_newsroom_desk.sql";
const FIX = "supabase/migrations/20261126030000_editor_role_helper_execute.sql";
const UNDO = "supabase/rollbacks/20261126030000_editor_role_helper_execute.down.sql";
const ED = "11111111-1111-4111-8111-111111111111", READER = "22222222-2222-4222-8222-222222222222";
const ART = "00000000-0000-4000-8000-000000000001";

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on all functions in schema auth to anon,authenticated;
    grant usage on schema public to anon,authenticated;
    create table public.articles(id uuid primary key, title text not null, corrected_at timestamptz, correction_note text,
      editorial_status text not null default 'published', published_at timestamptz default now() - interval '1 hour', audience_lane text default 'world');
    insert into public.articles(id,title) values ('${ART}','Story');
    insert into auth.users values ('${ED}'),('${READER}');`);
  // The shipped helper definition and its shipped privilege state.
  const trust = read(TRUST);
  const def = trust.slice(trust.indexOf("create or replace function private.trust_is_editor()"));
  await db.exec(def.slice(0, def.indexOf("$$;") + 3));
  await db.exec("grant execute on function private.trust_is_editor() to anon, authenticated;");
  await db.exec("revoke all on function private.trust_is_editor() from public, anon, authenticated;");
  await db.exec(read(UPDATES));
  if (exists(DESK)) await db.exec(read(DESK));
  return db;
}
const as = async (db, who, role) => {
  const claims = who ? JSON.stringify({ app_metadata: role ? { role } : {} }) : "";
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${who || ""}',false); select set_config('request.jwt.claims','${claims}',false); set role ${who ? "authenticated" : "anon"}`);
};
const applyFix = async (db) => { await db.exec(read(FIX)); await db.exec("reset role"); };

test("production grant state: editor policies fail with 42501 instead of returning rows", async () => {
  const db = await setup(); await as(db, ED, "editor");
  await assert.rejects(db.query("select * from public.article_updates"), /permission denied for function/i);
  await assert.rejects(db.query(`insert into public.article_updates(article_id,kind,body) values ('${ART}','update','hello there')`), /permission denied for function/i);
});

test("the fix migration makes every editor policy evaluable, without widening data access", async () => {
  const db = await setup(); await applyFix(db); await as(db, ED, "editor");
  await db.query(`insert into public.article_updates(article_id,kind,body) values ('${ART}','update','first note')`);
  assert.equal((await db.query("select * from public.article_updates")).rows.length, 1);
  await db.query("delete from public.article_updates");
  assert.equal((await db.query("select * from public.article_updates")).rows.length, 0);
  if (exists(DESK)) {
    await db.query(`insert into public.article_review_notes(article_id,kind,body) values ('${ART}','note','desk note')`);
    assert.equal((await db.query("select * from public.article_review_notes")).rows.length, 1);
  }
});

test("non-editors still see nothing and cannot write; anon is refused outright", async () => {
  const db = await setup(); await applyFix(db);
  await db.exec(`insert into public.article_updates(article_id,kind,body) values ('${ART}','update','existing')`);
  await as(db, READER, "subscriber");
  assert.equal((await db.query("select * from public.article_updates")).rows.length, 0);
  await assert.rejects(db.query(`insert into public.article_updates(article_id,kind,body) values ('${ART}','update','nope')`), /row-level security/i);
  await as(db, null);
  await assert.rejects(db.query("select * from public.article_updates"), /permission denied/i);
  await assert.rejects(db.query("select private.trust_is_editor()"), /permission denied/i);
});

test("privileges land where intended: authenticated yes, anon and public no", async () => {
  const db = await setup(); await applyFix(db);
  const q = (r) => db.query(`select has_function_privilege($$${r}$$,'private.trust_is_editor()','execute') v`).then((x) => x.rows[0].v);
  assert.equal(await q("authenticated"), true);
  assert.equal(await q("anon"), false);
  assert.equal(await q("public"), false);
});

test("idempotent, and the rollback restores the failing state so it is a real undo", async () => {
  const db = await setup(); await applyFix(db); await applyFix(db);
  await as(db, ED, "editor");
  assert.equal((await db.query("select * from public.article_updates")).rows.length, 0);
  await db.exec("reset role"); await db.exec(read(UNDO)); await as(db, ED, "editor");
  await assert.rejects(db.query("select * from public.article_updates"), /permission denied for function/i);
});
