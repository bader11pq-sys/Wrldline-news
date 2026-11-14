-- WRLDLINE classification + language backfill
-- 2026-11-14
--
-- Every change is recorded in classification_backfill_audit before it is
-- applied. The backfill is conservative:
--   * specific feed sections become their real category;
--   * world-section feeds keep world;
--   * general feeds become uncategorized, never world;
--   * "دولي" is no longer stored as an event country;
--   * queue rows older than 48 hours are expired, not silently retried.

begin;

-- ---------------------------------------------------------------------------
-- 1. Feed language and source scope.
-- ---------------------------------------------------------------------------
create temporary table tmp_feed_language on commit drop as
select id, lang as old_language, 'ar'::text as new_language
from public.feeds
where lang <> 'ar'
  and (
    name ~ '[ء-ي]'
    or url ~* '(aljazeera\.net|bbc\.co\.uk/arabic|arabic\.cnn\.com|alarabiya\.net|aawsat\.com|skynewsarabia\.com|france24\.com/ar|rss\.dw\.com/xml/rss-ar|spa\.gov\.sa|kuna\.net\.kw|alkhaleej\.ae|alittihad\.ae|albayan\.ae|alsharq\.net|youm7\.com|almasryalyoum\.com|alghad\.com|royanews\.tv|almodon\.com|maannews\.net|arabi21\.com|hespress\.com|echoroukonline\.com|tunisienumerique\.com|libyaakhbar\.com|arabic\.rt\.com|alikhbariya\.net|ajel\.sa|alriyadh\.com|okaz\.com\.sa|lbcgroup\.tv|al-madina\.com|shafaq\.com|enabbaladi\.net|alsumaria\.tv)'
  );

insert into public.classification_backfill_audit
  (entity_type, entity_id, old_language, new_language, reason)
select 'feed', id, old_language, new_language, 'arabic_source_language_backfill'
from tmp_feed_language;

update public.feeds f
set lang = m.new_language
from tmp_feed_language m
where f.id = m.id;

create temporary table tmp_feed_scope on commit drop as
select id,
  source_scope as old_scope,
  case
    when name ~* '(world|international|global|foreign|AFP|Reuters|Associated Press|BBC|CNN|Al Jazeera|DW|France 24|NPR|Guardian|New York Times|Sky News|Bloomberg|Axios|Newsweek|Financial Times|Economist|Politico|Telegraph|Independent|Wall Street Journal|Le Monde|El País|Der Spiegel|CNA|Bernama|ANSA|Xinhua|TASS|UPI|Yonhap|Kyodo|Jiji|NHK|Dawn|Hindu|Times of India|Indian Express|Hindustan|SCMP|Japan Times|Nikkei|Korea Herald|Straits Times|Sydney Morning Herald|ABC News Australia|CBC|Globe and Mail|Toronto Star|الجزيرة|العربية|سكاي نيوز عربية|فرانس 24 عربي|DW عربية|BBC عربي|CNN عربية|الشرق الأوسط|عربي21|الحرة|اندبندنت عربية|نون بوست|آر تي عربي|أخبار الأمم المتحدة)' then 'international'
    when name in ('وكالة الأنباء السعودية واس','الرياض','عكاظ','المدينة','عاجل','الخليج','الاتحاد','البيان','الشرق','كونا','اليوم السابع','المصري اليوم','الغد','رؤيا','المدن','معاً','هسبريس','الشروق','تونس الرقمية','ليبيا أخبار','النهار اللبنانية','القدس العربي','موزاييك إف إم','الصباح المغربية','عالم التقنية','البوابة العربية للأخبار التقنية','إل بي سي آي اللبنانية','شفق نيوز عربي','عنب بلدي','السومرية') then 'national'
    else 'unknown'
  end as new_scope
from public.feeds
where source_scope = 'unknown';

insert into public.classification_backfill_audit
  (entity_type, entity_id, old_source_scope, new_source_scope, reason)
select 'feed', id, old_scope, new_scope, 'feed_source_scope_backfill'
from tmp_feed_scope
where old_scope is distinct from new_scope;

update public.feeds f
set source_scope = m.new_scope
from tmp_feed_scope m
where f.id = m.id and f.source_scope is distinct from m.new_scope;

-- ---------------------------------------------------------------------------
-- 2. Feed category remap. This is the authoritative source signal.
-- ---------------------------------------------------------------------------
create temporary table tmp_feed_category on commit drop as
select id,
  category as old_category,
  case
    when url ~* '(sport|football|soccer|nba|nfl|cricket|tennis|olympic)' or name ~* '(sport|sports|football|soccer)' then 'sports'
    when name ~* '(financial times|bloomberg|economist|wall street journal)' or url ~* '(business|economy|markets?|finance|financial|money)' or name ~* '(business|economy|markets?|finance)' then 'economy'
    when url ~* '(environment|climate|nature)' or name ~* '(environment|climate|nature)' then 'environment'
    when url ~* '(science|space|research)' or name ~* '(science|space|research)' then 'science'
    when url ~* '(technolog|tech|gadget|digital)' or name ~* '(technology|tech|gadget|digital)' then 'tech'
    when url ~* '(health|medical)' or name ~* '(health)' then 'health'
    when url ~* '(entertainment|arts|culture|celebrity|music|film)' or name ~* '(entertainment|arts|culture)' then 'culture'
    when name ~* '(politico|politic|politics|election|government|parliament|the hill)' or url ~* '(politic|election|government)' then 'politics'
    when name ~* '(world|international|global|foreign|AFP|Reuters|Associated Press|TASS|Xinhua|EFE|dpa|Kyodo|Jiji|UPI|Yonhap|ANSA|Bernama|CNA|NHK)' or url ~* '(world|international|global|foreign)' then 'world'
    else 'uncategorized'
  end as new_category
from public.feeds;

insert into public.classification_backfill_audit
  (entity_type, entity_id, old_category, new_category, reason)
select 'feed', id, old_category, new_category, 'feed_category_remap_20261114'
from tmp_feed_category
where old_category is distinct from new_category;

update public.feeds f
set category = m.new_category
from tmp_feed_category m
where f.id = m.id and f.category is distinct from m.new_category;

-- ---------------------------------------------------------------------------
-- 3. Article source language. articles.lang remains the compatibility mirror.
-- ---------------------------------------------------------------------------
create temporary table tmp_article_language on commit drop as
select id, lang as old_language, coalesce(nullif(lang, ''), 'en') as new_language
from public.articles
where source_language is null;

insert into public.classification_backfill_audit
  (entity_type, entity_id, old_language, new_language, reason)
select 'article', id, old_language, new_language, 'source_language_backfill'
from tmp_article_language;

update public.articles a
set source_language = m.new_language,
    language_detection = 'legacy'
from tmp_article_language m
where a.id = m.id;

-- ---------------------------------------------------------------------------
-- 4. Article source scope from the feed registry.
-- ---------------------------------------------------------------------------
create temporary table tmp_article_scope on commit drop as
select a.id,
  a.source_scope as old_scope,
  f.source_scope as new_scope
from public.articles a
join lateral (
  select f.source_scope
  from public.feeds f
  where f.source_scope <> 'unknown'
    and (
      (a.feed_id is not null and f.id = a.feed_id)
      or f.url = a.source_url
      or f.name = a.source_name
    )
  order by
    (a.feed_id is not null and f.id = a.feed_id) desc nulls last,
    (f.url = a.source_url) desc nulls last
  limit 1
) f on true
where a.source_scope = 'unknown';

insert into public.classification_backfill_audit
  (entity_type, entity_id, old_source_scope, new_source_scope, reason)
select 'article', id, old_scope, new_scope, 'article_source_scope_from_feed'
from tmp_article_scope
where old_scope is distinct from new_scope;

update public.articles a
set source_scope = m.new_scope
from tmp_article_scope m
where a.id = m.id and a.source_scope is distinct from m.new_scope;

-- ---------------------------------------------------------------------------
-- 5. Country cleanup: "دولي" and "غير محدد" are not event countries.
-- ---------------------------------------------------------------------------
create temporary table tmp_article_country on commit drop as
select id,
  country as old_country,
  case when country in ('دولي','غير محدد') then null else country end as new_country,
  source_scope as old_scope,
  case when country = 'دولي' and source_scope = 'unknown' then 'international' else source_scope end as new_scope,
  source_country as old_source_country,
  case
    when source_country is null and country not in ('دولي','غير محدد') and ai_classified_at is null then country
    else source_country
  end as new_source_country,
  event_country as old_event_country,
  case
    when event_country is null and country not in ('دولي','غير محدد') and ai_classified_at is not null then country
    else event_country
  end as new_event_country
from public.articles
where country in ('دولي','غير محدد')
   or (source_country is null and country not in ('دولي','غير محدد') and ai_classified_at is null)
   or (event_country is null and country not in ('دولي','غير محدد') and ai_classified_at is not null);

insert into public.classification_backfill_audit
  (entity_type, entity_id, old_country, new_country, old_source_scope, new_source_scope, old_source_country, new_source_country, old_event_country, new_event_country, reason)
select 'article', id, old_country, new_country, old_scope, new_scope, old_source_country, new_source_country, old_event_country, new_event_country, 'country_scope_separation_20261114'
from tmp_article_country
where old_country is distinct from new_country
   or old_scope is distinct from new_scope
   or old_source_country is distinct from new_source_country
   or old_event_country is distinct from new_event_country;

update public.articles a
set country = m.new_country,
    source_scope = m.new_scope,
    source_country = m.new_source_country,
    event_country = m.new_event_country
from tmp_article_country m
where a.id = m.id;

-- ---------------------------------------------------------------------------
-- 6. Article category remap: remove the parser's world default.
-- ---------------------------------------------------------------------------
create temporary table tmp_article_category on commit drop as
select a.id,
  a.category as old_category,
  case
    when f.category in ('politics','economy','security','tech','sports','culture','health','science','environment','society') then f.category
    when f.category = 'world' then 'world'
    else 'uncategorized'
  end as new_category
from public.articles a
left join lateral (
  select f.category
  from public.feeds f
  where (a.feed_id is not null and f.id = a.feed_id)
     or f.url = a.source_url
     or f.name = a.source_name
  order by
    (a.feed_id is not null and f.id = a.feed_id) desc nulls last,
    (f.url = a.source_url) desc nulls last
  limit 1
) f on true
where a.category = 'world'
  and a.ai_classification_status in ('pending','failed');

insert into public.classification_backfill_audit
  (entity_type, entity_id, old_category, new_category, reason)
select 'article', id, old_category, new_category, 'remove_world_default_20261114'
from tmp_article_category
where old_category is distinct from new_category;

update public.articles a
set category = m.new_category
from tmp_article_category m
where a.id = m.id and a.category is distinct from m.new_category;

-- ---------------------------------------------------------------------------
-- 7. Expire the archive backlog. It is not retried indefinitely.
-- ---------------------------------------------------------------------------
create temporary table tmp_expired_queue on commit drop as
select id, ai_classification_status as old_status, 'expired'::text as new_status
from public.articles
where ai_classification_status in ('pending','failed')
  and published_at < now() - interval '48 hours';

insert into public.classification_backfill_audit
  (entity_type, entity_id, old_status, new_status, reason)
select 'article', id, old_status, new_status, 'expire_classification_queue_older_than_48h'
from tmp_expired_queue;

update public.articles a
set ai_classification_status = 'expired',
    classification_claimed_at = null,
    classification_last_error = 'expired: published more than 48 hours ago'
from tmp_expired_queue m
where a.id = m.id;

commit;
