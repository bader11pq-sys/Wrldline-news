-- WRLDLINE publication gate
-- Purpose: stop publishing a story merely because it reached the database.
-- Every article is evaluated against a deterministic, auditable policy:
--   * language of the article
--   * source standing (priority / approved / monitor / blocked)
--   * editorial topic
--   * a supported link to the Arab reader and the Gulf
-- The decision is persisted on the row so the reader surface, the archive,
-- the feeds and the sitemaps all agree, and so an editor can see why a story
-- was held back.
--
-- Nothing is deleted. The gate only decides public visibility, and it can be
-- recomputed at any time with public.wrldline_gate_backfill().

-- ---------------------------------------------------------------------------
-- 1. Source policy registry
-- ---------------------------------------------------------------------------
create table if not exists public.source_policy (
  source_key text primary key,
  tier text not null check (tier in ('priority', 'approved', 'monitor', 'blocked')),
  language text check (language in ('ar', 'en', 'other')),
  scope text check (scope in ('arab', 'gulf', 'international', 'local', 'aggregator', 'unknown')),
  reason text,
  updated_at timestamptz not null default now()
);

comment on table public.source_policy is
  'Editorial standing of a news source. Used by the publication gate. Service-role only.';

alter table public.source_policy enable row level security;

-- No policies on purpose: the table is read by SECURITY DEFINER functions and
-- written by the editorial team through the service role, never by the browser.

-- ---------------------------------------------------------------------------
-- 2. Source key normalisation
-- ---------------------------------------------------------------------------
create or replace function public.wrldline_source_key(p_name text, p_url text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_url  text := btrim(coalesce(p_url, ''));
  v_key  text;
begin
  -- Some legacy rows stored the feed URL in the source-name column.
  if v_name ~* '^https?://' then
    v_url := v_name;
    v_name := '';
  end if;
  -- Aggregators append their own name to the publisher label, e.g. "Reuters (Google News)".
  v_name := regexp_replace(v_name, '\s*\((google news|msn|yahoo[^)]*)\)\s*$', '', 'i');
  v_name := btrim(regexp_replace(v_name, '\s+', ' ', 'g'));
  if v_name <> '' then
    return lower(v_name);
  end if;
  v_key := substring(v_url from '^https?://(?:www\.)?([^/?#]+)');
  return nullif(lower(btrim(coalesce(v_key, ''))), '');
end;
$$;

revoke all on function public.wrldline_source_key(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The decision function
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
-- 4. Persisted decision on the article row
-- ---------------------------------------------------------------------------
alter table public.articles
  add column if not exists audience_lane text not null default 'pending',
  add column if not exists gate_reason text,
  add column if not exists gate_version text not null default 'gate-1',
  add column if not exists gate_evaluated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'articles_audience_lane_check' and conrelid = 'public.articles'::regclass
  ) then
    alter table public.articles
      add constraint articles_audience_lane_check
      check (audience_lane in ('arabic', 'world', 'leisure', 'excluded', 'pending'));
  end if;
end;
$$;

comment on column public.articles.audience_lane is
  'Publication gate lane: arabic = main reader surface, world = vetted non-Arabic regional coverage, leisure = sport/light archive only, excluded = not published to readers, pending = not yet evaluated.';

-- Only the public lanes are ever queried by the reader surface.
create index if not exists articles_public_lane_published_idx
  on public.articles (audience_lane, published_at desc)
  where editorial_status = 'published';

create index if not exists articles_public_lane_sitemap_idx
  on public.articles (id)
  where editorial_status = 'published' and audience_lane in ('arabic', 'world');

-- ---------------------------------------------------------------------------
-- 5. Gate application (trigger + backfill)
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
  new.gate_version := 'gate-1';
  new.gate_evaluated_at := now();
  return new;
end;
$$;

revoke all on function private.apply_publication_gate() from public, anon, authenticated;

-- Name ordering matters: BEFORE triggers fire alphabetically, and
-- trust_article_guard must settle the trust fields before the gate reads them.
drop trigger if exists wrldline_publication_gate on public.articles;
create trigger wrldline_publication_gate
  before insert or update of title, summary, lang, category, source_name, source_url, url,
    ai_region, ai_country_code, country, event_country, source_scope
  on public.articles
  for each row execute function private.apply_publication_gate();

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
       or a.gate_version is distinct from 'gate-1'
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
        gate_version = 'gate-1',
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
-- 6. Seed the source registry
-- ---------------------------------------------------------------------------
insert into public.source_policy (source_key, tier, language, scope, reason) values
  -- Aggregators and low-provenance labels: we cannot attribute a story to them.
  ('newsbreak', 'blocked', 'en', 'aggregator', 'Aggregator feed of local US notices and job listings'),
  ('google news', 'blocked', 'en', 'aggregator', 'Aggregator label; the originating publisher must be attributed instead'),
  ('msn', 'blocked', 'en', 'aggregator', 'Aggregator label'),
  ('yahoo news', 'blocked', 'en', 'aggregator', 'Aggregator label'),
  ('sports.yahoo.com', 'blocked', 'en', 'aggregator', 'Aggregator sports feed'),
  ('all news', 'blocked', 'en', 'aggregator', 'Unattributable aggregate label'),
  ('shotoe nigeria', 'blocked', 'en', 'aggregator', 'Low-provenance republisher'),

  -- Arabic outlets of record.
  ('الشرق الأوسط', 'priority', 'ar', 'arab', 'Saudi daily of record'),
  ('الجزيرة', 'priority', 'ar', 'arab', 'Regional broadcaster'),
  ('العربية', 'priority', 'ar', 'gulf', 'Gulf broadcaster'),
  ('سكاي نيوز عربية', 'priority', 'ar', 'gulf', 'Gulf broadcaster'),
  ('الشرق', 'priority', 'ar', 'gulf', 'Saudi daily'),
  ('البيان', 'priority', 'ar', 'gulf', 'UAE daily'),
  ('الخليج', 'priority', 'ar', 'gulf', 'UAE daily'),
  ('الاتحاد', 'priority', 'ar', 'gulf', 'UAE daily'),
  ('الرياض', 'priority', 'ar', 'gulf', 'Saudi daily'),
  ('عكاظ', 'priority', 'ar', 'gulf', 'Saudi daily'),
  ('المدينة', 'priority', 'ar', 'gulf', 'Saudi daily'),
  ('الاقتصادية', 'priority', 'ar', 'gulf', 'Saudi business daily'),
  ('وكالة الأنباء السعودية واس', 'priority', 'ar', 'gulf', 'Saudi state news agency'),
  ('كونا', 'priority', 'ar', 'gulf', 'Kuwait state news agency'),
  ('وكالة أنباء الإمارات', 'priority', 'ar', 'gulf', 'UAE state news agency'),
  ('وكالة الأنباء القطرية', 'priority', 'ar', 'gulf', 'Qatar state news agency'),
  ('وكالة الأنباء العُمانية', 'priority', 'ar', 'gulf', 'Oman state news agency'),
  ('العربي الجديد', 'priority', 'ar', 'arab', 'Pan-Arab daily'),
  ('القدس العربي', 'priority', 'ar', 'arab', 'Pan-Arab daily'),
  ('النهار اللبنانية', 'priority', 'ar', 'arab', 'Lebanese daily'),
  ('الشرق للأعمال', 'priority', 'ar', 'gulf', 'Saudi business outlet'),
  ('هسبريس', 'priority', 'ar', 'arab', 'Moroccan outlet'),
  ('يورونيوز عربي', 'priority', 'ar', 'international', 'International broadcaster, Arabic edition'),
  ('فرانس 24 عربي', 'priority', 'ar', 'international', 'International broadcaster, Arabic edition'),
  ('BBC عربي', 'priority', 'ar', 'international', 'International broadcaster, Arabic edition'),
  ('DW عربية', 'priority', 'ar', 'international', 'International broadcaster, Arabic edition'),
  ('CNN عربية', 'priority', 'ar', 'international', 'International broadcaster, Arabic edition'),
  ('CNBC عربية', 'priority', 'ar', 'gulf', 'Business broadcaster, Arabic edition'),
  ('أرقام', 'priority', 'ar', 'gulf', 'Saudi market data outlet'),
  ('مال', 'priority', 'ar', 'gulf', 'Saudi financial outlet'),

  -- Other Arabic outlets: usable, individually attributable.
  ('سانا', 'approved', 'ar', 'arab', 'Syrian state agency; attribute statements as official'),
  ('آر تي عربي', 'approved', 'ar', 'international', 'State-funded broadcaster; attribute clearly'),
  ('وكالة الأناضول العربية', 'approved', 'ar', 'international', 'Turkish state agency'),
  ('عربي21', 'approved', 'ar', 'arab', 'Pan-Arab outlet'),
  ('إل بي سي آي اللبنانية', 'approved', 'ar', 'arab', 'Lebanese broadcaster'),
  ('اليوم السابع', 'approved', 'ar', 'arab', 'Egyptian daily'),
  ('المصري اليوم', 'approved', 'ar', 'arab', 'Egyptian daily'),
  ('الأهرام', 'approved', 'ar', 'arab', 'Egyptian daily'),
  ('مصراوي', 'approved', 'ar', 'arab', 'Egyptian outlet'),
  ('الرؤية', 'approved', 'ar', 'gulf', 'Oman daily'),
  ('الإمارات اليوم', 'approved', 'ar', 'gulf', 'UAE daily'),
  ('أخبار 24', 'approved', 'ar', 'gulf', 'Saudi outlet'),
  ('سبق', 'approved', 'ar', 'gulf', 'Saudi outlet'),
  ('الجزيرة السعودية', 'approved', 'ar', 'gulf', 'Saudi outlet'),
  ('شفق نيوز', 'approved', 'ar', 'arab', 'Iraqi agency'),
  ('وفا الفلسطينية', 'approved', 'ar', 'arab', 'Palestinian state agency'),
  ('لبنان 24', 'approved', 'ar', 'arab', 'Lebanese outlet'),
  ('المدن', 'approved', 'ar', 'arab', 'Lebanese outlet'),
  ('رؤيا', 'approved', 'ar', 'arab', 'Jordanian broadcaster'),
  ('الحدث عاجل Breaking Desk', 'approved', 'ar', 'arab', 'Arabic breaking desk feed'),
  ('عاجل Breaking Desk', 'approved', 'ar', 'arab', 'Arabic breaking desk feed'),
  ('الجزيرة عاجل Breaking Desk', 'approved', 'ar', 'arab', 'Arabic breaking desk feed'),
  ('الميادين عاجل Breaking Desk', 'approved', 'ar', 'arab', 'Arabic breaking desk feed'),
  ('الشرق عاجل Breaking', 'approved', 'ar', 'gulf', 'Arabic breaking desk feed'),
  ('الحدث عاجل Breaking', 'approved', 'ar', 'arab', 'Arabic breaking desk feed'),
  ('الجزيرة الآن Breaking', 'approved', 'ar', 'arab', 'Arabic breaking desk feed'),
  ('الميادين عاجل Breaking', 'approved', 'ar', 'arab', 'Arabic breaking desk feed'),
  ('مباشر', 'approved', 'ar', 'gulf', 'Arabic financial outlet'),
  ('إيلاف', 'approved', 'ar', 'arab', 'Pan-Arab outlet'),
  ('الوطن', 'approved', 'ar', 'gulf', 'Arabic daily'),
  ('جريدة البلاد', 'approved', 'ar', 'gulf', 'Bahraini daily'),
  ('الراي', 'approved', 'ar', 'gulf', 'Kuwaiti daily'),
  ('القبس', 'approved', 'ar', 'gulf', 'Kuwaiti daily'),
  ('الأنباء', 'approved', 'ar', 'gulf', 'Kuwaiti daily'),
  ('جريدة الخليج', 'approved', 'ar', 'gulf', 'UAE daily'),
  ('الوطن - صوت عُمان', 'approved', 'ar', 'gulf', 'Oman daily'),
  ('جريدة الوطن - صوت عُمان', 'approved', 'ar', 'gulf', 'Oman daily'),
  ('عدن الغد', 'approved', 'ar', 'arab', 'Yemeni outlet'),
  ('المشهد اليمني', 'approved', 'ar', 'arab', 'Yemeni outlet'),
  ('التغيير نت', 'approved', 'ar', 'arab', 'Yemeni outlet'),
  ('سبتمبر نت - 26', 'approved', 'ar', 'arab', 'Yemeni outlet'),
  ('الوئام', 'approved', 'ar', 'gulf', 'Saudi outlet'),
  ('صدى البلد', 'approved', 'ar', 'arab', 'Egyptian outlet'),
  ('جريدة المال', 'approved', 'ar', 'arab', 'Egyptian business daily'),
  ('جريدة القدس', 'approved', 'ar', 'arab', 'Palestinian daily'),
  ('القدس', 'approved', 'ar', 'arab', 'Palestinian daily'),
  ('جريدة البشاير', 'approved', 'ar', 'arab', 'Egyptian outlet'),
  ('أخبارنا', 'approved', 'ar', 'arab', 'Moroccan outlet'),
  ('موزاييك إف إم', 'approved', 'ar', 'arab', 'Tunisian broadcaster'),
  ('ليبيا أخبار', 'approved', 'ar', 'arab', 'Libyan outlet'),
  ('الأخبار اللبنانية', 'approved', 'ar', 'arab', 'Lebanese daily'),
  ('الجزيرة نت', 'priority', 'ar', 'arab', 'Regional broadcaster'),
  ('الجزيرة.نت', 'priority', 'ar', 'arab', 'Regional broadcaster'),
  ('اندبندنت عربية', 'priority', 'ar', 'arab', 'Independent Arabia'),
  ('ذا ناشيونال', 'approved', 'ar', 'gulf', 'UAE English-language daily, Arabic edition'),
  ('الخليج أونلاين', 'approved', 'ar', 'arab', 'Pan-Arab outlet'),
  ('السومرية', 'approved', 'ar', 'arab', 'Iraqi outlet'),
  ('رووداو', 'approved', 'ar', 'arab', 'Kurdish regional outlet'),

  -- Vetted international sources: the only route for non-Arabic coverage.
  ('reuters', 'priority', 'en', 'international', 'Wire service of record'),
  ('associated press', 'priority', 'en', 'international', 'Wire service of record'),
  ('afp', 'priority', 'en', 'international', 'Wire service of record'),
  ('agence france-presse', 'priority', 'en', 'international', 'Wire service of record'),
  ('bloomberg', 'priority', 'en', 'international', 'Financial wire'),
  ('financial times', 'priority', 'en', 'international', 'Financial daily of record'),
  ('the wall street journal', 'priority', 'en', 'international', 'Financial daily of record'),
  ('the new york times', 'priority', 'en', 'international', 'International daily of record'),
  ('the guardian', 'priority', 'en', 'international', 'International daily'),
  ('bbc news', 'priority', 'en', 'international', 'International broadcaster'),
  ('al jazeera english', 'priority', 'en', 'international', 'Regional broadcaster, English edition'),
  ('the economist', 'priority', 'en', 'international', 'Weekly of record'),
  ('nikkei asia', 'priority', 'en', 'international', 'Asian business daily'),
  ('south china morning post', 'approved', 'en', 'international', 'Asian daily'),
  ('the straits times', 'approved', 'en', 'international', 'Asian daily'),
  ('gulf news', 'priority', 'en', 'gulf', 'Gulf daily'),
  ('the national', 'priority', 'en', 'gulf', 'UAE daily'),
  ('arab news', 'priority', 'en', 'gulf', 'Saudi daily'),
  ('asharq al-awsat', 'priority', 'en', 'arab', 'Pan-Arab daily'),
  ('middle east eye', 'approved', 'en', 'international', 'Regional outlet'),
  ('cnn', 'approved', 'en', 'international', 'International broadcaster'),
  ('cnbc', 'approved', 'en', 'international', 'Business broadcaster'),
  ('france 24', 'approved', 'en', 'international', 'International broadcaster'),
  ('dw news', 'approved', 'en', 'international', 'International broadcaster'),
  ('sky news', 'approved', 'en', 'international', 'International broadcaster'),
  ('the independent', 'approved', 'en', 'international', 'International daily'),
  ('cna', 'approved', 'en', 'international', 'Asian broadcaster'),
  ('the times of india', 'approved', 'en', 'international', 'Indian daily'),
  ('times of india', 'approved', 'en', 'international', 'Indian daily'),
  ('the hindu', 'approved', 'en', 'international', 'Indian daily'),
  ('the hindu - home', 'approved', 'en', 'international', 'Indian daily'),
  ('dawn', 'approved', 'en', 'international', 'Pakistani daily'),
  ('tass', 'approved', 'en', 'international', 'Russian state agency; attribute clearly'),
  ('kyodo news', 'approved', 'en', 'international', 'Japanese agency'),
  ('the hill', 'approved', 'en', 'international', 'US political outlet'),
  ('newsweek', 'approved', 'en', 'international', 'US weekly'),
  ('the sydney morning herald', 'approved', 'en', 'international', 'Australian daily'),
  ('the globe and mail', 'approved', 'en', 'international', 'Canadian daily')
on conflict (source_key) do update
  set tier = excluded.tier,
      language = excluded.language,
      scope = excluded.scope,
      reason = excluded.reason,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 7. Public RPCs respect the gate
-- ---------------------------------------------------------------------------

-- v3 keeps its signature so existing callers immediately stop receiving
-- out-of-scope material; it now serves the Arabic reader lane only.
create or replace function public.public_home_news_recent_v3(
  p_limit integer default 100,
  p_before timestamptz default now(),
  p_since timestamptz default null,
  p_offset integer default 0,
  p_newsdata_only boolean default null,
  p_is_breaking boolean default null,
  p_is_exclusive boolean default null
)
returns table (
  id uuid, title text, summary text, image_url text, lang text, category text, country text,
  event_country text, source_language text, source_scope text, language_detection text,
  source_name text, source_url text, url text, published_at timestamptz, is_breaking boolean,
  verification text, correction_note text, corrected_at timestamptz, media_type text,
  content_type text, sponsor_name text, sponsor_url text, ai_country_code text, ai_summary text,
  ai_reader_impact text, ai_watch_next text, ai_risk_level text, ai_risk_score integer,
  is_exclusive boolean, exclusive_type text, newsdata_article_id text, newsdata_categories text[],
  newsdata_ai_tags jsonb, newsdata_sentiment text, newsdata_ai_summary text,
  newsdata_fetched_at timestamptz, newsdata_only boolean, article_translations jsonb,
  verification_source_count integer, verification_independent_count integer,
  verification_official_count integer, verification_conflict_count integer,
  verification_correction_count integer, verification_retraction_count integer,
  verification_updated_at timestamptz, verification_note text, editorial_trust_status text,
  trust_needs_review boolean
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
 select
  a.id,left(a.title::text,1000),left(a.summary::text,12000),left(a.image_url::text,4096),
  a.lang::text,a.category::text,a.country::text,a.event_country::text,a.source_language::text,
  a.source_scope::text,a.language_detection::text,left(a.source_name::text,300),
  left(a.source_url::text,4096),left(a.url::text,4096),a.published_at::timestamptz,a.is_breaking,
  a.verification::text,left(a.correction_note::text,4000),a.corrected_at::timestamptz,
  a.media_type::text,a.content_type::text,left(a.sponsor_name::text,300),left(a.sponsor_url::text,4096),
  a.ai_country_code::text,left(a.ai_summary::text,12000),left(a.ai_reader_impact::text,900),
  left(a.ai_watch_next::text,900),a.ai_risk_level::text,a.ai_risk_score,a.is_exclusive,a.exclusive_type,
  a.newsdata_article_id::text,a.newsdata_categories,a.newsdata_ai_tags,a.newsdata_sentiment::text,
  left(a.newsdata_ai_summary::text,12000),a.newsdata_fetched_at::timestamptz,a.newsdata_only,
  coalesce((select jsonb_agg(jsonb_build_object(
    'lang',t.lang,'title',left(t.title::text,1000),'summary',left(t.summary::text,12000),
    'ai_summary',left(t.ai_summary::text,12000),'translation_status',t.translation_status,
    'translation_source',t.translation_source
  ) order by t.lang) from public.article_translations t
    where t.article_id=a.id and t.translation_status='published' and nullif(btrim(t.title),'') is not null),'[]'::jsonb),
  a.verification_source_count,a.verification_independent_count,a.verification_official_count,
  a.verification_conflict_count,a.verification_correction_count,a.verification_retraction_count,
  a.verification_updated_at,left(a.verification_note::text,4000),
  case when a.trust_needs_review then case when a.editorial_trust_status='disputed' then 'disputed' else 'unconfirmed' end else a.editorial_trust_status end,
  a.trust_needs_review
 from public.articles a
 where a.editorial_status='published' and a.published_at is not null
  and a.audience_lane = 'arabic'
  and a.published_at<=least(coalesce(p_before,now()),now())
  and (p_since is null or a.published_at>=p_since)
  and (p_newsdata_only is null or a.newsdata_only=p_newsdata_only)
  and (p_is_breaking is null or a.is_breaking=p_is_breaking)
  and (p_is_exclusive is null or a.is_exclusive=p_is_exclusive)
 order by a.published_at desc,a.id asc
 limit greatest(1,least(coalesce(p_limit,100),1000))
 offset greatest(0,least(coalesce(p_offset,0),50000000));
$function$;

-- v4 adds an explicit lane so the reader can ask for the Arabic desk, the
-- vetted world desk, or both, without changing the shape of the payload.
create or replace function public.public_home_news_recent_v4(
  p_limit integer default 100,
  p_before timestamptz default now(),
  p_since timestamptz default null,
  p_offset integer default 0,
  p_newsdata_only boolean default null,
  p_is_breaking boolean default null,
  p_is_exclusive boolean default null,
  p_lane text default 'arabic'
)
returns table (
  id uuid, title text, summary text, image_url text, lang text, category text, country text,
  event_country text, source_language text, source_scope text, language_detection text,
  source_name text, source_url text, url text, published_at timestamptz, is_breaking boolean,
  verification text, correction_note text, corrected_at timestamptz, media_type text,
  content_type text, sponsor_name text, sponsor_url text, ai_country_code text, ai_summary text,
  ai_reader_impact text, ai_watch_next text, ai_risk_level text, ai_risk_score integer,
  is_exclusive boolean, exclusive_type text, newsdata_article_id text, newsdata_categories text[],
  newsdata_ai_tags jsonb, newsdata_sentiment text, newsdata_ai_summary text,
  newsdata_fetched_at timestamptz, newsdata_only boolean, article_translations jsonb,
  verification_source_count integer, verification_independent_count integer,
  verification_official_count integer, verification_conflict_count integer,
  verification_correction_count integer, verification_retraction_count integer,
  verification_updated_at timestamptz, verification_note text, editorial_trust_status text,
  trust_needs_review boolean, audience_lane text
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
 select
  a.id,left(a.title::text,1000),left(a.summary::text,12000),left(a.image_url::text,4096),
  a.lang::text,a.category::text,a.country::text,a.event_country::text,a.source_language::text,
  a.source_scope::text,a.language_detection::text,left(a.source_name::text,300),
  left(a.source_url::text,4096),left(a.url::text,4096),a.published_at::timestamptz,a.is_breaking,
  a.verification::text,left(a.correction_note::text,4000),a.corrected_at::timestamptz,
  a.media_type::text,a.content_type::text,left(a.sponsor_name::text,300),left(a.sponsor_url::text,4096),
  a.ai_country_code::text,left(a.ai_summary::text,12000),left(a.ai_reader_impact::text,900),
  left(a.ai_watch_next::text,900),a.ai_risk_level::text,a.ai_risk_score,a.is_exclusive,a.exclusive_type,
  a.newsdata_article_id::text,a.newsdata_categories,a.newsdata_ai_tags,a.newsdata_sentiment::text,
  left(a.newsdata_ai_summary::text,12000),a.newsdata_fetched_at::timestamptz,a.newsdata_only,
  coalesce((select jsonb_agg(jsonb_build_object(
    'lang',t.lang,'title',left(t.title::text,1000),'summary',left(t.summary::text,12000),
    'ai_summary',left(t.ai_summary::text,12000),'translation_status',t.translation_status,
    'translation_source',t.translation_source
  ) order by t.lang) from public.article_translations t
    where t.article_id=a.id and t.translation_status='published' and nullif(btrim(t.title),'') is not null),'[]'::jsonb),
  a.verification_source_count,a.verification_independent_count,a.verification_official_count,
  a.verification_conflict_count,a.verification_correction_count,a.verification_retraction_count,
  a.verification_updated_at,left(a.verification_note::text,4000),
  case when a.trust_needs_review then case when a.editorial_trust_status='disputed' then 'disputed' else 'unconfirmed' end else a.editorial_trust_status end,
  a.trust_needs_review,a.audience_lane::text
 from public.articles a
 where a.editorial_status='published' and a.published_at is not null
  and a.audience_lane = any (
    case lower(coalesce(p_lane,'arabic'))
      when 'all' then array['arabic','world']::text[]
      when 'arabic' then array['arabic']::text[]
      when 'world' then array['world']::text[]
      when 'leisure' then array['leisure']::text[]
      else array[]::text[]
    end
  )
  and a.published_at<=least(coalesce(p_before,now()),now())
  and (p_since is null or a.published_at>=p_since)
  and (p_newsdata_only is null or a.newsdata_only=p_newsdata_only)
  and (p_is_breaking is null or a.is_breaking=p_is_breaking)
  and (p_is_exclusive is null or a.is_exclusive=p_is_exclusive)
 order by a.published_at desc,a.id asc
 limit greatest(1,least(coalesce(p_limit,100),1000))
 offset greatest(0,least(coalesce(p_offset,0),50000000));
$function$;

-- Archive, sitemap, feeds and the world monitor follow the same gate.
create or replace function public.public_news_recent(
  p_limit integer default 100,
  p_before timestamptz default now(),
  p_since timestamptz default null,
  p_offset integer default 0
)
returns table (
  id uuid, title text, summary text, image_url text, author jsonb, lang text, category text,
  country text, event_country text, source_language text, source_name text, source_url text,
  url text, published_at timestamptz, is_breaking boolean, verification text,
  correction_note text, corrected_at timestamptz
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select a.id, left(a.title::text, 1000), left(a.summary::text, 12000),
    left(a.image_url::text, 4096), to_jsonb(a.author), a.lang::text, a.category::text,
    a.country::text, a.event_country::text, a.source_language::text,
    left(a.source_name::text, 300), left(a.source_url::text, 4096), left(a.url::text, 4096),
    a.published_at::timestamptz, a.is_breaking, a.verification::text,
    left(a.correction_note::text, 4000), a.corrected_at::timestamptz
  from public.articles a
  where a.editorial_status = 'published' and a.published_at is not null
    and a.audience_lane in ('arabic', 'world')
    and a.published_at <= least(coalesce(p_before, now()), now())
    and (p_since is null or a.published_at >= p_since)
  order by a.published_at desc, a.id asc
  limit greatest(1, least(coalesce(p_limit, 100), 1000))
  offset greatest(0, least(coalesce(p_offset, 0), 50000000));
$function$;

create or replace function public.public_news_sitemap(p_after uuid default null)
returns table (id uuid, published_at timestamptz, corrected_at timestamptz)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select a.id, a.published_at::timestamptz, a.corrected_at::timestamptz
  from public.articles a
  where a.editorial_status = 'published' and a.published_at is not null
    and a.audience_lane in ('arabic', 'world')
    and a.published_at <= now() and (p_after is null or a.id > p_after)
  order by a.id asc
  limit 1000;
$function$;

create or replace function public.public_news_sitemap_index(p_page integer default null, p_offset integer default 0)
returns table (page bigint, after_id uuid)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  with ranked as (
    select a.id, row_number() over (order by a.id asc) as position,
      count(*) over () as total
    from public.articles a
    where a.editorial_status = 'published' and a.published_at is not null
      and a.audience_lane in ('arabic', 'world')
      and a.published_at <= now()
  ), boundaries as (
    select 1::bigint as page, null::uuid as after_id
    union all
    select r.position / 1000 + 1, r.id
      from ranked r where r.position % 1000 = 0 and r.position < r.total
  )
  select b.page, b.after_id from boundaries b
  where p_page is null or b.page = p_page
  order by b.page asc
  limit 1000 offset greatest(0, least(coalesce(p_offset, 0), 50000));
$function$;

create or replace function public.public_top_read_articles(p_days integer default 7, p_limit integer default 5)
returns table (
  id uuid, title text, summary text, image_url text, lang text, category text, country text,
  event_country text, source_language text, source_scope text, language_detection text,
  source_name text, source_url text, url text, published_at timestamptz, is_breaking boolean,
  content_type text, ai_summary text, ai_reader_impact text, ai_watch_next text,
  ai_risk_level text, ai_risk_score integer, view_count bigint
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select
    a.id, left(a.title::text, 1000), left(a.summary::text, 12000), left(a.image_url::text, 4096),
    a.lang::text, a.category::text, a.country::text, a.event_country::text, a.source_language::text,
    a.source_scope::text, a.language_detection::text, left(a.source_name::text, 300),
    left(a.source_url::text, 4096), left(a.url::text, 4096), a.published_at, a.is_breaking,
    a.content_type::text, left(a.ai_summary::text, 1200), left(a.ai_reader_impact::text, 900),
    left(a.ai_watch_next::text, 900), a.ai_risk_level::text, a.ai_risk_score, count(*)::bigint
  from public.audience_events e
  join public.articles a on a.id = e.article_id
  where e.event_name = 'view_article'
    and e.article_id is not null
    and e.session_id is not null
    and e.occurred_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)))
    and a.editorial_status = 'published'
    and a.audience_lane in ('arabic', 'world')
    and a.published_at is not null
    and a.published_at <= now()
  group by a.id
  having count(distinct e.session_id) >= 3
  order by count(*) desc, max(e.occurred_at) desc, a.id asc
  limit greatest(1, least(coalesce(p_limit, 5), 10));
$function$;

create or replace function public.public_world_monitor_feed(p_hours integer default 24, p_limit integer default 1000)
returns table (
  id uuid, title text, summary text, country text, source_name text, url text,
  published_at timestamptz, ai_country_code text, ai_event_type text, ai_risk_level text,
  ai_risk_score integer, ai_summary text, ai_latitude double precision, ai_longitude double precision,
  article_translations jsonb
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  SELECT
    a.id, left(a.title::text, 1000), left(a.summary::text, 8000), left(a.country::text, 160),
    left(a.source_name::text, 300),
    CASE
      WHEN a.url ~* '^https?://[^/@[:space:]]+([/?#][^[:space:]]*)?$' THEN left(a.url::text, 4096)
      ELSE NULL
    END,
    a.published_at::timestamptz, a.ai_country_code::text, left(a.ai_event_type::text, 120),
    a.ai_risk_level::text, a.ai_risk_score, left(a.ai_summary::text, 3000),
    a.ai_latitude, a.ai_longitude,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'lang', t.lang, 'title', left(t.title::text, 1000), 'summary', left(t.summary::text, 8000),
        'ai_summary', left(t.ai_summary::text, 3000)
      ) ORDER BY t.lang)
      FROM public.article_translations t
      WHERE t.article_id = a.id AND t.translation_status = 'published'
        AND nullif(btrim(t.title), '') IS NOT NULL
    ), '[]'::jsonb)
  FROM public.articles a
  WHERE a.editorial_status = 'published'
    AND a.audience_lane in ('arabic', 'world')
    AND a.published_at IS NOT NULL
    AND a.published_at <= now()
    AND a.published_at >= now() - (greatest(1, least(coalesce(p_hours, 24), 72)) * interval '1 hour')
    AND a.ai_classification_status = 'classified'
    AND a.ai_confidence >= 0.68
    AND a.ai_country_code IS NOT NULL
    AND a.ai_risk_level <> 'unknown'
    AND lower(coalesce(a.url, '') || ' ' || coalesce(a.source_url, '') || ' ' || coalesce(a.source_name, ''))
      !~ '(t\.me|telegram\.me|telegram)'
  ORDER BY a.published_at DESC, a.id ASC
  LIMIT greatest(1, least(coalesce(p_limit, 1000), 1000));
$function$;

create or replace function public.public_source_directory(p_hours integer default 72, p_limit integer default 300)
returns table (
  source_name text, source_url text, source_language text, source_scope text,
  article_count bigint, latest_published_at timestamptz, correction_count bigint
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  WITH scoped AS (
    SELECT
      coalesce(nullif(btrim(a.source_name::text), ''), 'المصدر غير متاح') AS source_name,
      a.source_url::text AS source_url,
      coalesce(nullif(btrim(a.source_language::text), ''), 'unknown') AS source_language,
      coalesce(nullif(btrim(a.source_scope::text), ''), 'unknown') AS source_scope,
      a.published_at::timestamptz AS published_at,
      a.correction_note::text AS correction_note
    FROM public.articles a
    WHERE a.editorial_status = 'published'
      AND a.audience_lane in ('arabic', 'world')
      AND a.published_at IS NOT NULL
      AND a.published_at <= now()
      AND a.published_at >= now() - (greatest(1, least(coalesce(p_hours, 72), 72)) * interval '1 hour')
      AND lower(coalesce(a.url, '') || ' ' || coalesce(a.source_url, '') || ' ' || coalesce(a.source_name, ''))
        !~ '(t\.me|telegram\.me|telegram)'
  )
  SELECT
    s.source_name,
    CASE
      WHEN max(s.source_url) ~* '^https?://[^/@[:space:]]+([/?#][^[:space:]]*)?$'
      THEN left(max(s.source_url), 4096)
      ELSE NULL
    END,
    max(s.source_language), max(s.source_scope), count(*)::bigint, max(s.published_at),
    count(*) FILTER (WHERE nullif(btrim(s.correction_note), '') IS NOT NULL)::bigint
  FROM scoped s
  GROUP BY s.source_name
  ORDER BY count(*) DESC, max(s.published_at) DESC, s.source_name ASC
  LIMIT greatest(1, least(coalesce(p_limit, 300), 300));
$function$;

-- Single-article read: the worker needs the lane to decide 200 vs 410.
drop function if exists public.public_news_article(uuid);
create function public.public_news_article(p_id uuid)
returns table (
  id uuid, title text, summary text, image_url text, author jsonb, lang text, category text,
  country text, event_country text, source_language text, source_name text, source_url text,
  url text, published_at timestamptz, is_breaking boolean, verification text,
  correction_note text, corrected_at timestamptz, audience_lane text, content_type text,
  received_at timestamptz, gate_reason text
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select a.id, left(a.title::text, 1000), left(a.summary::text, 12000),
    left(a.image_url::text, 4096), to_jsonb(a.author), a.lang::text, a.category::text,
    a.country::text, a.event_country::text, a.source_language::text,
    left(a.source_name::text, 300), left(a.source_url::text, 4096), left(a.url::text, 4096),
    a.published_at::timestamptz, a.is_breaking, a.verification::text,
    left(a.correction_note::text, 4000), a.corrected_at::timestamptz,
    a.audience_lane::text, a.content_type::text, a.received_at::timestamptz, a.gate_reason::text
  from public.articles a
  where a.id = p_id and a.editorial_status = 'published'
    and a.published_at is not null and a.published_at <= now()
  limit 1;
$function$;

grant execute on function public.public_home_news_recent_v3(integer, timestamptz, timestamptz, integer, boolean, boolean, boolean) to anon, authenticated, service_role;
grant execute on function public.public_home_news_recent_v4(integer, timestamptz, timestamptz, integer, boolean, boolean, boolean, text) to anon, authenticated, service_role;
grant execute on function public.public_news_recent(integer, timestamptz, timestamptz, integer) to anon, authenticated, service_role;
grant execute on function public.public_news_article(uuid) to anon, authenticated, service_role;
grant execute on function public.public_news_sitemap(uuid) to anon, authenticated, service_role;
grant execute on function public.public_news_sitemap_index(integer, integer) to anon, authenticated, service_role;
grant execute on function public.public_top_read_articles(integer, integer) to anon, authenticated, service_role;
grant execute on function public.public_world_monitor_feed(integer, integer) to anon, authenticated, service_role;
grant execute on function public.public_source_directory(integer, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Evaluate the existing archive
-- ---------------------------------------------------------------------------
select public.wrldline_gate_backfill(null);
