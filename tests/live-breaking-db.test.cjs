const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");
const {PGlite} = require("@electric-sql/pglite");

const migration = readFileSync(resolve(__dirname,"../supabase/migrations/20261123150000_live_breaking.sql"),"utf8");

test("breaking feed follows public lanes and the signal exposes only a read-only revision",async()=>{
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema private;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      create table auth.users(id uuid primary key, raw_app_meta_data jsonb);
      insert into auth.users values ('00000000-0000-4000-8000-000000000001','{"role":"admin"}'),
        ('00000000-0000-4000-8000-000000000002','{"role":"editor"}');
      create publication supabase_realtime;
      create table public.articles(
        id uuid primary key default gen_random_uuid(), title text, summary text, image_url text,
        lang text, source_language text, category text, source_name text, source_url text, url text,
        published_at timestamptz not null default now(), is_breaking boolean default false,
        content_type text, verification text, correction_note text, corrected_at timestamptz,
        audience_lane text default 'arabic', editorial_status text default 'draft',
        newsdata_only boolean default false
      );
      grant select,insert,update,delete on public.articles to authenticated;
    `);
    await db.exec(migration);
    await db.exec(migration);
    const query = async sql => (await db.query(sql)).rows;
    const revision = async () => Number((await query("select revision from public.breaking_feed_revision"))[0].revision);
    const readAlerts = async () => (await query("select title from public.public_breaking_feed(30, now()-interval '15 minutes')")).map(row=>row.title);
    const deny = {code:"42501"};
    await db.exec(`
      insert into public.articles (title,editorial_status,audience_lane,published_at,is_breaking,newsdata_only) values
        ('Private draft','draft','arabic',now(),true,false),
        ('Not eligible','published','excluded',now(),true,false),
        ('Sports archive','published','leisure',now(),true,false),
        ('Future','published','arabic',now()+interval '1 hour',true,false),
        ('Expired','published','arabic',now()-interval '16 minutes',true,false),
        ('Not breaking','published','arabic',now(),false,false),
        ('NewsData only','published','arabic',now(),true,true);
    `);
    assert.equal(await revision(),0);
    await db.exec("set role anon");
    assert.deepEqual(await readAlerts(),[]);
    await assert.rejects(query("select * from public.articles"),deny);
    await assert.rejects(db.exec("update public.breaking_feed_revision set revision=55"),deny);
    await db.exec("set role authenticated");
    assert.equal(await revision(),0);
    await assert.rejects(db.exec("update public.breaking_feed_revision set revision=55"),deny);
    const actAs = async (id,role) => {
      await db.exec("reset role; set role authenticated");
      await db.query("select set_config('test.jwt',$1,false)",[JSON.stringify({
        role:"authenticated",app_metadata:{role},sub:"00000000-0000-4000-8000-"+String(id).padStart(12,"0")
      })]);
    };
    await actAs(2,"editor");
    await assert.rejects(db.exec("insert into public.articles(title,is_breaking) values ('Unauthorized alert',true)"),deny);
    await assert.rejects(db.exec("update public.articles set is_breaking=true where title='Not breaking'"),deny);
    await assert.rejects(db.exec("update public.articles set editorial_status='published' where title='Private draft'"),deny);
    await assert.rejects(db.exec("update public.articles set published_at=now()+interval '1 hour' where title='Expired'"),deny);
    await db.exec("update public.articles set title='Ordinary edit' where title='Not breaking'");
    await actAs(2,"admin"); // A stale claim is insufficient.
    await assert.rejects(db.exec("update public.articles set is_breaking=true where title='Ordinary edit'"),deny);
    await actAs(1,"admin");
    await db.exec(`
      update public.articles set title='Now public',editorial_status='published',published_at=now() where title='Private draft';
      insert into public.articles(title,editorial_status,audience_lane,published_at,is_breaking)
        values ('Verified international','published','world',now()-interval '2 minutes',true);`);
    assert.equal(await revision(),2);
    await db.exec("set role anon");
    assert.deepEqual(await readAlerts(),["Now public","Verified international"]);
    await actAs(2,"editor");
    await assert.rejects(db.exec("update public.articles set title='Unauthorized edit' where title='Now public'"),deny);
    await assert.rejects(db.exec("delete from public.articles where title='Now public'"),deny);
    assert.equal(await revision(),2);
    await actAs(1,"admin");
    await db.exec("update public.articles set title='Corrected' where title='Now public'");
    assert.equal(await revision(),3);
    await db.exec("update public.articles set is_breaking=false where title='Corrected'");
    assert.equal(await revision(),4);
    await db.exec("delete from public.articles where title='Verified international'");
    assert.equal(await revision(),5);
    assert.deepEqual(await readAlerts(),[]);
    assert.equal((await query("select tablename from pg_publication_tables where pubname='supabase_realtime'"))[0].tablename,"breaking_feed_revision");
  } finally { await db.close(); }
});
