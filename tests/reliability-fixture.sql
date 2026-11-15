create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema private;
create table public.articles (
 id uuid primary key, title text not null, summary text,
 editorial_status text not null check(editorial_status in ('published','review','rejected')),
 source_url text, published_at timestamptz, received_at timestamptz default now(),
 newsdata_only boolean not null default false
);
alter table public.articles enable row level security;
revoke all on public.articles from public,anon,authenticated;
create table public.private_account_fixture(id integer primary key,user_id uuid not null,secret text not null);
alter table public.private_account_fixture enable row level security;
grant select on public.private_account_fixture to anon,authenticated;
-- No anonymous SELECT policy: even explicit grants cannot reveal private rows.
create function public.published_news() returns table(id uuid,title text)
language sql stable security definer set search_path=pg_catalog,public
as $$ select id,title from public.articles where editorial_status='published' limit 100; $$;
revoke all on function public.published_news() from public;
grant execute on function public.published_news() to anon;
create table public.feeds(
 id uuid primary key,name text not null,url text unique not null,active boolean not null default true,
 last_fetched timestamptz,last_error text,created_at timestamptz not null default now(),pipeline text not null default 'general'
);
create table public.newsdata_sources(source_id text primary key,source_name text not null,source_url text,updated_at timestamptz default now());
insert into public.feeds(id,name,url,last_fetched) values
 ('00000000-0000-0000-0000-000000000010','Fixture','https://example.test/feed',now());
insert into public.articles(id,title,editorial_status,source_url,published_at) values
 ('00000000-0000-0000-0000-000000000001','Synthetic public story','published','https://example.test/feed',now()),
 ('00000000-0000-0000-0000-000000000002','Synthetic review story','review','https://example.test/feed',now());
insert into public.private_account_fixture values(1,'00000000-0000-0000-0000-000000000003','Synthetic-only private row');
