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

"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261118172000_batch_classification_queue_expiry.sql" >"$TMP/migration.log" 2>&1 || { cat "$TMP/migration.log"; exit 1; }

"${PSQL[@]}" <<'SQL'
select public.expire_stale_classification_queue();
do $$
begin
  if (select count(*) from public.articles where editorial_status='published' and ai_classification_status='pending' and published_at<now()-interval '1 hour') <> 120 then
    raise exception 'First pass must expire exactly 100 old pending rows';
  end if;
  if (select count(*) from public.articles where editorial_status='published' and ai_classification_status='failed') <> 0 then
    raise exception 'First pass must expire all 55 old failed rows';
  end if;
  if (select count(*) from public.articles where editorial_status='published' and ai_classification_status='processing') <> 0 then
    raise exception 'First pass must expire all 20 old processing rows';
  end if;
  if (select count(*) from public.articles where ai_classification_status='expired') <> 175 then
    raise exception 'First pass should update 175 rows (100 pending + 55 failed + 20 processing)';
  end if;
  if (select count(*) from public.articles where editorial_status='published' and ai_classification_status='pending' and published_at>=now()-interval '1 hour') <> 25 then
    raise exception 'Recent pending rows must remain eligible';
  end if;
  if (select count(*) from public.articles where editorial_status='draft' and ai_classification_status='pending') <> 10 then
    raise exception 'Non-published rows must not be modified';
  end if;
end $$;

select public.expire_stale_classification_queue();
do $$
begin
  if (select count(*) from public.articles where editorial_status='published' and ai_classification_status='pending' and published_at<now()-interval '1 hour') <> 20 then
    raise exception 'Second pass must expire another 100 pending rows';
  end if;
  if (select count(*) from public.articles where ai_classification_status='expired') <> 275 then
    raise exception 'Second pass total should be 275 expired rows';
  end if;
end $$;

select public.expire_stale_classification_queue();
do $$
begin
  if (select count(*) from public.articles where editorial_status='published' and ai_classification_status='pending' and published_at<now()-interval '1 hour') <> 0 then
    raise exception 'Third pass must expire the remaining 20 old pending rows';
  end if;
  if (select count(*) from public.articles where ai_classification_status='expired') <> 295 then
    raise exception 'All 295 old published rows should now be expired';
  end if;
end $$;

select public.expire_stale_classification_queue();
do $$
begin
  if (select count(*) from public.articles where ai_classification_status='expired') <> 295 then
    raise exception 'Repeated expiry calls must be idempotent';
  end if;
end $$;
SQL

echo "classification-expiry: bounded batches, recent-row preservation, non-published preservation and idempotence passed"
