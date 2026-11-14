-- Telnyx SMS alerts and phone verification
create table if not exists public.user_phone_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text not null,
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.user_sms_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  breaking_enabled boolean not null default false,
  locale text not null default 'ar' check (locale in ('ar','en')),
  consent_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.user_phone_verifications enable row level security;
alter table public.user_sms_preferences enable row level security;
drop policy if exists "Users read own verified phone" on public.user_phone_verifications;
create policy "Users read own verified phone" on public.user_phone_verifications for select to authenticated using (auth.uid()=user_id);
drop policy if exists "Users read own SMS preferences" on public.user_sms_preferences;
create policy "Users read own SMS preferences" on public.user_sms_preferences for select to authenticated using (auth.uid()=user_id);
-- No client write policies: only the Edge Function service role can verify phones or change consent.
alter table public.articles add column if not exists sms_notification_sent_at timestamptz;
create index if not exists articles_sms_pending_idx on public.articles (published_at desc) where is_breaking=true and sms_notification_sent_at is null;
