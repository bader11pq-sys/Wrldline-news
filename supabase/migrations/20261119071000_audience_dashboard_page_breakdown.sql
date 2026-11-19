-- Add a bounded page-level aggregate to the protected consented-audience dashboard.
-- No raw rows or per-page URLs are exposed.
create or replace function public.audience_dashboard(p_days integer default 7)
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
  with e as materialized (select event_name,session_id,browser_id,received_at,page,article_id,category,active_ms,referrer_category,engagement_type,signup_type from public.audience_events where received_at >= v_since),
  per_article as (select article_id,session_id,sum(coalesce(active_ms,0)) as active_ms,count(*) filter(where event_name='view_article') as views from e where article_id is not null group by article_id,session_id),
  tops as (select p.article_id,a.title,sum(p.views) as views,count(*) filter(where p.active_ms>0) as read_sessions,round(sum(p.active_ms)/1000.0) as active_seconds,round(avg(p.active_ms) filter(where p.active_ms>0)/1000.0,1) as avg_active_seconds
    from per_article p join public.articles a on a.id=p.article_id and a.editorial_status='published' group by p.article_id,a.title order by sum(p.active_ms) desc,sum(p.views) desc limit 12),
  cats as (select coalesce(category,'uncategorized') as category,count(distinct session_id) as sessions,count(*) filter(where event_name='engagement') as engagements,round(sum(coalesce(active_ms,0))/1000.0) as active_seconds from e where article_id is not null group by category order by sum(coalesce(active_ms,0)) desc limit 12),
  pages as (select page,count(*) as views,count(distinct session_id) as sessions from e where event_name='page_view' group by page order by count(*) desc,count(distinct session_id) desc limit 12),
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
    'pages',coalesce((select jsonb_agg(to_jsonb(p)) from pages p),'[]'::jsonb),
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
