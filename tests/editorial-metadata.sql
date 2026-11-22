\set ON_ERROR_STOP on
-- Run only on an empty, disposable database: psql -f tests/editorial-metadata.sql.
do $$ begin
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create schema private;
create table public.articles (
  id uuid primary key, country text, event_country text, source_country text,
  category text default 'uncategorized', content_type text default 'news',
  editorial_status text default 'published', trust_reviewed_at timestamptz,
  feed_id uuid, corrected_at timestamptz, newsdata_article_id text, newsdata_fetched_at timestamptz,
  classification_model_version text, classification_reason text, ai_classified_at timestamptz,
  ai_confidence numeric, ai_country_code text, ai_summary text, geographic_scope text default 'unknown',
  ai_classification_status text default 'classified', classification_claimed_at timestamptz,
  classification_retry_after timestamptz, ai_region text, ai_location_name text,
  ai_latitude double precision, ai_longitude double precision,
  topics text[] default '{}', newsdata_categories text[] default '{}',
  newsdata_datatype text, title text, published_at timestamptz
);
create table public.article_change_log(article_id uuid, entity_type text, change_type text);

insert into public.articles (id, country, event_country, title, category, newsdata_article_id, newsdata_fetched_at,
   newsdata_categories, newsdata_datatype, published_at, ai_country_code)
values
 ('00000000-0000-0000-0000-000000000001','yemen',null,'الناتو: سندافع عن بولندا','world','a',now(),'{top,domestic}','news',now()-interval '12 hours',null),
 ('00000000-0000-0000-0000-000000000002','egypt',null,'Science story','tech','b',now(),'{top,science}','opinion',now()-interval '12 hours',null),
 ('00000000-0000-0000-0000-000000000003','saudi arabia',null,'تحليل: المناخ','world','c',now(),'{environment}','news',now()-interval '12 hours',null),
 ('00000000-0000-0000-0000-000000000004','بولندا','بولندا','Classified','world','d',now(),'{politics}','news',now()-interval '12 hours','POL'),
 ('00000000-0000-0000-0000-000000000005','egypt',null,'RSS with legacy country','science',null,null,'{}','news',now()-interval '12 hours',null),
 ('00000000-0000-0000-0000-000000000006','egypt',null,'Edited','world','e',now(),'{science}','news',now()-interval '12 hours',null),
 ('00000000-0000-0000-0000-000000000007','egypt',null,'Fresh','world','f',now(),'{science}','news',now()-interval '5 minutes',null),
 ('00000000-0000-0000-0000-000000000008','egypt',null,'Ambiguous','politics','g',now(),'{politics,crime}','news',now()-interval '12 hours',null);
insert into public.article_change_log values ('00000000-0000-0000-0000-000000000006','articles','updated');

\ir ../supabase/migrations/20261122082259_editorial_metadata_integrity.sql

do $$ begin
  if (select count(*) from private.newsdata_metadata_corrections_20261122) <> 4 then raise exception 'wrong cohort'; end if;
  if (select count(*) from public.articles) <> 8 then raise exception 'article count changed'; end if;
  if not exists(select from public.articles where newsdata_article_id='a' and category='uncategorized'
    and country is null and event_country is null and source_country='yemen' and ai_classification_status='expired')
    then raise exception 'publisher leaked into event country'; end if;
  if not exists(select from public.articles where newsdata_article_id='b' and category='science' and content_type='opinion')
    then raise exception 'science/opinion mapping failed'; end if;
  if not exists(select from public.articles where newsdata_article_id='c' and category='environment' and content_type='analysis')
    then raise exception 'environment/analysis mapping failed'; end if;
  if not exists(select from public.articles where newsdata_article_id='g' and category='uncategorized')
    then raise exception 'conflicting topics got forced'; end if;
  if (select count(*) from public.articles where editorial_status='published') <> 8 then raise exception 'publication changed'; end if;
  if has_table_privilege('authenticated','private.newsdata_metadata_corrections_20261122','SELECT') then raise exception 'audit is not private'; end if;
end $$;

grant select,update on public.articles to authenticated;
set role authenticated;
update public.articles set country='العراق' where newsdata_article_id='d';
update public.articles set ai_classification_status='processing',classification_claimed_at=now() where newsdata_article_id='f';
update public.articles set category='sports',content_type='analysis' where newsdata_article_id='f';
reset role;

do $$ begin
  if not exists (select from public.articles where newsdata_article_id='d'
    and country='العراق' and event_country='العراق' and ai_country_code is null
    and classification_reason='editorial_metadata')
    then raise exception 'old editor writes must update both country columns and reset stale map data'; end if;
  if not exists (select from public.articles where newsdata_article_id='f' and topics='{sports}'
    and ai_classification_status='skipped' and classification_claimed_at is null)
    then raise exception 'editorial metadata must win over an in-flight classifier'; end if;
end $$;
