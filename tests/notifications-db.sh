#!/usr/bin/env bash
# Disposable Unix-socket fixture only. Never reads DATABASE_URL or exposes ports.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(pg_config --bindir)}"
TMP="$(mktemp -d /tmp/wrldline-notifications.XXXXXX)"
cleanup(){ "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$TMP/data" -A trust --no-locale >/dev/null
"$PGBIN/pg_ctl" -D "$TMP/data" -l "$TMP/server.log" -o "-F -k $TMP -h '' -p 55438" -w start >/dev/null
"$PGBIN/createdb" -h "$TMP" -p 55438 notifications_fixture
"$PGBIN/psql" -X -h "$TMP" -p 55438 -d notifications_fixture -v ON_ERROR_STOP=1 -f "$ROOT/tests/notifications-fixture.sql"
# The fixture applies its migration and invokes notifications-sql-test.sql itself.
echo 'notifications: disposable consent/RLS/lease checks passed'
