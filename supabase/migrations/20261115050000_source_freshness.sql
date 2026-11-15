-- Operational metrics only. No article SELECT grants, public views, or scheduler secrets.
begin;
create schema if not exists private;
create table public.source_freshness_config (
  source_key text primary key,
  enabled boolean not null default true,
  expected_cadence_seconds integer check (expected_cadence_seconds between 60 and 604800),
  attempt_grace_multiplier numeric not null default 2 check (attempt_grace_multiplier between 1 and 20),
  max_published_age_seconds integer not null default 172800 check (max_published_age_seconds between 60 and 31536000),
  max_received_age_seconds integer not null default 86400 check (max_received_age_seconds between 60 and 31536000),
  initialization_grace_seconds integer not null default 3600 check (initialization_grace_seconds between 0 and 604800),
  updated_at timestamptz not null default now()
);
create table public.source_freshness_state (
  source_key text primary key,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_result text check (last_result in ('success','error')),
  last_error_code text,
  last_poll_had_new_news boolean,
  last_published_at timestamptz,
  last_received_at timestamptz,
  received_count bigint not null default 0 check (received_count >= 0),
  updated_at timestamptz not null default now()
);
create table public.source_freshness_metrics (
  source_key text primary key,
  checked_at timestamptz not null,
  status text not null check (status in ('healthy','no_new_news','not_initialized','configuration_required','error','stale')),
  flags text[] not null default '{}',
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_published_at timestamptz,
  last_received_at timestamptz,
  expected_cadence_seconds integer,
  updated_at timestamptz not null default now()
);
alter table public.source_freshness_config enable row level security;
alter table public.source_freshness_state enable row level security;
alter table public.source_freshness_metrics enable row level security;
revoke all on public.source_freshness_config, public.source_freshness_state, public.source_freshness_metrics from public, anon, authenticated;
grant select, insert, update, delete on public.source_freshness_config, public.source_freshness_state, public.source_freshness_metrics to service_role;
create index if not exists articles_source_freshness_idx on public.articles(source_url, received_at desc);

-- A feed health PATCH is evidence of an attempt, including repeated failures whose text
-- does not change. Existing ingestion clears last_fetched on error; retain last success here.
create or replace function private.capture_feed_freshness()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare k text := 'rss:' || new.url; previous_attempt timestamptz; received timestamptz;
begin
  if tg_op = 'INSERT' and new.last_fetched is null and new.last_error is null then return new; end if;
  select last_attempt_at, last_received_at into previous_attempt, received
    from public.source_freshness_state where source_key = k;
  insert into public.source_freshness_state(source_key,last_attempt_at,last_success_at,last_result,last_error_code,last_poll_had_new_news)
  values(k,now(),case when new.last_error is null then coalesce(new.last_fetched,now()) end,
    case when new.last_error is null then 'success' else 'error' end,
    case when new.last_error is not null then 'ingestion_error' end,
    case when new.last_error is null and previous_attempt is not null then coalesce(received > previous_attempt,false) end)
  on conflict(source_key) do update set last_attempt_at=excluded.last_attempt_at,
    last_success_at=coalesce(excluded.last_success_at,source_freshness_state.last_success_at),
    last_result=excluded.last_result,last_error_code=excluded.last_error_code,
    last_poll_had_new_news=excluded.last_poll_had_new_news,updated_at=now();
  return new;
end $$;
revoke all on function private.capture_feed_freshness() from public,anon,authenticated;
create trigger source_freshness_feed_insert after insert on public.feeds
  for each row execute function private.capture_feed_freshness();
create trigger source_freshness_feed_update after update of last_fetched,last_error on public.feeds
  for each row execute function private.capture_feed_freshness();

-- Receipt is an INSERT, not a re-upsert/fetch of an existing story. RSS attribution uses
-- exact configured feed URL, never a publisher name shared by multiple feeds.
create or replace function private.capture_article_freshness()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare k text;
begin
  for k in
    select 'rss:' || f.url from public.feeds f where f.url = new.source_url
    union all
    select 'newsdata:' || n.source_id from public.newsdata_sources n
      where n.source_url = new.source_url and coalesce(new.newsdata_only,false)
  loop
    insert into public.source_freshness_state(source_key,last_published_at,last_received_at,received_count)
    values(k,new.published_at,coalesce(new.received_at,now()),1)
    on conflict(source_key) do update set
      last_published_at=greatest(source_freshness_state.last_published_at,excluded.last_published_at),
      last_received_at=greatest(source_freshness_state.last_received_at,excluded.last_received_at),
      received_count=source_freshness_state.received_count+1,updated_at=now();
  end loop;
  return new;
end $$;
revoke all on function private.capture_article_freshness() from public,anon,authenticated;
create trigger source_freshness_article_insert after insert on public.articles
  for each row execute function private.capture_article_freshness();

-- Initialize from actual articles, not queue acknowledgements. Catalog update time is
-- deliberately NOT interpreted as a NewsData per-publisher attempt.
insert into public.source_freshness_state(source_key,last_attempt_at,last_success_at,last_result,last_error_code,last_published_at,last_received_at,received_count)
select 'rss:' || f.url, f.last_fetched,
  case when f.last_error is null then f.last_fetched end,
  case when f.last_error is not null then 'error' when f.last_fetched is not null then 'success' end,
  case when f.last_error is not null then 'ingestion_error' end,
  a.last_published_at,a.last_received_at,coalesce(a.received_count,0)
from public.feeds f left join lateral (
  select max(published_at) last_published_at,max(received_at) last_received_at,count(*) received_count
  from public.articles where source_url=f.url
) a on true on conflict(source_key) do nothing;
insert into public.source_freshness_state(source_key,last_published_at,last_received_at,received_count)
select 'newsdata:' || n.source_id,max(a.published_at),max(a.received_at),count(a.id)
from public.newsdata_sources n join public.articles a on a.source_url=n.source_url and a.newsdata_only
 group by n.source_id on conflict(source_key) do nothing;

-- Existing RSS cadence defaults are explicit expectations, not proof of scheduling.
-- 1000 feeds / 250-feed batches every 3 minutes implies ~12 minutes/full rotation;
-- use 15 minutes plus 2x grace, and override slow/weekly publishers individually.
insert into public.source_freshness_config(source_key,expected_cadence_seconds)
select 'rss:' || url,900 from public.feeds where active on conflict do nothing;

-- Future ingestion integration may record actual attempts for individual NewsData
-- source-filter requests. A category-wide run must never mark all publishers successful.
create or replace function public.record_source_freshness_attempt(
  p_source_key text,p_ok boolean,p_had_new_news boolean default null)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not exists(select 1 from public.feeds where 'rss:' || url=p_source_key and active)
     and not exists(select 1 from public.newsdata_sources where 'newsdata:' || source_id=p_source_key) then
    raise exception 'Unknown source key';
  end if;
  insert into public.source_freshness_state(source_key,last_attempt_at,last_success_at,last_result,last_error_code,last_poll_had_new_news)
  values(p_source_key,now(),case when p_ok then now() end,case when p_ok then 'success' else 'error' end,
    case when not p_ok then 'ingestion_error' end,case when p_ok then p_had_new_news end)
  on conflict(source_key) do update set last_attempt_at=excluded.last_attempt_at,
    last_success_at=coalesce(excluded.last_success_at,source_freshness_state.last_success_at),
    last_result=excluded.last_result,last_error_code=excluded.last_error_code,
    last_poll_had_new_news=excluded.last_poll_had_new_news,updated_at=now();
end $$;
revoke all on function public.record_source_freshness_attempt(text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.record_source_freshness_attempt(text,boolean,boolean) to service_role;

create or replace function public.get_source_freshness_snapshot(p_limit integer default 500,p_offset integer default 0)
returns table(source_key text,source_kind text,source_name text,pipeline text,created_at timestamptz,
  expected_cadence_seconds integer,attempt_grace_multiplier numeric,max_published_age_seconds integer,
  max_received_age_seconds integer,initialization_grace_seconds integer,last_attempt_at timestamptz,
  last_success_at timestamptz,last_result text,last_poll_had_new_news boolean,last_published_at timestamptz,
  last_received_at timestamptz,received_count bigint)
language sql stable security definer set search_path = pg_catalog, public as $$
  with sources as (
    select 'rss:' || f.url k,'rss' kind,f.name label,f.pipeline pipe,f.created_at created
      from public.feeds f where f.active
    union all
    select 'newsdata:' || n.source_id,'newsdata',n.source_name,'newsdata',n.updated_at
      from public.newsdata_sources n
      where exists(select 1 from public.source_freshness_state s where s.source_key='newsdata:' || n.source_id and s.received_count>0)
         or exists(select 1 from public.source_freshness_config c where c.source_key='newsdata:' || n.source_id)
  )
  select x.k,x.kind,x.label,x.pipe,x.created,
    coalesce(c.expected_cadence_seconds,case when x.kind='rss' then 900 end),
    coalesce(c.attempt_grace_multiplier,2),coalesce(c.max_published_age_seconds,172800),
    coalesce(c.max_received_age_seconds,86400),coalesce(c.initialization_grace_seconds,3600),
    s.last_attempt_at,s.last_success_at,s.last_result,s.last_poll_had_new_news,
    s.last_published_at,s.last_received_at,coalesce(s.received_count,0)
  from sources x left join public.source_freshness_config c on c.source_key=x.k
    left join public.source_freshness_state s on s.source_key=x.k
  where coalesce(c.enabled,true)
  order by x.k limit least(greatest(p_limit,1),500) offset greatest(p_offset,0);
$$;
revoke all on function public.get_source_freshness_snapshot(integer,integer) from public,anon,authenticated;
grant execute on function public.get_source_freshness_snapshot(integer,integer) to service_role;
commit;
