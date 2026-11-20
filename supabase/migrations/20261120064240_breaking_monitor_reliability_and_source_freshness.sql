-- WRLDLINE Breaking Desk reliability and source freshness integration.
-- Applied to production on 2026-11-20 as migration 20261120064240.
begin;

create table if not exists private.breaking_monitor_lock (
  lock_key text primary key,
  owner_token uuid not null,
  lease_until timestamptz not null,
  updated_at timestamptz not null default now()
);
revoke all on private.breaking_monitor_lock from public, anon, authenticated, service_role;

create or replace function public.claim_breaking_monitor(p_lease_seconds integer default 240)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_token uuid := gen_random_uuid();
  v_claimed uuid;
begin
  if p_lease_seconds < 60 or p_lease_seconds > 600 then
    raise exception 'Lease duration must be between 60 and 600 seconds';
  end if;
  insert into private.breaking_monitor_lock(lock_key, owner_token, lease_until, updated_at)
  values ('breaking-monitor', v_token, now() + make_interval(secs => p_lease_seconds), now())
  on conflict (lock_key) do update
    set owner_token = excluded.owner_token,
        lease_until = excluded.lease_until,
        updated_at = now()
    where private.breaking_monitor_lock.lease_until <= now()
  returning owner_token into v_claimed;
  return v_claimed;
end;
$$;
revoke all on function public.claim_breaking_monitor(integer) from public, anon, authenticated;
grant execute on function public.claim_breaking_monitor(integer) to service_role;

create or replace function public.release_breaking_monitor(p_owner_token uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_deleted integer;
begin
  delete from private.breaking_monitor_lock
   where lock_key = 'breaking-monitor' and owner_token = p_owner_token;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;
revoke all on function public.release_breaking_monitor(uuid) from public, anon, authenticated;
grant execute on function public.release_breaking_monitor(uuid) to service_role;

insert into public.source_freshness_config
  (source_key, enabled, expected_cadence_seconds, max_published_age_seconds,
   max_received_age_seconds, initialization_grace_seconds, updated_at)
select 'breaking:' || x.publisher, true, 300, 172800, 86400, 600, now()
from (values
  ('الجزيرة'), ('العربية'), ('سكاي نيوز عربية'), ('BBC عربي'), ('CNN عربية'),
  ('DW عربية'), ('آر تي عربي'), ('فرانس 24 عربي'), ('الحرة'), ('وكالة الأناضول العربية'),
  ('عاجل'), ('وكالة الأنباء السعودية واس'), ('أرقام'), ('الاقتصادية'), ('الشرق للأعمال'),
  ('CNBC عربية'), ('وكالة أنباء الإمارات'), ('وفا الفلسطينية'), ('سانا'), ('عنب بلدي'),
  ('الشرق الأوسط'), ('كونا'), ('مدى مصر'), ('مال')
) as x(publisher)
on conflict (source_key) do update set
  enabled = true,
  expected_cadence_seconds = excluded.expected_cadence_seconds,
  max_published_age_seconds = excluded.max_published_age_seconds,
  max_received_age_seconds = excluded.max_received_age_seconds,
  initialization_grace_seconds = excluded.initialization_grace_seconds,
  updated_at = now();

create or replace function public.record_breaking_source_attempts(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item record;
  v_count integer := 0;
begin
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'p_results must be a JSON array';
  end if;

  for item in
    select *
    from jsonb_to_recordset(p_results) as x(
      source_key text,
      ok boolean,
      had_new_news boolean,
      error_code text
    )
  loop
    if not exists (
      select 1 from public.source_freshness_config c
      where c.source_key = item.source_key
        and c.source_key like 'breaking:%'
        and c.enabled
    ) then
      raise exception 'Unknown or disabled breaking source key';
    end if;

    insert into public.source_freshness_state
      (source_key, last_attempt_at, last_success_at, last_result,
       last_error_code, last_poll_had_new_news, updated_at)
    values
      (item.source_key, now(),
       case when coalesce(item.ok, false) then now() end,
       case when coalesce(item.ok, false) then 'success' else 'error' end,
       case when coalesce(item.ok, false) then null else coalesce(item.error_code, 'fetch_error') end,
       case when coalesce(item.ok, false) then coalesce(item.had_new_news, false) end,
       now())
    on conflict (source_key) do update set
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = coalesce(excluded.last_success_at, source_freshness_state.last_success_at),
      last_result = excluded.last_result,
      last_error_code = excluded.last_error_code,
      last_poll_had_new_news = excluded.last_poll_had_new_news,
      updated_at = now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.record_breaking_source_attempts(jsonb) from public, anon, authenticated;
grant execute on function public.record_breaking_source_attempts(jsonb) to service_role;

create or replace function private.capture_breaking_article_freshness()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_suffix constant text := ' Breaking Desk';
  v_publisher text;
  v_key text;
begin
  if new.source_name is null or right(new.source_name, length(v_suffix)) <> v_suffix then
    return new;
  end if;
  v_publisher := left(new.source_name, length(new.source_name) - length(v_suffix));
  v_key := 'breaking:' || v_publisher;

  if exists (select 1 from public.source_freshness_config c where c.source_key = v_key and c.enabled) then
    insert into public.source_freshness_state
      (source_key, last_published_at, last_received_at, received_count, updated_at)
    values
      (v_key, new.published_at, coalesce(new.received_at, now()), 1, now())
    on conflict (source_key) do update set
      last_published_at = greatest(
        coalesce(source_freshness_state.last_published_at, excluded.last_published_at),
        excluded.last_published_at
      ),
      last_received_at = greatest(
        coalesce(source_freshness_state.last_received_at, excluded.last_received_at),
        excluded.last_received_at
      ),
      received_count = source_freshness_state.received_count + 1,
      updated_at = now();
  end if;
  return new;
end;
$$;
revoke all on function private.capture_breaking_article_freshness() from public, anon, authenticated;
drop trigger if exists source_freshness_breaking_article_insert on public.articles;
create trigger source_freshness_breaking_article_insert
after insert on public.articles
for each row execute function private.capture_breaking_article_freshness();

create or replace function public.get_source_freshness_snapshot(p_limit integer default 500,p_offset integer default 0)
returns table(
  source_key text, source_kind text, source_name text, pipeline text, created_at timestamptz,
  expected_cadence_seconds integer, attempt_grace_multiplier numeric, max_published_age_seconds integer,
  max_received_age_seconds integer, initialization_grace_seconds integer, last_attempt_at timestamptz,
  last_success_at timestamptz, last_result text, last_poll_had_new_news boolean, last_published_at timestamptz,
  last_received_at timestamptz, received_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with sources as (
    select 'rss:' || f.url k, 'rss' kind, f.name label, f.pipeline pipe, f.created_at created
      from public.feeds f where f.active
    union all
    select 'newsdata:' || n.source_id, 'newsdata', n.source_name, 'newsdata', n.updated_at
      from public.newsdata_sources n
      where exists (
        select 1 from public.source_freshness_state s
        where s.source_key = 'newsdata:' || n.source_id and s.received_count > 0
      ) or exists (
        select 1 from public.source_freshness_config c
        where c.source_key = 'newsdata:' || n.source_id
      )
    union all
    select c.source_key, 'breaking', substring(c.source_key from 10), 'breaking', c.updated_at
      from public.source_freshness_config c
      where c.source_key like 'breaking:%' and c.enabled
  )
  select x.k,x.kind,x.label,x.pipe,x.created,
    coalesce(c.expected_cadence_seconds, case when x.kind = 'rss' then 900 end),
    coalesce(c.attempt_grace_multiplier, 2),
    coalesce(c.max_published_age_seconds, 172800),
    coalesce(c.max_received_age_seconds, 86400),
    coalesce(c.initialization_grace_seconds, 3600),
    s.last_attempt_at,s.last_success_at,s.last_result,s.last_poll_had_new_news,
    s.last_published_at,s.last_received_at,coalesce(s.received_count,0)
  from sources x
  left join public.source_freshness_config c on c.source_key = x.k
  left join public.source_freshness_state s on s.source_key = x.k
  where coalesce(c.enabled,true)
  order by x.k
  limit least(greatest(p_limit,1),500)
  offset greatest(p_offset,0);
$$;
revoke all on function public.get_source_freshness_snapshot(integer,integer) from public, anon, authenticated;
grant execute on function public.get_source_freshness_snapshot(integer,integer) to service_role;

do $$
declare
  v_secret text;
  v_job bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'wrldline_news_cron_secret_20261113'
  limit 1;
  if v_secret is null or not public.verify_wrldline_cron_secret(v_secret) then
    raise exception 'The existing WRLDLINE cron secret is missing or invalid; no schedule was installed';
  end if;

  select jobid into v_job from cron.job where jobname = 'wrldline-breaking-every-five-minutes';
  if v_job is not null then perform cron.unschedule(v_job); end if;

  perform cron.schedule(
    'wrldline-breaking-every-five-minutes',
    '*/5 * * * *',
    $cron$
      select net.http_post(
        url := 'https://vmaxbnogmmfyrcucapnq.supabase.co/functions/v1/breaking-news-monitor',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-wrldline-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'wrldline_news_cron_secret_20261113' limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cron$
  );

  select jobid into v_job from cron.job where jobname = 'wrldline-source-freshness';
  if v_job is not null then perform cron.alter_job(v_job, active := true); end if;
end;
$$;

commit;
