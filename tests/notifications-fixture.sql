\set ON_ERROR_STOP on
-- SAFETY: this fixture is not a migration and must never be run on Supabase.
do $$ begin
  if current_database()<>'notifications_fixture' or coalesce(host(inet_server_addr()),'local') not in ('127.0.0.1','local') then raise exception 'Local notifications_fixture database only'; end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create table public.articles(
 id uuid primary key,title text,summary text,category text,country text,event_country text,topics text[],is_breaking boolean default false,
 editorial_status text not null default 'review',published_at timestamptz,received_at timestamptz,fetched_at timestamptz
);
create table public.user_preferences(
 user_id uuid primary key references auth.users(id),followed_categories text[] not null default '{}',followed_countries text[] not null default '{}',
 notify_categories text[] not null default '{}',notify_countries text[] not null default '{}',notify_breaking boolean not null default true,browser_notifications boolean not null default false
);
create table public.newsletter_subscribers(id uuid primary key,email text,locale text,source text,consent_at timestamptz,status text,created_at timestamptz);
grant insert on public.newsletter_subscribers to anon,authenticated;
insert into public.newsletter_subscribers values('a0000000-0000-4000-8000-000000000001','legacy@example.invalid','ar','site',now(),'active',now());
\ir ../supabase/migrations/20261115020000_notifications.sql
\ir notifications-sql-test.sql
