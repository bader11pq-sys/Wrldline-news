-- Human authorship is decided by WHO saved the row, not by what the source box says.
-- Migration 20261125120000 only bypassed rows whose source name was exactly
-- "WRLDLINE NEWS" / "هيئة التحرير". An editor who typed any other publisher name
-- (or a short headline, or a sports story) still hit the automated gate and got
-- "this story is no longer published". Now any save made by a signed-in editor/admin,
-- and any dashboard-created row (url "editorial-<timestamp>"), is human editorial.
-- Automated ingestion (service role, no editor JWT) keeps the strict gate.
-- Nothing is deleted. Re-run: select public.wrldline_gate_backfill(null);

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
  if public.wrldline_is_editorial(p_source_name)
     or coalesce(p_source_url, '') ~ '^editorial-[0-9]+$'
     or private.trust_is_editor() then
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


-- Re-evaluate when an editor changes status/source too (e.g. publishing a saved draft).
create or replace function private.apply_publication_gate()
returns trigger language plpgsql security definer
set search_path = pg_catalog, private, public as $$
declare v record;
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
end; $$;
revoke all on function private.apply_publication_gate() from public, anon, authenticated;

drop trigger if exists wrldline_publication_gate on public.articles;
create trigger wrldline_publication_gate
  before insert or update of title, summary, lang, category, source_name, source_url, url,
    ai_region, ai_country_code, country, event_country, source_scope, editorial_status
  on public.articles
  for each row execute function private.apply_publication_gate();

-- Re-evaluate everything already stored (dashboard-created rows are now recognised).
update public.articles set title = title where url ~ '^editorial-[0-9]+$';
select public.wrldline_gate_backfill(null);

-- The dashboard reads these two columns to tell the editor whether a story is public.
-- Column-level SELECT had been restricted to an allow-list that predates the gate, so
-- the dashboard's article list and post-publish check were being denied.
grant select (audience_lane, gate_reason) on table public.articles to authenticated;

notify pgrst, 'reload schema';
