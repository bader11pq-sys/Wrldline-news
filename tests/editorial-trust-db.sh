#!/usr/bin/env bash
# Isolated, disposable fixture only. Never accepts DATABASE_URL/production inputs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(pg_config --bindir)}"
TMP="$(mktemp -d /tmp/wrldline-editorial-trust.XXXXXX)"
cleanup(){ "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$TMP/data" -A trust --no-locale >/dev/null
"$PGBIN/pg_ctl" -D "$TMP/data" -l "$TMP/server.log" -o "-F -k $TMP -h '' -p 55437" -w start >/dev/null
PSQL=("$PGBIN/psql" -X -h "$TMP" -p 55437 -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/tests/editorial-trust-fixture.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261115030000_editorial_trust.sql" >"$TMP/migration.log" 2>&1 || { cat "$TMP/migration.log"; exit 1; }
"${PSQL[@]}" -f "$ROOT/tests/editorial-trust-db.sql"
# A second application must preserve rows and keep the append-only guards.
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261115030000_editorial_trust.sql" >"$TMP/reapply.log" 2>&1 || { cat "$TMP/reapply.log"; exit 1; }
"${PSQL[@]}" -c "select count(*) as retained_audit_rows from public.article_change_log;"
"${PSQL[@]}" <<'SQL'
set role authenticated;
do $$ begin
 if has_table_privilege(current_user,'public.articles','SELECT') or
    has_table_privilege(current_user,'public.article_translations','SELECT') then
   raise exception 'Reapplication restored unsafe table-wide reader SELECT';
 end if;
 if has_column_privilege(current_user,'public.articles','trust_review_note','SELECT') or
    has_column_privilege(current_user,'public.articles','trust_reviewed_by','SELECT') or
    has_column_privilege(current_user,'public.article_translations','human_review_note','SELECT') or
    has_column_privilege(current_user,'public.article_translations','reviewed_by','SELECT') then
   raise exception 'Reapplication exposed private review columns';
 end if;
 if not has_column_privilege(current_user,'public.articles','title','SELECT') then
   raise exception 'Reapplication broke safe newsroom projection';
 end if;
 if exists(select 1 from public.article_translations) then
   raise exception 'Reapplication exposed published translation of rejected parent';
 end if;
 raise notice 'PASS: reapplication preserves private ACLs, safe projection and translation gate';
end $$;
reset role;
SQL
"${PSQL[@]}" -c "create database trust_minimal;" >/dev/null
sed '/^create role /d' "$ROOT/tests/editorial-trust-fixture.sql" | "${PSQL[@]}" -d trust_minimal >/dev/null
"${PSQL[@]}" -d trust_minimal -c "drop table public.article_change_log; drop table public.article_translations;" >/dev/null
"${PSQL[@]}" -d trust_minimal -f "$ROOT/supabase/migrations/20261115030000_editorial_trust.sql" >"$TMP/minimal.log" 2>&1 || { cat "$TMP/minimal.log"; exit 1; }
"${PSQL[@]}" -d trust_minimal <<'SQL'
do $$ begin
 if public.get_public_article_trust('11111111-1111-4111-8111-111111111111')->'reviewed_translation' is distinct from 'null'::jsonb then
   raise exception 'Optional translation absence must return null';
 end if;
 if to_regclass('public.article_change_log') is null then raise exception 'Fresh sanitized log must be created'; end if;
end $$;
SQL
echo "editorial-trust: isolated database checks, migration reapplication and absent optional tables passed"
