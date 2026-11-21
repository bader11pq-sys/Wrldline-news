-- Public allowlisted feeds for the world monitor and source transparency directory.
-- Keep anonymous SELECT on public.articles revoked; expose only narrowly scoped data.
BEGIN;

CREATE OR REPLACE FUNCTION public.public_world_monitor_feed(
  p_hours integer DEFAULT 24,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE(
  id uuid,
  title text,
  summary text,
  country text,
  source_name text,
  url text,
  published_at timestamptz,
  ai_country_code text,
  ai_event_type text,
  ai_risk_level text,
  ai_risk_score integer,
  ai_summary text,
  ai_latitude double precision,
  ai_longitude double precision,
  article_translations jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
  SELECT
    a.id,
    left(a.title::text, 1000),
    left(a.summary::text, 8000),
    left(a.country::text, 160),
    left(a.source_name::text, 300),
    CASE
      WHEN a.url ~* '^https?://[^/@[:space:]]+([/?#][^[:space:]]*)?$'
      THEN left(a.url::text, 4096)
      ELSE NULL
    END,
    a.published_at::timestamptz,
    a.ai_country_code::text,
    left(a.ai_event_type::text, 120),
    a.ai_risk_level::text,
    a.ai_risk_score,
    left(a.ai_summary::text, 3000),
    a.ai_latitude,
    a.ai_longitude,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'lang', t.lang,
        'title', left(t.title::text, 1000),
        'summary', left(t.summary::text, 8000),
        'ai_summary', left(t.ai_summary::text, 3000)
      ) ORDER BY t.lang)
      FROM public.article_translations t
      WHERE t.article_id = a.id
        AND t.translation_status = 'published'
        AND nullif(btrim(t.title), '') IS NOT NULL
    ), '[]'::jsonb)
  FROM public.articles a
  WHERE a.editorial_status = 'published'
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

REVOKE ALL ON FUNCTION public.public_world_monitor_feed(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_world_monitor_feed(integer, integer)
  TO anon, authenticated;

COMMENT ON FUNCTION public.public_world_monitor_feed(integer, integer)
  IS 'Narrow public feed for the world monitor. Returns only published, recent, sufficiently confident classified non-Telegram event fields; never grants table SELECT.';

CREATE OR REPLACE FUNCTION public.public_source_directory(
  p_hours integer DEFAULT 72,
  p_limit integer DEFAULT 300
)
RETURNS TABLE(
  source_name text,
  source_url text,
  source_language text,
  source_scope text,
  article_count bigint,
  latest_published_at timestamptz,
  correction_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
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
    max(s.source_language),
    max(s.source_scope),
    count(*)::bigint,
    max(s.published_at),
    count(*) FILTER (WHERE nullif(btrim(s.correction_note), '') IS NOT NULL)::bigint
  FROM scoped s
  GROUP BY s.source_name
  ORDER BY count(*) DESC, max(s.published_at) DESC, s.source_name ASC
  LIMIT greatest(1, least(coalesce(p_limit, 300), 300));
$function$;

REVOKE ALL ON FUNCTION public.public_source_directory(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_source_directory(integer, integer)
  TO anon, authenticated;

COMMENT ON FUNCTION public.public_source_directory(integer, integer)
  IS 'Aggregated public source directory for the last 72 hours. Exposes no article rows and excludes Telegram-only breaking feeds.';

COMMIT;
