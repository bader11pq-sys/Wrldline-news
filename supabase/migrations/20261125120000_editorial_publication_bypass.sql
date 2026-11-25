-- Human editorial content must not be judged by the automated source gate.
--
-- The publication gate was written for ingested copy: it asks whether the
-- publisher is known, whether the language is Arabic, whether the topic is hard
-- news and whether there is a regional link. Those questions make sense for a
-- feed item that arrives without an editor. They make no sense for a story the
-- desk wrote and published itself, and they were hiding real stories:
--   * an Arabic editorial saved while the editor was in English mode arrived as
--     lang='en', failed 'non_arabic_unvetted_source' and was served as 410;
--   * a sports story was demoted to the 'leisure' archive and lost its page;
--   * an editorial with an empty source name hit 'missing_source'.
-- Meanwhile the admin dashboard saved the row without telling the editor that
-- the gate had excluded it, so the story looked published in the panel and
-- disappeared from the site.
--
-- This migration gives human-authored WRLDLINE content an explicit lane and
-- re-evaluates the archive. Nothing is deleted. Rollback: restore the previous
-- body of private.wrldline_audience_decision() and run
-- select public.wrldline_gate_backfill(null);

-- ---------------------------------------------------------------------------
-- 1. Register the desk as a source of record
-- ---------------------------------------------------------------------------
insert into public.source_policy (source_key, tier, language, scope, reason) values
  ('wrldline news', 'priority', 'ar', 'local', 'WRLDLINE editorial desk; human-authored original content'),
  ('هيئة التحرير', 'priority', 'ar', 'local', 'WRLDLINE editorial desk; human-authored original content'),
  ('editorial desk', 'priority', 'ar', 'local', 'WRLDLINE editorial desk; human-authored original content')
on conflict (source_key) do update
  set tier = excluded.tier,
      language = excluded.language,
      scope = excluded.scope,
      reason = excluded.reason,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Editorial identity helper
-- ---------------------------------------------------------------------------
create or replace function public.wrldline_is_editorial(p_name text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(btrim(p_name), '') <> ''
    and btrim(p_name) ~* '^(wrldline( news)?|editorial desk|هيئة التحرير|محررو wrldline)$'
$$;

revoke all on function public.wrldline_is_editorial(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The decision function: editorial rows bypass the automated rules
-- ---------------------------------------------------------------------------
create or replace function private.wrldline_audience_decision(
  p_lang text,
  p_title text,
  p_summary text,
  p_category text,
  p_source_name text,
  p_source_url text,
  p_ai_region text,
  p_ai_country_code text,
  p_country text,
  p_event_country text,
  p_source_scope text
)
returns table (lane text, reason text)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_lang      text := lower(btrim(coalesce(p_lang, '')));
  v_title     text := btrim(coalesce(p_title, ''));
  v_text      text;
  v_src_key   text;
  v_tier      text;
  v_category  text := lower(btrim(coalesce(p_category, '')));
  v_relevant  boolean;
  v_meta      text;
begin
  -- 3.0 Human editorial work is published as written. The desk is the source,
  -- so source standing, language and regional-link tests do not apply. Arabic
  -- editorial goes to the main reader surface; English editorial goes to the
  -- vetted world surface so both editions have a real page.
  if public.wrldline_is_editorial(p_source_name) then
    return query select
      (case when v_lang = 'en' then 'world' else 'arabic' end)::text,
      'human_editorial'::text;
    return;
  end if;

  -- 3.1 A headline must say something. A four-character stub is not a story.
  if length(v_title) < 8 then
    return query select 'excluded'::text, 'short_headline'::text;
    return;
  end if;

  -- 3.2 Attribution is mandatory for a public story.
  v_src_key := public.wrldline_source_key(p_source_name, p_source_url);
  if v_src_key is null then
    return query select 'excluded'::text, 'missing_source'::text;
    return;
  end if;

  select sp.tier into v_tier from public.source_policy sp where sp.source_key = v_src_key;

  if v_tier = 'blocked' then
    return query select 'excluded'::text, 'blocked_source'::text;
    return;
  end if;

  v_text := lower(v_title || ' ' || left(coalesce(p_summary, ''), 600));

  -- 3.3 Editorial low-value patterns. Kept deliberately narrow: the source
  -- policy and the language rule already carry most of the weight, so these
  -- patterns only catch boilerplate that slips through a legitimate source.
  if v_text ~ '(crossword|horoscope|sudoku|obituar|classifieds|garage sale|yard sale|church (services|bake sale)|pet of the week|recipe of the day)'
     or v_text ~ '(كلمات متقاطعة|سودوكو|برجك اليوم|حظك اليوم|توقعات الأبراج)'
     or v_text ~ '^(وظائف|إعلان وظائف|فرص عمل|مطلوب للعمل)'
     or v_text ~ '(hiring now|multiple .{0,24}jobs|job openings|now hiring|career opportunities)'
  then
    return query select 'excluded'::text, 'low_value_format'::text;
    return;
  end if;

  -- 3.4 Arabic content is the priority of the platform.
  if v_lang = 'ar' then
    if v_category = 'sports' then
      return query select 'leisure'::text, 'arabic_sport'::text;
      return;
    end if;
    if v_tier is null then
      return query select 'arabic'::text, 'arabic_unvetted_source'::text;
      return;
    end if;
    return query select 'arabic'::text, ('arabic_' || v_tier)::text;
    return;
  end if;

  -- 3.5 Non-Arabic content may only enter through a vetted international
  -- source, on a hard-news topic, and with a supported link to the region.
  if v_tier is null or v_tier not in ('priority', 'approved') then
    return query select 'excluded'::text, 'non_arabic_unvetted_source'::text;
    return;
  end if;

  if v_category not in ('politics', 'economy', 'security', 'world', 'environment') then
    return query select 'excluded'::text, 'non_arabic_off_topic'::text;
    return;
  end if;

  v_meta := lower(
    coalesce(p_ai_country_code, '') || ' ' || coalesce(p_ai_region, '') || ' ' ||
    coalesce(p_country, '') || ' ' || coalesce(p_event_country, '') || ' ' || coalesce(p_source_scope, '')
  );

  v_relevant :=
    v_meta ~ '(^| )(sa|sau|uae|are|qa|qat|kw|kwt|bh|bhr|om|omn|ye|yem|iq|irq|sy|syr|lb|lbn|jo|jor|ps|pse|eg|egy|ly|lby|sd|sdn|mr|mrt|dj|dji|so|som|ma|mar|dz|dza|tn|tun|il|isr|ir|irn|tr|tur)( |$)'
    or v_meta ~ '(middle east|gulf|mena|north africa|levant|arabian peninsula|red sea|horn of africa|persian gulf)'
    or v_text ~ '(hormuz|bab[- ]el[- ]mandeb|bab al[- ]mandab|red sea|suez|opec|oil price|crude|brent|lng|liquefied natural gas|pipeline|tanker|shipping lane|freight rate|container (ship|port)|port of)'
    or v_text ~ '(saudi|riyadh|jeddah|neom|uae|emirat|dubai|abu dhabi|qatar|doha|kuwait|bahrain|oman|muscat|yemen|houthi|iran|tehran|israel|gaza|west bank|lebanon|hezbollah|syria|damascus|iraq|baghdad|egypt|cairo|jordan|amman|sudan|libya|morocco|algeria|tunisia|turkey|türkiye|erdogan)'
    or v_text ~ '(tariff|sanction|trade war|federal reserve|interest rate|inflation|central bank|recession|imf|world bank|supply chain|semiconductor|chip export|energy security)';

  if not v_relevant then
    return query select 'excluded'::text, 'non_arabic_no_regional_link'::text;
    return;
  end if;

  return query select 'world'::text, 'non_arabic_vetted_relevant'::text;
end;
$$;

revoke all on function private.wrldline_audience_decision(text, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Trigger: stamp the new gate version
-- ---------------------------------------------------------------------------
create or replace function private.apply_publication_gate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v record;
begin
  select d.lane, d.reason into v
  from private.wrldline_audience_decision(
    new.lang, new.title, new.summary, new.category,
    new.source_name, coalesce(new.source_url, new.url),
    new.ai_region, new.ai_country_code, new.country, new.event_country, new.source_scope
  ) d;

  new.audience_lane := coalesce(v.lane, 'excluded');
  new.gate_reason := coalesce(v.reason, 'unknown');
  new.gate_version := 'gate-2';
  new.gate_evaluated_at := now();
  return new;
end;
$$;

revoke all on function private.apply_publication_gate() from public, anon, authenticated;

-- Keep the same trigger definition; only the function body changed.
drop trigger if exists wrldline_publication_gate on public.articles;
create trigger wrldline_publication_gate
  before insert or update of title, summary, lang, category, source_name, source_url, url,
    ai_region, ai_country_code, country, event_country, source_scope
  on public.articles
  for each row execute function private.apply_publication_gate();

-- ---------------------------------------------------------------------------
-- 5. Backfill recognises gate-2
-- ---------------------------------------------------------------------------
create or replace function public.wrldline_gate_backfill(p_limit integer default null)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_count bigint := 0;
begin
  with target as (
    select a.id
    from public.articles a
    where a.audience_lane = 'pending'
       or a.gate_version is distinct from 'gate-2'
       or a.gate_evaluated_at is null
    order by a.published_at desc
    limit coalesce(p_limit, 200000)
  ), decisions as (
    select t.id, d.lane, d.reason
    from target t
    join public.articles src on src.id = t.id
    cross join lateral private.wrldline_audience_decision(
      src.lang, src.title, src.summary, src.category,
      src.source_name, coalesce(src.source_url, src.url),
      src.ai_region, src.ai_country_code, src.country, src.event_country, src.source_scope
    ) d
  ), updated as (
    update public.articles a
    set audience_lane = x.lane,
        gate_reason = x.reason,
        gate_version = 'gate-2',
        gate_evaluated_at = now()
    from decisions x
    where a.id = x.id
    returning a.id
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

revoke all on function public.wrldline_gate_backfill(integer) from public, anon, authenticated;
grant execute on function public.wrldline_gate_backfill(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Re-evaluate existing rows, starting with the desk's own stories
-- ---------------------------------------------------------------------------
-- A self-assignment of title fires the BEFORE UPDATE trigger and recomputes the
-- lane without changing the text.
update public.articles
set title = title
where public.wrldline_is_editorial(source_name)
  and (audience_lane is distinct from 'arabic' or gate_version is distinct from 'gate-2');

select public.wrldline_gate_backfill(null);

-- ---------------------------------------------------------------------------
-- 7. Editorial visibility audit for the editor panel
-- ---------------------------------------------------------------------------
create or replace function public.editor_publication_audit(p_limit integer default 40)
returns table (
  id uuid, title text, editorial_status text, published_at timestamptz,
  audience_lane text, gate_reason text, source_name text, category text, lang text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select a.id, left(a.title::text, 300), a.editorial_status::text, a.published_at,
         a.audience_lane::text, a.gate_reason::text, left(a.source_name::text, 200),
         a.category::text, a.lang::text
  from public.articles a
  where private.trust_is_editor()
    and a.published_at >= now() - interval '30 days'
  order by a.published_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$$;

revoke all on function public.editor_publication_audit(integer) from public, anon;
grant execute on function public.editor_publication_audit(integer) to authenticated, service_role;

notify pgrst, 'reload schema';
