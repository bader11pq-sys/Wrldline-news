import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {agents,agentIds} from '../shared/agents';
import {uid,fresh} from '../shared/schema';
import {demoSeed} from '../worker/demo';
test('Supabase migration: schemas, leases, RLS, atomic approvals, public views',async()=>{
  const db=new PGlite();try{
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);`);
    await db.exec(await readFile(new URL('../supabase/migrations/20261001000000_office.sql',import.meta.url),'utf8'));
    const actor=uid(),lease=uid(),a=agentIds.map(i=>({id:i,...agents[i],status:'Idle'}));
    await db.query('insert into auth.users values ($1)',[actor]);await db.query('insert into public.users values ($1,$2,$3)',[actor,'ceo','Test CEO']);
    const take=(id:string)=>db.query('select public.office_claim($1,$2) as doc',[actor,id]);
    const save=(doc:ReturnType<typeof fresh>)=>db.query('select public.office_save($1,$2,$3,$4) as ok',[actor,lease,JSON.stringify(doc),JSON.stringify(a)]);
    assert.deepEqual((await take(lease)).rows[0],{doc:{}});assert.deepEqual((await take(uid())).rows[0],{doc:null});
    const o=demoSeed(), article=o.articles[0];o.demo=false;article.demo=false;article.sources.forEach(s=>s.demo=false);
    article.status='published';article.publishedAt=new Date().toISOString();
    await assert.rejects(save(o),/Publish gate failed/);
    o.approvals.push({id:uid(),targetId:article.id,decision:'approved',feedback:'',actor,createdAt:new Date().toISOString()});
    const second=article.sources.pop()!;
    await assert.rejects(save(o),/Publish gate failed/);
    article.sources.push(second);
    assert.deepEqual((await save(o)).rows[0],{ok:true});
    assert.deepEqual((await db.query(`select count(*)::int as n from public.articles where status='published'`)).rows[0],{n:1});
    assert.equal((await db.query(`select count(*)::int as n from public.approvals`)).rows.length,1);
    await db.query('select public.office_record_view($1)',[article.id]);await db.query('select public.office_record_view($1)',[o.articles[1].id]);
    const row=(await db.query('select public.office_views($1) as views',[actor])).rows[0] as {views:{count:number}[]};
    assert.equal(row.views.length,1);assert.equal(row.views[0].count,1);
    assert.ok((await db.query(`select not has_function_privilege('anon','public.office_save(uuid,uuid,jsonb,jsonb)','EXECUTE') as safe`)).rows[0]);
    assert.deepEqual((await db.query(`select has_function_privilege('anon','public.office_save(uuid,uuid,jsonb,jsonb)','EXECUTE') as allowed`)).rows[0],{allowed:false});
  }finally{await db.close();}
});
