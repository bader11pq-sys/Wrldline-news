import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateContact} from '../supabase/functions/contact-submit/validation.mjs';
const valid = {name:'قارئ',email:'reader@example.org',topic:'correction',message:'هناك تصحيح موثق للخبر المنشور.',page_path:'/contact.html',website:'',consent:true};
test('contact accepts bounded consented input only',()=>{
  assert.equal(validateContact(valid).status,'new');
  for (const patch of [{consent:false},{website:'spam'},{email:'bad'},{topic:'admin'},{name:'x'.repeat(121)},{message:'short'},{message:'x'.repeat(5001)},{page_path:'//evil.com'},{page_path:'/../account'},{service_role:true},{status:'closed'}]) assert.equal(validateContact({...valid,...patch}),null);
});
test('contact accepts the business intelligence topic and still rejects unknown topics',()=>{
  assert.equal(validateContact({...valid,topic:'intelligence',page_path:'/intelligence.html'}).topic,'intelligence');
  assert.equal(validateContact({...valid,topic:'business'}),null);
});
test('security migration prevents publishing with anonymous key and direct public form bypass',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261115060000_form_security.sql',import.meta.url),'utf8');
 assert.match(sql,/revoke insert,update,delete on public\.articles from anon/);
 assert.match(sql,/revoke insert,update,delete on public\.contact_messages from anon,authenticated/);
 assert.match(sql,/grant execute on function public\.consume_form_rate\(text,integer,integer\) to service_role/);
});
