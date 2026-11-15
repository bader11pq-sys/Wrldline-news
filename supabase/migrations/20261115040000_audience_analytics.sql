-- WRLDLINE audience measurement: no article/public-account RLS changes here.
-- Raw analytics is service-only. The only editor interface is bounded aggregates.
create table public.audience_events (
  event_id uuid primary key,
  event_name text not null check (event_name in ('page_view','view_article','article_read','engagement','signup','outbound_source_click','search','market_view','newsletter_signup','sponsor_contact','plus_interest')),
  session_id uuid not null,
  browser_id uuid,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  page text not null check (page in ('home','news','account','markets','map','history','newsletter','contact','about','privacy','terms','sources','briefing','other')),
  device_type text not null check (device_type in ('mobile','tablet','desktop')),
  locale text not null check (locale in ('ar','en')),
  referrer_category text not null check (referrer_category in ('direct','internal','search','social','email','messaging','other')),
  article_id uuid,
  category text check (category in ('politics','economy','security','tech','sports','culture','health','science','environment','society','world','uncategorized')),
  content_type text check (content_type in ('news','editorial','analysis','opinion','sponsored','unknown')),
  has_source_link boolean,
  has_query boolean,
  results_count integer check (results_count between 0 and 1000),
  plan text check (plan in ('free','plus','monthly','yearly','newsletter','sponsorship')),
  active_ms integer check (active_ms between 1 and 60000),
  engagement_type text check (engagement_type in ('scroll_50','scroll_90','share','save','follow','reaction')),
  signup_type text check (signup_type in ('account','newsletter')),
  check ((event_name = 'article_read') = (active_ms is not null)),
  check ((event_name = 'engagement') = (engagement_type is not null)),
  check ((event_name = 'signup') = (signup_type is not null)),
  check (event_name not in ('view_article','article_read','outbound_source_click') or article_id is not null)
);
create index audience_events_received_idx on public.audience_events(received_at);
create index audience_events_article_idx on public.audience_events(article_id, received_at) where article_id is not null;
create index audience_events_browser_idx on public.audience_events(browser_id, received_at) where browser_id is not null;
create table public.audience_rate_limits (
  bucket text not null,
  hour timestamptz not null,
  events integer not null check (events between 0 and 5000),
  primary key(bucket, hour)
);
-- One observation per provider subscription in the retention window. This is NOT
-- invoice/payment evidence or the original purchase timestamp. No billing IDs saved.
create table public.audience_plus_verifications (
  provider_key text primary key check (provider_key ~ '^[0-9a-f]{64}$'),
  event_id uuid not null unique,
  session_id uuid not null,
  browser_id uuid,
  verified_at timestamptz not null default now()
);
create index audience_plus_verified_idx on public.audience_plus_verifications(verified_at);
alter table public.audience_events enable row level security;
alter table public.audience_rate_limits enable row level security;
alter table public.audience_plus_verifications enable row level security;
revoke all on public.audience_events, public.audience_rate_limits, public.audience_plus_verifications from public, anon, authenticated;
grant select, insert, update, delete on public.audience_events, public.audience_rate_limits, public.audience_plus_verifications to service_role;

create function public.audience_take_budget(p_session uuid, p_count integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_global integer;
  v_session integer;
begin
  if p_count < 1 or p_count > 10 or p_session is null then raise exception 'invalid_audience_payload'; end if;
  -- Global lock makes caps atomic across all edge isolates. Bucket cardinality is
  -- bounded by the global allowance; no arbitrary user-controlled SQL identifiers.
  perform pg_advisory_xact_lock(2026111504);
  select events into v_global from public.audience_rate_limits where bucket = 'global' and hour = v_hour;
  select events into v_session from public.audience_rate_limits where bucket = p_session::text and hour = v_hour;
  if coalesce(v_global,0) + p_count > 5000 or coalesce(v_session,0) + p_count > 120 then
    raise exception 'audience_rate_limit';
  end if;
  insert into public.audience_rate_limits(bucket,hour,events) values ('global',v_hour,p_count), (p_session::text,v_hour,p_count)
    on conflict(bucket,hour) do update set events = public.audience_rate_limits.events + excluded.events;
end;
$$;
revoke all on function public.audience_take_budget(uuid,integer) from public, anon, authenticated, service_role;

create function public.audience_ingest_events(p_events jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid;
  v_count integer;
  v_inserted integer;
  v_read_ms bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) not between 1 and 10 or octet_length(p_events::text) > 16384 then
    raise exception 'invalid_audience_payload';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_events) e
    where jsonb_typeof(e) <> 'object' or exists (
      select 1 from jsonb_object_keys(e) k where k not in ('event_id','name','occurred_at','session_id','browser_id','page','device_type','locale','referrer_category','article_id','category','content_type','has_source_link','has_query','results_count','plan','active_ms','engagement_type','signup_type')
    )
  ) then raise exception 'invalid_audience_payload'; end if;
  select count(distinct x.session_id), min(x.session_id::text)::uuid, coalesce(sum(x.active_ms),0)
    into v_count,v_session,v_read_ms
    from jsonb_to_recordset(p_events) as x(session_id uuid, active_ms integer);
  if v_count <> 1 or v_session is null then raise exception 'invalid_audience_payload'; end if;
  if exists (select 1 from jsonb_to_recordset(p_events) as x(occurred_at timestamptz)
      where x.occurred_at is null or x.occurred_at < now()-interval '1 day' or x.occurred_at > now()+interval '1 minute') then
    raise exception 'invalid_audience_payload';
  end if;
  perform public.audience_take_budget(v_session,jsonb_array_length(p_events));
  if coalesce((select sum(active_ms) from public.audience_events where session_id=v_session and received_at >= date_trunc('hour',now())),0) + v_read_ms > 3600000 then
    raise exception 'audience_rate_limit';
  end if;
  insert into public.audience_events(event_id,event_name,session_id,browser_id,occurred_at,page,device_type,locale,referrer_category,article_id,category,content_type,has_source_link,has_query,results_count,plan,active_ms,engagement_type,signup_type)
  select x.event_id,x.name,x.session_id,x.browser_id,x.occurred_at,x.page,x.device_type,x.locale,x.referrer_category,x.article_id,
    case when x.article_id is not null then case when a.category in ('politics','economy','security','tech','sports','culture','health','science','environment','society','world','uncategorized') then a.category else 'uncategorized' end else x.category end,
    x.content_type,x.has_source_link,x.has_query,x.results_count,x.plan,x.active_ms,x.engagement_type,x.signup_type
  from jsonb_to_recordset(p_events) as x(event_id uuid,name text,session_id uuid,browser_id uuid,occurred_at timestamptz,page text,device_type text,locale text,referrer_category text,article_id uuid,category text,content_type text,has_source_link boolean,has_query boolean,results_count integer,plan text,active_ms integer,engagement_type text,signup_type text)
  left join public.articles a on a.id=x.article_id and a.editorial_status='published'
  where x.article_id is null or a.id is not null
  on conflict(event_id) do nothing;
  get diagnostics v_inserted = row_count;
  return jsonb_build_object('accepted',v_inserted);
end;
$$;
revoke all on function public.audience_ingest_events(jsonb) from public, anon, authenticated;
grant execute on function public.audience_ingest_events(jsonb) to service_role;

create function public.audience_verify_plus(p_user_id uuid, p_event_id uuid, p_session_id uuid, p_browser_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_provider text;
  v_inserted integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if p_user_id is null or p_event_id is null or p_session_id is null then raise exception 'invalid_audience_payload'; end if;
  perform public.audience_take_budget(p_session_id,1);
  select encode(sha256(convert_to(s.stripe_subscription_id,'UTF8')),'hex') into v_provider
  from public.subscriptions s
  where s.user_id=p_user_id and s.plan='plus' and s.status='active'
    and s.stripe_subscription_id is not null and s.stripe_subscription_id <> ''
    and s.current_period_end > now()
  limit 1;
  if v_provider is null then return jsonb_build_object('verified',false,'new_verification',false,'paid_receipt_verified',false); end if;
  insert into public.audience_plus_verifications(provider_key,event_id,session_id,browser_id)
    values(v_provider,p_event_id,p_session_id,p_browser_id) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return jsonb_build_object('verified',true,'new_verification',v_inserted=1,'paid_receipt_verified',false);
end;
$$;
revoke all on function public.audience_verify_plus(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.audience_verify_plus(uuid,uuid,uuid,uuid) to service_role;

create function public.audience_dashboard(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_since timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') not in ('editor','admin') then
    raise exception 'Editorial role required' using errcode='42501';
  end if;
  if p_days is null or p_days not in (1,7,30) then raise exception 'Choose 1, 7 or 30 days'; end if;
  v_since := now()-make_interval(days=>p_days);
  with e as materialized (select event_name,session_id,browser_id,received_at,article_id,category,active_ms,referrer_category,engagement_type,signup_type from public.audience_events where received_at >= v_since),
  per_article as (select article_id,session_id,sum(coalesce(active_ms,0)) as active_ms,count(*) filter(where event_name='view_article') as views from e where article_id is not null group by article_id,session_id),
  tops as (select p.article_id,a.title,sum(p.views) as views,count(*) filter(where p.active_ms>0) as read_sessions,round(sum(p.active_ms)/1000.0) as active_seconds,round(avg(p.active_ms) filter(where p.active_ms>0)/1000.0,1) as avg_active_seconds
    from per_article p join public.articles a on a.id=p.article_id and a.editorial_status='published' group by p.article_id,a.title order by sum(p.active_ms) desc,sum(p.views) desc limit 12),
  cats as (select coalesce(category,'uncategorized') as category,count(distinct session_id) as sessions,count(*) filter(where event_name='engagement') as engagements,round(sum(coalesce(active_ms,0))/1000.0) as active_seconds from e where article_id is not null group by category order by sum(coalesce(active_ms,0)) desc limit 12),
  arrivals as (select referrer_category,count(distinct session_id) as sessions from e where event_name='page_view' group by referrer_category order by count(distinct session_id) desc limit 7),
  engages as (select engagement_type,count(*) as events,count(distinct session_id) as sessions from e where event_name='engagement' group by engagement_type order by count(*) desc limit 6),
  returning_browsers as (select browser_id from e where browser_id is not null group by browser_id having count(distinct session_id)>1)
  select jsonb_build_object(
    'days',p_days,'generated_at',now(),'scope','consenting_browsers_only',
    'summary',jsonb_build_object(
      'measured_sessions',(select count(distinct session_id) from e),
      'reading_sessions',(select count(distinct session_id) from e where event_name='article_read'),
      'opt_in_browsers',(select count(distinct browser_id) from e where browser_id is not null),
      'returning_opt_in_browsers',(select count(*) from returning_browsers),
      'active_seconds',(select round(coalesce(sum(active_ms),0)/1000.0) from e),
      'engagement_events',(select count(*) from e where event_name='engagement')),
    'top_news',coalesce((select jsonb_agg(to_jsonb(t)) from tops t),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(c)) from cats c),'[]'::jsonb),
    'arrivals',coalesce((select jsonb_agg(to_jsonb(r)) from arrivals r),'[]'::jsonb),
    'engagement',coalesce((select jsonb_agg(to_jsonb(g)) from engages g),'[]'::jsonb),
    'funnel',jsonb_build_object(
      'plus_interest_sessions',(select count(distinct session_id) from e where event_name='plus_interest'),
      'account_signup_sessions',(select count(distinct session_id) from e where event_name='signup' and signup_type='account'),
      'newsletter_signup_sessions',(select count(distinct session_id) from e where event_name='newsletter_signup' or (event_name='signup' and signup_type='newsletter')),
      'verified_active_plus_sessions',(select count(distinct session_id) from public.audience_plus_verifications where verified_at>=v_since),
      'paid_receipt_verified',false),
    'billing_snapshot',jsonb_build_object(
      'scope','all_accounts_not_consent_cohort',
      'active_provider_plus',(select count(*) from public.subscriptions where plan='plus' and status='active' and stripe_subscription_id is not null and stripe_subscription_id<>'' and current_period_end>now()),
      'trialing_plus',(select count(*) from public.subscriptions where plan='plus' and status='trialing' and current_period_end>now()),
      'paid_conversion_available',false),
    'retention',jsonb_build_object('events_days',30,'browser_id_days',7,'cron_installed',exists(select 1 from pg_catalog.pg_extension where extname='pg_cron'))
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.audience_dashboard(integer) from public, anon;
grant execute on function public.audience_dashboard(integer) to authenticated;

create function public.audience_prune()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.audience_events where received_at < now()-interval '30 days';
  update public.audience_events set browser_id=null where browser_id is not null and received_at < now()-interval '7 days';
  delete from public.audience_plus_verifications where verified_at < now()-interval '30 days';
  update public.audience_plus_verifications set browser_id=null where browser_id is not null and verified_at < now()-interval '7 days';
  delete from public.audience_rate_limits where hour < date_trunc('hour',now())-interval '2 hours';
end;
$$;
revoke all on function public.audience_prune() from public, anon, authenticated;
grant execute on function public.audience_prune() to service_role;
do $$
begin
  if exists(select 1 from pg_catalog.pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='wrldline-audience-retention';
    perform cron.schedule('wrldline-audience-retention','17 * * * *','select public.audience_prune();');
  else
    raise warning 'Enable pg_cron and schedule public.audience_prune() hourly before activating analytics';
  end if;
end;
$$;
