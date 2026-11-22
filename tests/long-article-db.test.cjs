const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { PGlite } = require("@electric-sql/pglite");

test("published detail preserves million-character text and rejects private, future and draft rows", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create table public.articles(id uuid primary key, summary text, source_language text, lang text, editorial_status text, published_at timestamptz);
      create table public.article_translations(article_id uuid, title text, summary text, lang text, translation_status text);
      insert into public.articles values
        ('10000000-0000-0000-0000-000000000001', repeat('ن',1000000-length(' نهاية')) || ' نهاية', 'ar','ar','published',now()),
        ('10000000-0000-0000-0000-000000000002', 'draft', 'ar','ar','draft',now()),
        ('10000000-0000-0000-0000-000000000003', 'future', 'ar','ar','published',now()+interval '1 hour'),
        ('10000000-0000-0000-0000-000000000004', repeat('x',1000001), 'ar','ar','published',now());
      insert into public.article_translations values
        ('10000000-0000-0000-0000-000000000001','Private draft','Do not leak','en','review'),
        ('10000000-0000-0000-0000-000000000001','Published English','Valid English translation','en','published'),
        ('10000000-0000-0000-0000-000000000002','Draft translation','Do not leak','en','published');
    `);
    const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261122171000_long_article_reading.sql"),"utf8");
    await db.exec(migration);
    assert.equal((await db.query("select has_table_privilege('anon','public.articles','select') allowed")).rows[0].allowed, false);
    await db.exec("set role anon");
    const detail = async (n, lang = null) => (await db.query("select * from public.public_article_reading($1,$2)",["10000000-0000-0000-0000-00000000000"+n,lang])).rows;
    const [long] = await detail(1);
    assert.ok(long.body.endsWith("نهاية"));
    assert.equal(long.body.length, 1000000);
    assert.equal(long.complete, true);
    const [en] = await detail(1,"en");
    assert.equal(en.body,"Valid English translation");
    assert.equal(en.lang,"en");
    assert.deepEqual(await detail(2,"en"),[]);
    assert.deepEqual(await detail(3),[]);
    assert.equal((await detail(4))[0].complete,false);
  } finally { await db.close(); }
});
