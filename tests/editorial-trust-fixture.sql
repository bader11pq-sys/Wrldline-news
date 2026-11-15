create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
create table public.articles (
 id uuid primary key default gen_random_uuid(), title text,summary text,image_url text,author text,lang text,category text,country text,
 verification text default 'unconfirmed',source_name text,source_url text,url text,published_at timestamptz default now(),received_at timestamptz,fetched_at timestamptz,
 is_breaking boolean default false,editorial_status text default 'published' check(editorial_status in ('published','review','rejected')),
 ai_summary text,verification_source_count integer,verification_independent_count integer,verification_official_count integer,verification_note text,
 correction_note text,corrected_at timestamptz,source_language text,event_country text,topics text[],newsdata_only boolean,
 trust_review_note text,trust_reviewed_by uuid,human_translation_note text,human_translation_reviewed_by uuid
);
alter table public.articles enable row level security;
grant select,insert,update,delete on public.articles to authenticated;
-- Reproduce the broad inherited grants and normal signed-in newsroom reads.
grant select on public.articles to public,anon;
grant select (trust_review_note,trust_reviewed_by,human_translation_note,human_translation_reviewed_by) on public.articles to public,anon,authenticated;
create policy "Authenticated read published or editorial articles" on public.articles for select to authenticated using(editorial_status='published' or auth.jwt()->'app_metadata'->>'role' in ('editor','admin'));
create policy fixture_editor on public.articles to authenticated using(auth.jwt()->'app_metadata'->>'role' in ('editor','admin')) with check(auth.jwt()->'app_metadata'->>'role' in ('editor','admin'));
create table public.article_evidence (
 id uuid primary key default gen_random_uuid(),article_id uuid not null references public.articles(id) on delete cascade,
 publisher text not null,evidence_url text not null,evidence_type text not null check(evidence_type in ('independent_report','official_statement','field_report','primary_document','contradiction','correction','retraction')),
 independent_source boolean not null default true,notes text,created_by uuid,created_at timestamptz not null default now(),unique(article_id,evidence_url)
);
create table public.article_translations (
 id uuid primary key default gen_random_uuid(),article_id uuid not null references public.articles(id) on delete cascade,
 lang text,title text,summary text,translation_status text default 'review',translation_source text default 'machine_draft',
 reviewed_at timestamptz,reviewed_by uuid,published_at timestamptz,created_at timestamptz default now(),human_review_note text
);
alter table public.article_translations enable row level security;
grant select,insert,update,delete on public.article_translations to authenticated;
grant select on public.article_translations to public,anon;
grant select (human_review_note,reviewed_by) on public.article_translations to public,anon,authenticated;
create policy "Authenticated read published translations" on public.article_translations for select to authenticated using(exists(select 1 from public.articles a where a.id=article_id and a.editorial_status='published') or auth.jwt()->'app_metadata'->>'role' in ('editor','admin'));
-- Unknown old permissive policies must not OR their way around the new gate.
create policy fixture_stale_broad_read on public.article_translations for select to authenticated using(true);
create policy fixture_translation_editor on public.article_translations to authenticated using(auth.jwt()->'app_metadata'->>'role' in ('editor','admin')) with check(auth.jwt()->'app_metadata'->>'role' in ('editor','admin'));
create table public.article_change_log (
 id uuid primary key default gen_random_uuid(),article_id uuid not null references public.articles(id) on delete cascade,
 changed_at timestamptz not null default now(),change_type text not null check(change_type in ('created','updated','verification','correction','retraction')),
 changed_fields jsonb not null default '{}',before_snapshot jsonb,after_snapshot jsonb
);
alter table public.article_change_log enable row level security;
grant select on public.article_change_log to anon,authenticated;
create policy fixture_old_public_log on public.article_change_log for select to anon,authenticated using(true);
insert into public.articles(id,title,summary,source_name,source_url,url,lang,source_language,verification,trust_review_note,human_translation_note) values
 ('11111111-1111-4111-8111-111111111111','Fixture story','Fixture text','Fixture publisher','https://example.org/feed.xml','https://example.org/original','en','en','confirmed','INTERNAL_STORY_NOTE','INTERNAL_TRANSLATION_NOTE');
insert into public.articles(id,title,summary,lang,source_language,editorial_status) values
 ('22222222-2222-4222-8222-222222222222','نص مترجم','ملخص','ar','en','review');
insert into public.articles(id,title,summary,lang,source_language,published_at) values
 ('44444444-4444-4444-8444-444444444444','Future fixture','Not public yet','en','en',now()+interval '1 day'),
 ('55555555-5555-4555-8555-555555555555','Undated fixture','Not public yet','en','en',null);
insert into public.articles(id,title,lang,source_language,editorial_status) values
 ('66666666-6666-4666-8666-666666666666','Rejected fixture','en','en','rejected');
insert into public.article_translations(id,article_id,lang,title,summary,translation_status) values
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','ar','ترجمة قديمة','نص قديم','published'),
 ('33333333-3333-4333-8333-333333333334','11111111-1111-4111-8111-111111111111','fr','PRIVATE_REVIEW_DRAFT','Private draft','review'),
 ('33333333-3333-4333-8333-333333333335','11111111-1111-4111-8111-111111111111','de','PRIVATE_REJECTED','Private rejection','rejected'),
 ('33333333-3333-4333-8333-333333333336','11111111-1111-4111-8111-111111111111','it','PRIVATE_DRAFT','Private draft','draft'),
 ('33333333-3333-4333-8333-333333333337','22222222-2222-4222-8222-222222222222','en','PRIVATE_PARENT_REVIEW','Private parent','published'),
 ('33333333-3333-4333-8333-333333333338','66666666-6666-4666-8666-666666666666','ar','PRIVATE_PARENT_REJECTED','Private parent','published');
insert into public.article_change_log(article_id,change_type,before_snapshot,after_snapshot) values
 ('11111111-1111-4111-8111-111111111111','updated','{"private_secret":"DO_NOT_PUBLISH"}','{"created_by":"internal-user-id"}');
