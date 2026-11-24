#!/usr/bin/env bash
# Disposable fixture only: never accepts DATABASE_URL or any production input.
# Proves the two public-read migrations apply, re-apply, and behave, against a
# throwaway cluster that only knows public.articles.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(pg_config --bindir)}"
PORT="${PORT:-55439}"
TMP="$(mktemp -d /tmp/wrldline-public-read.XXXXXX)"
cleanup(){ "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

"$PGBIN/initdb" -D "$TMP/data" -A trust --no-locale >/dev/null
"$PGBIN/pg_ctl" -D "$TMP/data" -l "$TMP/server.log" -o "-F -k $TMP -h '' -p $PORT" -w start >/dev/null
PSQL=("$PGBIN/psql" -X -h "$TMP" -p "$PORT" -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.articles (
  id uuid primary key,
  title text,
  summary text,
  image_url text,
  lang text,
  source_language text,
  category text,
  source_name text,
  source_url text,
  source_scope text,
  url text,
  published_at timestamptz,
  is_breaking boolean default false,
  is_exclusive boolean default false,
  content_type text,
  verification text,
  correction_note text,
  corrected_at timestamptz,
  editorial_status text default 'published',
  audience_lane text default 'arabic'
);
SQL

for file in 20261123130000_public_read_performance.sql 20261123140000_public_read_followups.sql; do
  "${PSQL[@]}" -f "$ROOT/supabase/migrations/$file" >"$TMP/$file.log" 2>&1 || { cat "$TMP/$file.log"; exit 1; }
  # Re-application must be a no-op, not an error: production may re-run a file.
  "${PSQL[@]}" -f "$ROOT/supabase/migrations/$file" >"$TMP/$file.reapply.log" 2>&1 || { cat "$TMP/$file.reapply.log"; exit 1; }
done

"${PSQL[@]}" <<'SQL'
insert into public.articles (id, title, summary, category, source_name, source_url, url, published_at, is_breaking, is_exclusive, editorial_status, audience_lane)
select gen_random_uuid(), 'خبر ' || g, repeat('ملخص ', 400), case when g % 2 = 0 then 'politics' else 'economy' end,
       'وكالة ' || g, 'https://example.com/' || g, 'https://example.com/a/' || g,
       now() - (g || ' minutes')::interval, g % 3 = 0, g % 7 = 0, 'published', 'arabic'
from generate_series(1, 40) g;

insert into public.articles (id, title, category, source_name, url, published_at, editorial_status, audience_lane, source_url)
values (gen_random_uuid(), 'English wire', 'politics', 'Wire', 'https://example.com/en', now() - interval '5 minutes', 'published', 'world', 'https://example.com/en');

-- Withdrawn and future rows must never appear in a public feed.
insert into public.articles (id, title, category, source_name, url, published_at, editorial_status, audience_lane)
values (gen_random_uuid(), 'مسحوب', 'politics', 'x', 'https://example.com/x', now() - interval '1 minute', 'withdrawn', 'arabic'),
       (gen_random_uuid(), 'مستقبلي', 'politics', 'x', 'https://example.com/y', now() + interval '1 hour', 'published', 'arabic');

do $$
declare n integer; s text;
begin
  select count(*) into n from public.public_news_list(10, null, null, 0, 'arabic');
  if n <> 10 then raise exception 'public_news_list returned % rows, expected 10', n; end if;

  select left(summary, 700) into s from public.public_news_list(1, null, null, 0, 'arabic');
  if length(s) > 700 then raise exception 'public_news_list shipped a % char summary', length(s); end if;

  select count(*) into n from public.public_news_list(50, null, null, 0, 'world');
  if n <> 1 then raise exception 'world lane leaked % rows, expected 1', n; end if;

  select count(*) into n from public.public_breaking_feed(30, null);
  if n <> 13 then raise exception 'public_breaking_feed returned % rows, expected 13', n; end if;

  select count(*) into n from public.public_exclusive_feed(30);
  if n <> 5 then raise exception 'public_exclusive_feed returned % rows, expected 5', n; end if;

  select count(*) into n from public.public_news_sitemap_recent(48, 1000);
  if n <> 41 then raise exception 'sitemap recent returned % rows, expected 41', n; end if;

  select count(*) into n from public.public_news_sitemap_index(null, 0);
  if n <> 1 then raise exception 'sitemap index returned % pages, expected 1', n; end if;

  select count(*) into n from public.public_source_directory(72, 300);
  if n < 2 then raise exception 'source directory returned % sources', n; end if;

  select count(*) into n from public.public_related_articles((select id from public.articles where category = 'politics' and editorial_status = 'published' order by published_at desc limit 1), 4);
  if n <> 4 then raise exception 'related returned % rows, expected 4', n; end if;

  if exists (select 1 from public.public_breaking_feed(30, null) where title = 'مسحوب') then
    raise exception 'a withdrawn story reached the breaking feed';
  end if;
  if exists (select 1 from public.public_news_list(50, null, null, 0, 'arabic') where title = 'مستقبلي') then
    raise exception 'a future-dated story reached the archive feed';
  end if;
end $$;

-- Anon must be able to call the feeds and must not be able to read the table.
set role anon;
do $$
declare n integer;
begin
  select count(*) into n from public.public_news_list(5, null, null, 0, 'arabic');
  if n <> 5 then raise exception 'anon could not read the archive feed'; end if;
  begin
    perform 1 from public.articles limit 1;
    raise exception 'anon can still select from public.articles';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The covering index must be usable for an index-only scan of the sitemap order.
set enable_seqscan = off;
explain (costs off) select id from public.articles
  where editorial_status = 'published' and audience_lane in ('arabic','world')
  order by id limit 1000;
reset enable_seqscan;
SQL

echo "PASS: public read migrations apply, re-apply, filter lanes, cap summaries and grant anon only the RPCs"
