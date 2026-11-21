CREATE OR REPLACE FUNCTION public.public_home_news_recent_v3(
 p_limit integer DEFAULT 100,
 p_before timestamptz DEFAULT now(),
 p_since timestamptz DEFAULT NULL,
 p_offset integer DEFAULT 0,
 p_newsdata_only boolean DEFAULT NULL,
 p_is_breaking boolean DEFAULT NULL,
 p_is_exclusive boolean DEFAULT NULL
)
RETURNS TABLE(
 id uuid,title text,summary text,image_url text,lang text,category text,country text,event_country text,
 source_language text,source_scope text,language_detection text,source_name text,source_url text,url text,
 published_at timestamptz,is_breaking boolean,verification text,correction_note text,corrected_at timestamptz,
 media_type text,content_type text,sponsor_name text,sponsor_url text,ai_country_code text,ai_summary text,
 ai_reader_impact text,ai_watch_next text,ai_risk_level text,ai_risk_score integer,is_exclusive boolean,
 exclusive_type text,newsdata_article_id text,newsdata_categories text[],newsdata_ai_tags jsonb,
 newsdata_sentiment text,newsdata_ai_summary text,newsdata_fetched_at timestamptz,newsdata_only boolean,
 article_translations jsonb,verification_source_count integer,verification_independent_count integer,
 verification_official_count integer,verification_conflict_count integer,verification_correction_count integer,
 verification_retraction_count integer,verification_updated_at timestamptz,verification_note text,
 editorial_trust_status text,trust_needs_review boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
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
  and a.published_at<=least(coalesce(p_before,now()),now())
  and (p_since is null or a.published_at>=p_since)
  and (p_newsdata_only is null or a.newsdata_only=p_newsdata_only)
  and (p_is_breaking is null or a.is_breaking=p_is_breaking)
  and (p_is_exclusive is null or a.is_exclusive=p_is_exclusive)
 order by a.published_at desc,a.id asc
 limit greatest(1,least(coalesce(p_limit,100),1000))
 offset greatest(0,least(coalesce(p_offset,0),50000000));
$function$;
REVOKE ALL ON FUNCTION public.public_home_news_recent_v3(integer,timestamptz,timestamptz,integer,boolean,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_home_news_recent_v3(integer,timestamptz,timestamptz,integer,boolean,boolean,boolean) TO anon,authenticated;
