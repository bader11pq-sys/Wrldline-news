create table if not exists public.translation_provider_state (
 provider text primary key check (provider in ('deepl')),
 disabled_until timestamptz,
 reason text,
 updated_at timestamptz not null default now()
);
alter table public.translation_provider_state enable row level security;
revoke all on public.translation_provider_state from anon, authenticated;
grant all on public.translation_provider_state to service_role;
