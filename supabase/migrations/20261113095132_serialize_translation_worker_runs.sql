create table if not exists public.translation_worker_lock (
  singleton boolean primary key default true check (singleton),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.translation_worker_lock(singleton) values (true)
on conflict (singleton) do nothing;
alter table public.translation_worker_lock enable row level security;
revoke all on table public.translation_worker_lock from public, anon, authenticated;

create or replace function public.claim_translation_worker()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.translation_worker_lock
  set locked_until = now() + interval '180 seconds',
      updated_at = now()
  where singleton = true
    and (locked_until is null or locked_until < now());
  return found;
end;
$$;

create or replace function public.release_translation_worker()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.translation_worker_lock
  set locked_until = null,
      updated_at = now()
  where singleton = true;
  return found;
end;
$$;

revoke all on function public.claim_translation_worker() from public, anon, authenticated;
revoke all on function public.release_translation_worker() from public, anon, authenticated;
grant execute on function public.claim_translation_worker() to service_role;
grant execute on function public.release_translation_worker() to service_role;
