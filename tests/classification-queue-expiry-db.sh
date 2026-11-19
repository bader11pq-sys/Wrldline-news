#!/usr/bin/env bash
# Isolated disposable PostgreSQL fixture. Never accepts production connection strings.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(pg_config --bindir)}"
TMP="$(mktemp -d /tmp/wrldline-classification-expiry.XXXXXX)"
cleanup(){ "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$TMP/data" -A trust --no-locale >/dev/null
"$PGBIN/pg_ctl" -D "$TMP/data" -l "$TMP/server.log" -o "-F -k $TMP -h '' -p 55439" -w start >/dev/null
"$PGBIN/createdb" -h "$TMP" -p 55439 classification_expiry_fixture
PSQL=("$PGBIN/psql" -X -h "$TMP" -p 55439 -d classification_expiry_fixture -v ON_ERROR_STOP=1)

"${PSQL[@]}" <<'SQL'
create table public.articles (
  id bigserial primary key,
  editorial_status text not null,
  ai_classification_status text not null,
  published_at timestamptz not null,
  classification_claimed_at timestamptz,
  classification_last_error text
);
create index articles_classification_queue_idx
  on public.articles(ai_classification_status, published_at desc)
  where editorial_status = 'published'
    and ai_classification_status in ('pending','failed','processing');

insert into public.articles(editorial_status,ai_classification_status,published_at)
select 'published','pending',now()-interval '2 hours'-(g*interval '1 second')
from generate_series(1,220) g;
insert into public.articles(editorial_status,ai_classification_status,published_at)
select 'published','failed',now()-interval '3 hours'-(g*interval '1 second')
from generate_series(1,55) g;
insert into public.articles(editorial_status,ai_classification_status,published_at,classification_claimed_at)
select 'published','processing',now()-interval '4 hours'-(g*interval '1 second'),now()-interval '2 hours'
from generate_series(1,20) g;
insert into public.articles(editorial_status,ai_classification_status,published_at)
select 'published','pending',now()-interval '20 minutes'-(g*interval '1 second')
from generate_series(1,25) g;
insert into public.articles(editorial_status,ai_classification_status,published_at)
select 'draft','pending',now()-interval '3 days'-(g*interval '1 second')
from generate_series(1,10) g;
SQL

"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261118170600_batch_stale_classification_expiry_50.sql" >"$TMP/migration.log" 2>&1 || { cat "$TMP/migration.log"; exit 1; }

"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261119074000_classification_expiry_index_and_batch.sql" >>"$TMP/migration.log" 2>&1 || { cat "$TMP/migration.log"; exit 1; }


"${PSQL[@]}" <<'SQL'
do $body$
declare
  v_expected integer;
  v_actual integer;
  v_previous integer := 0;
  v_pass integer;
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='articles_classification_expiry_idx'
  ) then
    raise exception 'The partial classification expiry index was not created';
  end if;

  for v_pass in 1..30 loop
    perform public.expire_stale_classification_queue();
    v_expected := least(v_pass * 10, 295);
    select count(*) into v_actual
    from public.articles
    where editorial_status='published'
      and ai_classification_status='expired';
    if v_actual <> v_expected then
      raise exception 'Pass % expected % expired rows; got %', v_pass, v_expected, v_actual;
    end if;
    if v_actual - v_previous > 10 then
      raise exception 'Pass % exceeded the ten-row maintenance cap', v_pass;
    end if;
    v_previous := v_actual;
  end loop;
end $body$;

do $$
begin
  if (select count(*) from public.articles where editorial_status='published' and ai_classification_status='pending' and published_at<now()-interval '1 hour') <> 0 then
    raise exception 'All old published queue rows should be expired after thirty 10-row passes';
  end if;
  if (select count(*) from public.articles where editorial_status='published' and ai_classification_status='pending' and published_at>=now()-interval '1 hour') <> 25 then
    raise exception 'Recent pending rows must remain eligible';
  end if;
  if (select count(*) from public.articles where editorial_status='draft' and ai_classification_status='pending') <> 10 then
    raise exception 'Non-published rows must not be modified';
  end if;
  if exists(select 1 from public.articles where ai_classification_status='expired' and classification_last_error is distinct from 'expired: published more than 1 hour ago') then
    raise exception 'Expired rows must retain the documented reason';
  end if;
end $$;

select public.expire_stale_classification_queue();
do $$
begin
  if (select count(*) from public.articles where editorial_status='published' and ai_classification_status='expired') <> 295 then
    raise exception 'Repeated expiry calls must be idempotent';
  end if;
end $$;
SQL

echo "classification-expiry: indexed bounded batches (10), recent-row preservation, non-published preservation and idempotence passed"
