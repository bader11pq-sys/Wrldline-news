-- WRLDLINE NEWS — editorial fields, contact/newsletter tables, and RLS.
-- Apply in the Supabase SQL editor or with the Supabase CLI.
-- This migration is idempotent where practical.

alter table public.articles add column if not exists content_type text not null default 'news';
alter table public.articles add column if not exists sponsor_name text;
alter table public.articles add column if not exists sponsor_url text;
alter table public.articles add column if not exists correction_note text;
alter table public.articles add column if not exists corrected_at timestamptz;

do $$ begin
  alter table public.articles add constraint articles_content_type_check
    check (content_type in ('news','analysis','opinion','sponsored'));
exception when duplicate_object then null;
end $$;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) <= 254),
  topic text not null default 'general' check (topic in ('general','correction','copyright','sponsorship','privacy','technical')),
  message text not null check (char_length(message) between 10 and 5000),
  page_path text,
  status text not null default 'new' check (status in ('new','in_review','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) <= 254),
  locale text not null default 'ar' check (locale in ('ar','en')),
  source text not null default 'site',
  status text not null default 'active' check (status in ('active','unsubscribed')),
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;
alter table public.newsletter_subscribers enable row level security;

drop policy if exists contact_messages_insert_public on public.contact_messages;
create policy contact_messages_insert_public on public.contact_messages
  for insert to anon, authenticated
  with check (status = 'new');

drop policy if exists contact_messages_read_editor on public.contact_messages;
create policy contact_messages_read_editor on public.contact_messages
  for select to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') in ('editor','admin'));

drop policy if exists newsletter_subscribers_insert_public on public.newsletter_subscribers;
create policy newsletter_subscribers_insert_public on public.newsletter_subscribers
  for insert to anon, authenticated
  with check (status = 'active');

drop policy if exists newsletter_subscribers_read_editor on public.newsletter_subscribers;
create policy newsletter_subscribers_read_editor on public.newsletter_subscribers
  for select to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') in ('editor','admin'));

create index if not exists articles_published_at_idx on public.articles (published_at desc);
create index if not exists articles_status_idx on public.articles (editorial_status);
create index if not exists contact_messages_created_at_idx on public.contact_messages (created_at desc);
create index if not exists newsletter_subscribers_created_at_idx on public.newsletter_subscribers (created_at desc);
