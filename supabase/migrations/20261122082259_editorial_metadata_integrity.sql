-- Separate known NewsData publisher metadata from event metadata.
-- Leave mixed-provenance articles and all publication dates/statuses alone.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '45s';

create table private.newsdata_metadata_corrections_20261122 (
  article_id uuid primary key,
  corrected_at timestamptz not null default now(),
  before_values jsonb not null,
  after_values jsonb not null
);
alter table private.newsdata_metadata_corrections_20261122 enable row level security;
revoke all on private.newsdata_metadata_corrections_20261122 from public, anon, authenticated;

-- Compatibility with the old admin, which writes only articles.country. Browser
-- writes still pass the normal RLS/editor checks. Service/ingest writes are unchanged.
create function private.sync_editorial_article_metadata()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare
  edited_location boolean := false;
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then
    new.event_country := coalesce(new.event_country, new.country);
    edited_location := new.event_country is not null;
  else
    edited_location := new.event_country is distinct from old.event_country
      or new.country is distinct from old.country;
    if edited_location and new.event_country is not distinct from old.event_country then
      new.event_country := new.country;
    end if;
    if not edited_location
      and new.category is not distinct from old.category
      and new.content_type is not distinct from old.content_type then
      return new;
    end if;
  end if;
  if edited_location then
    if lower(coalesce(btrim(new.event_country),'')) in ('','غير محدد','دولي','unknown','international','world') then
      new.event_country := null;
    end if;
    new.country := new.event_country;
    new.ai_country_code := null;
    new.ai_region := null;
    new.ai_location_name := null;
    new.ai_latitude := null;
    new.ai_longitude := null;
  end if;
  if tg_op = 'INSERT' or new.category is distinct from old.category then
    new.topics := case when new.category = 'uncategorized' then '{}'::text[] else array[new.category] end;
  end if;
  new.classification_reason := 'editorial_metadata';
  if new.ai_classification_status in ('pending','processing','failed','needs_review') then
    new.ai_classification_status := 'skipped';
    new.classification_claimed_at := null;
    new.classification_retry_after := null;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_editorial_article_metadata() from public, anon, authenticated;
create trigger trg_sync_editorial_article_metadata
before insert or update of category, country, event_country, content_type on public.articles
for each row execute function private.sync_editorial_article_metadata();

-- The cohort has NewsData import provenance and no classifier results, editor
-- review, RSS relationship, editorial enrichment, or recorded article update.
-- Snapshot at most 5,001 locked rows and fail closed if that budget is exceeded.
create temporary table metadata_candidates on commit drop as
select a.id, a.newsdata_categories, a.newsdata_datatype, a.title,
  a.category, a.country, a.source_country, a.content_type, a.ai_classification_status
from public.articles a
where a.newsdata_article_id is not null and a.newsdata_fetched_at is not null
  and a.feed_id is null and a.event_country is null and a.country is not null
  and a.published_at < now() - interval '1 hour'
  and a.editorial_status = 'published' and a.content_type = 'news'
  and a.trust_reviewed_at is null and a.corrected_at is null
  and a.classification_reason is null and a.classification_model_version is null
  and a.ai_classified_at is null and a.ai_confidence is null
  and a.ai_country_code is null and a.ai_summary is null
  and a.geographic_scope = 'unknown' and cardinality(a.topics) = 0
  and a.ai_classification_status in ('expired','classified')
  and not exists (
    select 1 from public.article_change_log l
    where l.article_id = a.id and l.entity_type = 'articles' and l.change_type = 'updated'
  )
order by a.id
limit 5001
for update of a;

do $$ begin
  if (select count(*) from metadata_candidates) > 5000 then
    raise exception 'NewsData metadata cohort exceeds audited safety budget';
  end if;
end $$;

with tags(provider, topic) as (
  values ('politics','politics'), ('sports','sports'), ('business','economy'),
    ('technology','tech'), ('health','health'), ('entertainment','culture'),
    ('crime','security'), ('science','science'), ('environment','environment'), ('education','society')
), plan as (
  select c.*,
    case when count(distinct t.topic) = 1 then min(t.topic) else 'uncategorized' end as new_topic,
    coalesce(nullif(btrim(c.source_country),''),
      case when btrim(c.country) ~ '^[[:alpha:] .’''-]{2,80}$'
        and lower(btrim(c.country)) not in ('unknown','world','international','دولي','غير محدد')
        then btrim(c.country) end) as new_source_country,
    case when lower(btrim(c.newsdata_datatype)) = 'opinion'
        or btrim(c.title) ~* '^(opinion|oped|op-ed|رأي|مقال رأي)[[:space:]]*[:：|—–-]' then 'opinion'
      when lower(btrim(c.newsdata_datatype)) = 'analysis'
        or btrim(c.title) ~* '^(analysis|تحليل)[[:space:]]*[:：|—–-]' then 'analysis'
      else c.content_type end as new_type
  from metadata_candidates c
  left join tags t on t.provider = any(c.newsdata_categories)
  group by c.id, c.newsdata_categories, c.newsdata_datatype, c.title,
    c.category, c.country, c.source_country, c.content_type, c.ai_classification_status
), corrected as (
  update public.articles a
  set country = null,
      source_country = p.new_source_country,
      category = p.new_topic,
      content_type = p.new_type,
      classification_reason = 'newsdata_legacy_metadata_20261122',
      ai_classification_status = 'expired'
  from plan p where a.id = p.id
  returning a.id,
    jsonb_build_object('country',p.country,'source_country',p.source_country,'category',p.category,
      'content_type',p.content_type,'classification_reason',null,'ai_classification_status',p.ai_classification_status) old_values,
    jsonb_build_object('country',a.country,'source_country',a.source_country,'category',a.category,
      'content_type',a.content_type,'classification_reason',a.classification_reason,'ai_classification_status',a.ai_classification_status) new_values
)
insert into private.newsdata_metadata_corrections_20261122(article_id,before_values,after_values)
select id,old_values,new_values from corrected;

commit;
