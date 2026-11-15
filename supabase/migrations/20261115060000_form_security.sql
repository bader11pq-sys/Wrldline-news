-- Server-only rate counters contain one-way daily HMAC buckets, never raw IP/email.
create table if not exists public.form_rate_limits (
  bucket text primary key check (char_length(bucket) between 16 and 160),
  window_start timestamptz not null,
  hits integer not null default 1 check (hits > 0),
  expires_at timestamptz not null
);
alter table public.form_rate_limits enable row level security;
revoke all on public.form_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.form_rate_limits to service_role;

create or replace function public.consume_form_rate(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_hits integer; v_start timestamptz;
begin
  if p_max not between 1 and 10000 or p_window_seconds not between 10 and 86400
     or char_length(p_bucket) not between 16 and 160 then return false; end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.form_rate_limits(bucket,window_start,hits,expires_at)
  values(p_bucket,v_start,1,v_start+make_interval(secs=>p_window_seconds))
  on conflict(bucket) do update set
    hits=case when form_rate_limits.window_start=v_start then form_rate_limits.hits+1 else 1 end,
    window_start=v_start,expires_at=excluded.expires_at
  returning hits into v_hits;
  return v_hits <= p_max;
end; $$;
revoke all on function public.consume_form_rate(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_form_rate(text,integer,integer) to service_role;

-- All ingestion workers use service-role server credentials. Publishable keys
-- must not be able to inject self-labelled 'published' stories.
drop policy if exists "News bots insert published articles" on public.articles;
revoke insert,update,delete on public.articles from anon;
revoke insert,update,delete on public.article_translations from anon;

-- Deploy contact-submit before this migration; public browsers use the bounded
-- server endpoint rather than bypassing validation directly through PostgREST.
drop policy if exists contact_messages_insert_public on public.contact_messages;
revoke insert,update,delete on public.contact_messages from anon,authenticated;
grant insert on public.contact_messages to service_role;
