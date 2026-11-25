-- Editorial stories were disappearing for two reasons that the earlier gate fixes missed.
--
-- 1. The live decision function treats an Arabic headline as sport when it merely CONTAINS
--    a sport word, and "هداف" (top scorer) sits inside "استهداف" (targeting). Every war or
--    security headline with "استهداف" was demoted to the 'leisure' archive
--    (gate_reason = arabic_sport) and served as "this story is no longer published".
--    The lexicon now matches whole words only.
-- 2. Human authorship is decided by WHO saved the row, not by what the source box says:
--    a save by a signed-in editor/admin, a row whose url is "editorial-...", or the
--    WRLDLINE desk names, bypass the automated gate. Automated ingestion keeps it.
--
-- The function is patched in place from its live definition, so any other live rule survives.
-- Nothing is deleted. Re-run safe.

insert into public.source_policy (source_key, tier, language, scope, reason) values
  ('wrldline news', 'priority', 'ar', 'local', 'WRLDLINE editorial desk; human-authored original content'),
  ('هيئة التحرير', 'priority', 'ar', 'local', 'WRLDLINE editorial desk; human-authored original content'),
  ('editorial desk', 'priority', 'ar', 'local', 'WRLDLINE editorial desk; human-authored original content')
on conflict (source_key) do update set tier = excluded.tier, language = excluded.language,
  scope = excluded.scope, reason = excluded.reason, updated_at = now();

create or replace function public.wrldline_is_editorial(p_name text)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select coalesce(btrim(p_name), '') <> ''
    and btrim(p_name) ~* '^(wrldline( news)?|editorial desk|هيئة التحرير|محررو wrldline)$'
$$;
revoke all on function public.wrldline_is_editorial(text) from public, anon, authenticated;

do $patch$
declare
  def text;
  oid_ oid;
begin
  select p.oid into oid_ from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'wrldline_audience_decision' limit 1;
  def := pg_get_functiondef(oid_);

  if position('human_editorial' in def) = 0 then
    def := replace(def, E'begin\n  if length(v_title) < 8 then',
$r$begin
  -- Human editorial work is published as written.
  if public.wrldline_is_editorial(p_source_name)
     or coalesce(p_source_url, '') ~ '^editorial-'
     or private.trust_is_editor() then
    return query select (case when v_lang = 'en' then 'world' else 'arabic' end)::text, 'human_editorial'::text;
    return;
  end if;
  if length(v_title) < 8 then$r$);
  end if;

  if position('(^|[^ء-ي])(ال|لل' in def) = 0 then
    def := replace(def, $a$v_title ~ '(مباراة$a$, $b$v_title ~ '(^|[^ء-ي])(ال|لل|بال|وال|ب|ل|و)?(مباراة$b$);
    def := replace(def, $a$منتخب (السعودية|مصر|المغرب|الجزائر|تونس|قطر|الإمارات))'$a$,
                        $b$منتخب (السعودية|مصر|المغرب|الجزائر|تونس|قطر|الإمارات))(ه|ها|هم|ين|ان|ات|يه)?([^ء-ي]|$)'$b$);
  end if;

  if position('human_editorial' in def) = 0 or position('(^|[^ء-ي])(ال|لل' in def) = 0 then
    raise exception 'wrldline_audience_decision patch did not apply; definition changed';
  end if;
  execute def;
end
$patch$;

-- Re-evaluate when an editor changes status/source too (e.g. publishing a saved draft).
drop trigger if exists wrldline_publication_gate on public.articles;
create trigger wrldline_publication_gate
  before insert or update of title, summary, lang, category, source_name, source_url, url,
    ai_region, ai_country_code, country, event_country, source_scope, editorial_status
  on public.articles
  for each row execute function private.apply_publication_gate();

-- The dashboard reads these two columns to tell the editor whether a story is public.
grant select (audience_lane, gate_reason) on table public.articles to authenticated;

-- Editor visibility audit for the dashboard.
create or replace function public.editor_publication_audit(p_limit integer default 40)
returns table (id uuid, title text, editorial_status text, published_at timestamptz,
  audience_lane text, gate_reason text, source_name text, category text, lang text)
language sql stable security definer set search_path = pg_catalog as $$
  select a.id, left(a.title::text, 300), a.editorial_status::text, a.published_at,
         a.audience_lane::text, a.gate_reason::text, left(a.source_name::text, 200),
         a.category::text, a.lang::text
  from public.articles a
  where private.trust_is_editor() and a.published_at >= now() - interval '30 days'
  order by a.published_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$$;
revoke all on function public.editor_publication_audit(integer) from public, anon;
grant execute on function public.editor_publication_audit(integer) to authenticated, service_role;

-- Re-evaluate everything the old rules mis-sorted: archive-lane Arabic stories, excluded
-- or sport-lane rows, and anything the desk wrote. Lane columns only; text is untouched.
update public.articles a
set audience_lane = d.lane, gate_reason = d.reason, gate_version = 'gate-2', gate_evaluated_at = now()
from (
  select s.id, x.lane, x.reason
  from public.articles s
  cross join lateral private.wrldline_audience_decision(
    s.lang, s.title, s.summary, s.category, s.source_name, coalesce(s.source_url, s.url),
    s.ai_region, s.ai_country_code, s.country, s.event_country, s.source_scope) x
  where s.editorial_status = 'published'
    and (s.audience_lane = 'leisure' and s.lang = 'ar'
         or s.source_name ~* '^(wrldline|هيئة|editorial)' or s.url ~ '^editorial-')
) d
where a.id = d.id
  and (a.audience_lane, a.gate_reason) is distinct from (d.lane, d.reason);

select public.wrldline_gate_backfill(null);
notify pgrst, 'reload schema';
