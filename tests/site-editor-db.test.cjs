const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { PGlite } = require("@electric-sql/pglite");
const read = name => fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const migration = name => read("supabase/migrations/"+name+".sql");
const id = "11111111-1111-4111-8111-111111111111";
const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const reader = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const editor = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const article = {title:"Site editor test",summary:"This is an isolated fixture.",category:"politics",source_name:"WRLDLINE NEWS",source_language:"en",lang:"en",editorial_status:"draft"};

test("only a current admin can enter, read private drafts, publish, edit and accept human reviews",async()=>{
  const db = new PGlite();
  try {
    await db.exec(read("tests/editorial-trust-fixture.sql"));
    await db.exec(`
      create schema storage;
      create table auth.users(id uuid primary key,raw_app_meta_data jsonb);
      create table storage.objects(bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant insert on storage.objects to authenticated;
      create policy fixture_legacy_media on storage.objects for insert to authenticated
        with check (auth.jwt()->'app_metadata'->>'role' in ('editor','admin'));
      insert into auth.users values
        ('${admin}','{"role":"admin"}'),('${editor}','{"role":"editor"}'),('${reader}','{}');
      alter table public.articles drop constraint articles_editorial_status_check;
      alter table public.articles add constraint articles_editorial_status_check check(editorial_status in ('draft','review','published','rejected'));
      alter table public.articles add media_type text,add content_type text default 'news',add sponsor_name text,add sponsor_url text,
        add ai_country_code text,add ai_region text,add ai_location_name text,add ai_latitude numeric,add ai_longitude numeric,
        add classification_reason text,add ai_classification_status text,add classification_claimed_at timestamptz,add classification_retry_after timestamptz;
      alter table public.articles add unique(url);
      alter table public.article_translations add unique(article_id,lang);
    `);
    await db.exec(migration("20261114021916_add_exclusive_reporting_metadata"));
    await db.exec(migration("20261115030000_editorial_trust"));
    await db.exec(migration("20261122171000_long_article_reading"));
    await db.exec(migration("20261123100000_site_editor"));
    const claims = async (sub,role,userMetadata={}) => {
      await db.exec("reset role; set role authenticated");
      await db.query("select set_config('test.jwt',$1,false)",[JSON.stringify({sub,app_metadata:role?{role}:{},user_metadata:userMetadata})]);
    };
    const action = async (act,story=null,version=null,values={}) =>
      (await db.query("select public.site_editor($1,$2,$3,$4::jsonb) as value",[act,story,version,JSON.stringify(values)])).rows[0].value;
    const code = value => error => error.code===value;
    await db.exec("set role anon");
    await assert.rejects(action("load",id),code("42501"));
    await claims(reader,null,{role:"admin"});
    for (const op of ["access","queue","load","save","trust","edition","evidence","claim","review_tools"]) {
      await assert.rejects(action(op,id,"0",article),code("42501"));
    }
    await claims(editor,"editor");
    await assert.rejects(action("access"),code("42501"));
    await assert.rejects(action("save",null,null,article),code("42501"));
    await claims(editor,"admin"); // Current stored role wins over a stale admin token.
    await assert.rejects(action("access"),code("42501"));

    await claims(admin,"admin");
    assert.equal(await action("access"),true);
    const imported=await action("load",id);
    assert.equal(imported.source_url,"https://example.org/original");
    assert.equal(Object.hasOwn(imported,"trust_review_note"),false);
    await assert.rejects(action("save",id,imported.version,{verification:"confirmed"}),code("22023"));
    const changed=await action("save",id,imported.version,{source_url:"https://example.org/new-story",author:"Example author"});
    assert.equal(changed.source_url,"https://example.org/new-story");
    assert.equal(changed.author,"Example author");
    assert.notEqual(changed.version,imported.version);
    await assert.rejects(action("save",id,imported.version,{title:"Stale"}),code("40001"));

    let a=await action("save",null,null,article);
    const drafts=await action("queue",null,null,{query:"site editor"});
    assert.ok(drafts.some(row=>row.id===a.id));
    await db.exec("set role anon");
    assert.deepEqual((await db.query("select * from public.public_article_reading($1)",[a.id])).rows,[]);
    await claims(admin,"admin");
    await assert.rejects(action("save",a.id,a.version,{source_url:"javascript:alert(1)"}),code("22023"));
    await assert.rejects(action("save",a.id,a.version,{is_exclusive:true}),code("22023"));
    a=await action("save",a.id,a.version,{editorial_status:"published",published_at:null,is_breaking:true,correction_note:"Updated scope."});
    assert.equal(a.editorial_status,"published");
    assert.equal(a.is_breaking,true);
    assert.equal(a.correction_note,"Updated scope.");
    await db.exec("set role anon");
    assert.equal((await db.query("select body from public.public_article_reading($1)",[a.id])).rows[0].body,article.summary);
    await claims(admin,"admin");
    await assert.rejects(action("trust",a.id,a.version,{status:"confirmed",note:"No evidence yet."}),/claims|evidence/);
    a=await action("evidence",a.id,a.version,{publisher:"Public document",evidence_url:"https://example.org/report",evidence_type:"primary_document"});
    let tools=await action("review_tools",a.id);
    assert.equal(tools.evidence.length,1);
    a=await action("claim",a.id,a.version,{claim_text:"The source published a document.",status:"unconfirmed",supporting_evidence_ids:[tools.evidence[0].id]});
    tools=await action("review_tools",a.id);
    assert.equal(tools.claims.length,1);
    a=await action("trust",a.id,a.version,{status:"disputed",note:"Human review note",translation_status:"not_required"});
    assert.equal(a.editorial_trust_status,"disputed");
    assert.equal(a.trust_needs_review,false);
    a=await action("edition",a.id,a.version,{lang:"ar",title:"نسخة عربية",summary:"نص النسخة العربية.",publish:true,note:"Reviewed against the original."});
    assert.equal((await action("review_tools",a.id)).editions[0].translation_status,"published");
    a=await action("save",a.id,a.version,{editorial_status:"rejected",summary:"New material invalidates review."});
    assert.equal(a.trust_needs_review,true);
    assert.equal(a.editorial_status,"rejected");
    await db.exec("reset role; alter table public.articles add audience_lane text not null default 'excluded'");
    await claims(admin,"admin");
    const held = await action("save",null,null,article);
    assert.equal(held.audience_lane,"excluded");
    await assert.rejects(action("save",held.id,held.version,{editorial_status:"published"}),/Publication gate did not permit/);
    assert.equal((await action("load",held.id)).editorial_status,"draft");
    await db.exec("reset role");
    await db.query("update auth.users set raw_app_meta_data='{}' where id=$1",[admin]);
    await claims(admin,"admin");
    await assert.rejects(action("load",a.id),code("42501"));
  } finally { await db.close(); }
});
