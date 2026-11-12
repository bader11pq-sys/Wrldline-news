-- WRLDLINE accounts and subscriptions
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  preferred_language text not null default 'ar' check (preferred_language in ('ar','en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text not null default 'free' check (plan in ('free','plus')),
  status text not null default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_status_idx on public.subscriptions(status);
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "Users create own profile" on public.profiles;
create policy "Users create own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users read own subscription" on public.subscriptions;
create policy "Users read own subscription" on public.subscriptions for select to authenticated using (auth.uid() = user_id);
-- No client INSERT/UPDATE/DELETE policies on subscriptions. Only the service-role webhook writes billing state.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'inactive')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_wrldline on auth.users;
create trigger on_auth_user_created_wrldline
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_profile_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_profile_updated_at();

-- Subscription access is derived from trusted webhook-written data, never from browser input.
create or replace function public.has_active_plus()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = auth.uid()
      and s.plan = 'plus'
      and s.status in ('active','trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;
grant execute on function public.has_active_plus() to authenticated;
