-- Notification architecture only. No existing interest row is migrated or mailed.
-- No article SELECT grants or public table projections are changed here.
begin;
create table public.notification_runtime (
  id smallint primary key check (id = 1), push_enabled boolean not null default false,
  email_enabled boolean not null default false, enabled_at timestamptz,
  check ((not push_enabled and not email_enabled) or enabled_at is not null)
);
insert into public.notification_runtime(id) values (1);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check(length(endpoint) <= 2048), endpoint_hash text not null unique,
  p256dh text not null, auth text not null, consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), disabled_at timestamptz
);
create index push_subscriptions_owner on public.push_subscriptions(user_id);
create table public.newsletter_optins (
  id uuid primary key default gen_random_uuid(), email text not null unique check(length(email) <= 254),
  locale text not null default 'ar' check(locale in ('ar','en')),
  cadence text not null check(cadence in ('daily','weekly')), topics text[] not null default '{}', countries text[] not null default '{}',
  status text not null default 'pending' check(status in ('pending','confirmed','unsubscribed')),
  consent_at timestamptz not null default now(), confirmed_at timestamptz, unsubscribed_at timestamptz,
  token_nonce uuid not null, confirmation_hash text, unsubscribe_hash text not null,
  confirmation_expires_at timestamptz not null default now() + interval '48 hours',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(cardinality(topics) <= 30 and cardinality(countries) <= 30),
  check(status <> 'confirmed' or confirmed_at is not null)
);
create unique index newsletter_confirmation_hash on public.newsletter_optins(confirmation_hash) where confirmation_hash is not null;
create unique index newsletter_unsubscribe_hash on public.newsletter_optins(unsubscribe_hash);
create table public.notification_rate_buckets (
  key text not null, bucket timestamptz not null, requests integer not null, primary key(key,bucket)
);
create table public.notification_events (
  article_id uuid primary key references public.articles(id) on delete cascade,
  created_at timestamptz not null default now(), cursor_id uuid, completed boolean not null default false
);
create table public.notification_digest_runs (
  cadence text not null check(cadence in ('daily','weekly')), period_start timestamptz not null, period_end timestamptz not null,
  cursor_id uuid, completed boolean not null default false, primary key(cadence,period_end)
);
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(), dedupe_key text not null unique,
  kind text not null check(kind in ('push','digest','confirmation')),
  push_subscription_id uuid references public.push_subscriptions(id) on delete set null,
  newsletter_id uuid references public.newsletter_optins(id) on delete cascade,
  article_id uuid references public.articles(id) on delete cascade,
  token_nonce uuid, period_start timestamptz, period_end timestamptz,
  status text not null default 'queued' check(status in ('queued','sending','retry','sent','failed','uncertain','cancelled')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  lease_token uuid, leased_at timestamptz, sent_at timestamptz, provider_id text, error_code text,
  content jsonb, -- Immutable public article projection/locale only; raw tokens never persist.
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((kind = 'push' and article_id is not null) or (kind in ('digest','confirmation') and newsletter_id is not null))
);
create index notification_delivery_queue on public.notification_deliveries(next_attempt_at,created_at) where status in ('queued','retry');
-- Only Edge service-role writes can reach endpoints/keys or consent-token hashes.
alter table public.push_subscriptions enable row level security;
create policy "Owners read push subscription metadata" on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.push_subscriptions from anon, authenticated;
grant select(id,user_id,consent_at,created_at,updated_at,disabled_at) on public.push_subscriptions to authenticated;
alter table public.newsletter_optins enable row level security;
alter table public.notification_runtime enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_digest_runs enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_rate_buckets enable row level security;
revoke all on public.newsletter_optins,public.notification_runtime,public.notification_events,public.notification_digest_runs,public.notification_deliveries,public.notification_rate_buckets from anon,authenticated;
grant all on public.push_subscriptions,public.newsletter_optins,public.notification_runtime,public.notification_events,public.notification_digest_runs,public.notification_deliveries,public.notification_rate_buckets to service_role;
-- Legacy public interest collection must not bypass the double-opt-in Edge endpoint.
revoke insert on public.newsletter_subscribers from anon,authenticated;

create function public.notification_rate_limit(p_key text, p_max integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer; b timestamptz;
begin
  if p_max < 1 or p_max > 1000 or p_seconds < 1 or p_seconds > 86400 or length(p_key) > 160 then return false; end if;
  b := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  insert into public.notification_rate_buckets(key,bucket,requests) values(p_key,b,1)
  on conflict(key,bucket) do update set requests = public.notification_rate_buckets.requests + 1 returning requests into n;
  return n <= p_max;
end $$;

create function public.notification_request_optin(p_id uuid,p_email text,p_locale text,p_cadence text,p_topics text[],p_countries text[],p_nonce uuid,p_confirm_hash text,p_unsubscribe_hash text)
returns setof public.newsletter_optins language plpgsql security definer set search_path = '' as $$
declare r public.newsletter_optins;
begin
  -- Serialize first insert as well as subsequent requests for the same address.
  perform pg_advisory_xact_lock(hashtextextended(lower(p_email),0));
  select * into r from public.newsletter_optins where email=lower(p_email) for update;
  if found and r.status='confirmed' then return; end if; -- no unauthenticated preference takeover
  if found and r.status='pending' and r.confirmation_expires_at > now() then return next r; return; end if;
  insert into public.newsletter_optins(id,email,locale,cadence,topics,countries,token_nonce,confirmation_hash,unsubscribe_hash)
  values(p_id,lower(p_email),p_locale,p_cadence,p_topics,p_countries,p_nonce,p_confirm_hash,p_unsubscribe_hash)
  on conflict(email) do update set status='pending',locale=excluded.locale,cadence=excluded.cadence,topics=excluded.topics,countries=excluded.countries,
    token_nonce=excluded.token_nonce,confirmation_hash=excluded.confirmation_hash,unsubscribe_hash=excluded.unsubscribe_hash,
    consent_at=now(),confirmed_at=null,unsubscribed_at=null,confirmation_expires_at=now()+interval '48 hours',updated_at=now()
  returning * into r;
  return next r;
end $$;
create function public.notification_confirm(p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.newsletter_optins set status='confirmed',confirmed_at=now(),confirmation_hash=null,updated_at=now()
  where confirmation_hash=p_hash and status='pending' and confirmation_expires_at>now();
  get diagnostics n = row_count; return n=1;
end $$;
create function public.notification_unsubscribe(p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  update public.newsletter_optins set status='unsubscribed',unsubscribed_at=coalesce(unsubscribed_at,now()),confirmation_hash=null,updated_at=now()
  where unsubscribe_hash=p_hash returning id into target;
  if target is not null then
    update public.notification_deliveries set status='cancelled',error_code='unsubscribed',updated_at=now() where newsletter_id=target and status in ('queued','retry');
  end if;
  return true; -- generic, repeat-safe response
end $$;

create function public.notification_capture_article()
returns trigger language plpgsql security definer set search_path = '' as $$
declare activated timestamptz;
begin
  select enabled_at into activated from public.notification_runtime where id=1 and push_enabled;
  if activated is null or new.editorial_status<>'published' then return new; end if;
  if TG_OP='UPDATE' then if old.editorial_status='published' then return new; end if; end if;
  -- Backfill/historical ingestion never emits push, even when received just now.
  if new.published_at is null or new.published_at < greatest(activated,now()-interval '10 minutes') or new.published_at>now()+interval '2 minutes'
    or coalesce(new.received_at,new.fetched_at,new.published_at)<greatest(activated,now()-interval '10 minutes') then return new; end if;
  insert into public.notification_events(article_id) values(new.id) on conflict do nothing;
  return new;
end $$;
create trigger notifications_new_published_article after insert or update of editorial_status on public.articles
for each row execute function public.notification_capture_article();

create function public.notification_plan_push(p_limit integer default 100)
returns integer language plpgsql security definer set search_path = '' as $$
declare e public.notification_events; last_id uuid; scanned integer; inserted integer;
begin
  if not exists(select 1 from public.notification_runtime where id=1 and push_enabled) then return 0; end if;
  update public.notification_events set completed=true where not completed and created_at<now()-interval '2 hours';
  select * into e from public.notification_events where not completed order by created_at for update skip locked limit 1;
  if not found then return 0; end if;
  with page as materialized (
    select id,user_id from public.push_subscriptions where disabled_at is null and created_at<=e.created_at and (e.cursor_id is null or id>e.cursor_id)
    order by id limit greatest(1,least(p_limit,100))
  ), inserted_rows as (
    insert into public.notification_deliveries(dedupe_key,kind,push_subscription_id,article_id)
    select 'push:'||e.article_id||':'||s.id,'push',s.id,e.article_id from page s
    join public.user_preferences p on p.user_id=s.user_id join public.articles a on a.id=e.article_id
    where p.browser_notifications and a.editorial_status='published'
      and ((a.is_breaking and p.notify_breaking) or (not coalesce(a.is_breaking,false) and (cardinality(p.notify_categories)>0 or cardinality(p.notify_countries)>0)))
      and (cardinality(p.notify_categories)=0 or a.category=any(p.notify_categories) or coalesce(a.topics,'{}') && p.notify_categories)
      and (cardinality(p.notify_countries)=0 or coalesce(nullif(a.event_country,''),a.country)=any(p.notify_countries))
    on conflict(dedupe_key) do nothing returning id
  ) select (select count(*) from page),(select id from page order by id desc limit 1),(select count(*) from inserted_rows) into scanned,last_id,inserted;
  update public.notification_events set cursor_id=coalesce(last_id,cursor_id),completed=scanned<greatest(1,least(p_limit,100)) where article_id=e.article_id;
  return inserted;
end $$;
create function public.notification_plan_digest(p_cadence text,p_start timestamptz,p_end timestamptz,p_limit integer default 100)
returns integer language plpgsql security definer set search_path = '' as $$
declare r public.notification_digest_runs; last_id uuid; scanned integer; inserted integer; activated timestamptz;
begin
  select enabled_at into activated from public.notification_runtime where id=1 and email_enabled;
  if activated is null or p_cadence not in ('daily','weekly') or p_end>now() or p_end<activated
    or p_end-p_start<>(case when p_cadence='daily' then interval '1 day' else interval '7 days' end) then return 0; end if;
  insert into public.notification_digest_runs(cadence,period_start,period_end) values(p_cadence,p_start,p_end) on conflict do nothing;
  select * into r from public.notification_digest_runs where cadence=p_cadence and period_end=p_end for update skip locked;
  if not found or r.completed then return 0; end if;
  with page as materialized (
    select id,token_nonce from public.newsletter_optins where status='confirmed' and cadence=p_cadence and confirmed_at<p_end and (r.cursor_id is null or id>r.cursor_id)
    order by id limit greatest(1,least(p_limit,100))
  ), inserted_rows as (
    insert into public.notification_deliveries(dedupe_key,kind,newsletter_id,period_start,period_end,token_nonce)
    select 'digest:'||p_cadence||':'||p_end||':'||id,'digest',id,greatest(p_start,activated),p_end,token_nonce from page
    on conflict(dedupe_key) do nothing returning id
  ) select (select count(*) from page),(select id from page order by id desc limit 1),(select count(*) from inserted_rows) into scanned,last_id,inserted;
  update public.notification_digest_runs set cursor_id=coalesce(last_id,cursor_id),completed=scanned<greatest(1,least(p_limit,100)) where cadence=p_cadence and period_end=p_end;
  return inserted;
end $$;
-- Explicit service-only published projection; no anonymous table-wide article access.
create function public.notification_digest_articles(p_newsletter_id uuid,p_start timestamptz,p_end timestamptz,p_limit integer default 20)
returns table(id uuid,title text,summary text,category text,country text,event_country text,topics text[],is_breaking boolean,published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id,a.title,a.summary,a.category,a.country,a.event_country,a.topics,a.is_breaking,a.published_at
  from public.articles a join public.newsletter_optins n on n.id=p_newsletter_id
  where n.status='confirmed' and a.editorial_status='published' and a.published_at>=greatest(p_start,n.confirmed_at) and a.published_at<p_end
    and (cardinality(n.topics)=0 or a.category=any(n.topics) or coalesce(a.topics,'{}') && n.topics)
    and (cardinality(n.countries)=0 or coalesce(nullif(a.event_country,''),a.country)=any(n.countries))
  order by a.published_at desc,a.id limit greatest(1,least(p_limit,20));
$$;
create function public.notification_claim(p_kinds text[],p_limit integer default 20)
returns setof public.notification_deliveries language plpgsql security definer set search_path = '' as $$
begin
  -- Email may retry within Resend's 24h idempotency window. Ambiguous push never retries.
  update public.notification_deliveries set status=case when kind='push' or created_at<now()-interval '23 hours' or attempts>=5 then 'uncertain' else 'retry' end,
    error_code='lease_expired',next_attempt_at=now(),updated_at=now() where status='sending' and leased_at<now()-interval '5 minutes';
  update public.notification_deliveries set status='failed',error_code='retry_expired',updated_at=now()
    where status in ('queued','retry') and (created_at<now()-interval '23 hours' or attempts>=5);
  return query with candidates as (
    select id from public.notification_deliveries where status in ('queued','retry') and next_attempt_at<=now() and kind=any(p_kinds)
    order by created_at for update skip locked limit greatest(1,least(p_limit,20))
  ) update public.notification_deliveries d set status='sending',attempts=d.attempts+1,lease_token=gen_random_uuid(),leased_at=now(),updated_at=now()
    from candidates c where d.id=c.id returning d.*;
end $$;
create function public.notification_finish(p_id uuid,p_lease uuid,p_status text,p_error text default null,p_provider text default null,p_delay integer default 0)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_status not in ('retry','sent','failed','uncertain','cancelled') then return false; end if;
  update public.notification_deliveries set status=p_status,error_code=left(p_error,80),provider_id=left(p_provider,160),
    next_attempt_at=now()+make_interval(secs=>greatest(0,least(p_delay,3600))),sent_at=case when p_status='sent' then now() else null end,updated_at=now()
  where id=p_id and lease_token=p_lease and status='sending';
  get diagnostics n=row_count; return n=1;
end $$;
create function public.notification_prepare_delivery(p_id uuid,p_lease uuid,p_content jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb;
begin
  if pg_column_size(p_content)>100000 then return null; end if;
  update public.notification_deliveries set content=coalesce(content,p_content),updated_at=now()
  where id=p_id and lease_token=p_lease and status='sending' returning content into snapshot;
  return snapshot;
end $$;
-- All definer RPCs are private to the service role, including rate and consent helpers.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('notification_rate_limit','notification_request_optin','notification_confirm','notification_unsubscribe','notification_capture_article','notification_plan_push','notification_plan_digest','notification_digest_articles','notification_claim','notification_finish','notification_prepare_delivery')
  loop
    execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
    execute 'grant execute on function '||f.signature||' to service_role';
  end loop;
end $$;
commit;
