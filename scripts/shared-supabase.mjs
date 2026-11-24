import {readFileSync} from 'node:fs';
const source=new URL('../supabase/migrations/20261001000000_office.sql',import.meta.url);
const tables=['users','employees','office_state','tasks','articles','conversations','approvals','logs','article_views'];
const functions=['office_claim','office_release','office_record_view','office_views','office_save'];
const prefix=name=>`wrldline_office_${name.replace(/^office_/,'')}`;
export function sharedMigration(sql) {
  const resources=new RegExp(`\\bpublic\\.(${tables.concat(functions).join('|')})\\b`,'g');
  return sql.replace(resources,(_,name)=>`public.${prefix(name)}`)
    .replace(/array array\[(.*?)\] loop/,(_,args)=>`array array[${args.replace(/'(\w+)'/g,(_,name)=>`'${prefix(name)}'`)}] loop`)
    .replace(/\b(articles_published_idx|tasks_owner_idx|logs_owner_idx)\b/g,'wrldline_office_$1')
    .replaceAll("'office-images'","'wrldline-office-images'");
}
if(process.argv[1]&&process.argv[1].endsWith('shared-supabase.mjs'))process.stdout.write(sharedMigration(readFileSync(source,'utf8')));
