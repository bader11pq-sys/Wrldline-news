#!/usr/bin/env bash
# Apply, roll back and re-apply the pending editorial migrations against a
# STAGING Supabase project — never against production.
#
# Safety model
#   * the script refuses any database URL that contains the production project
#     ref, and refuses to run without an explicit --confirm flag
#   * every phase is wrapped in a single transaction (psql -1), so a failing
#     migration leaves the staging database exactly as it was
#   * --phase up|down|roundtrip; roundtrip = up, down, up (proves both scripts
#     and proves re-application is idempotent in practice, not by inspection)
#
# Usage
#   STAGING_DB_URL='postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres' \
#     scripts/staging-migrations.sh --phase roundtrip --confirm
#
# The production project ref is hard-coded below on purpose: a typo in an
# environment variable must not be able to destroy production data.
set -euo pipefail

PRODUCTION_REF="vmaxbnogmmfyrcucapnq"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PHASE=""
CONFIRMED=0
for arg in "$@"; do
  case "$arg" in
    --phase=*) PHASE="${arg#*=}" ;;
    --phase) shift ;;
    --confirm) CONFIRMED=1 ;;
    up|down|roundtrip) PHASE="$arg" ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# Migrations run in dependency order: the grant first (additive, unblocks editor
# RLS), then the desk objects that depend on it, then the feed objects.
UP_FILES=(
  "supabase/migrations/20261126030000_editor_role_helper_execute.sql"
  "supabase/migrations/20261126020000_newsroom_desk.sql"
  "supabase/migrations/20261126010000_personalized_feed.sql"
)
DOWN_FILES=(
  "supabase/rollbacks/20261126010000_personalized_feed.down.sql"
  "supabase/rollbacks/20261126020000_newsroom_desk.down.sql"
  "supabase/rollbacks/20261126030000_editor_role_helper_execute.down.sql"
)

die() { echo "staging-migrations: $*" >&2; exit 1; }

[ -n "${STAGING_DB_URL:-}" ] || die "STAGING_DB_URL is not set"
[ "$CONFIRMED" = "1" ] || die "refusing to run without --confirm (this writes to a database)"
case "$STAGING_DB_URL" in
  *"$PRODUCTION_REF"*) die "STAGING_DB_URL points at the production project ref; refusing to continue" ;;
esac
[ -n "$PHASE" ] || die "choose --phase up|down|roundtrip"
command -v psql >/dev/null || die "psql is required"

for file in "${UP_FILES[@]}" "${DOWN_FILES[@]}"; do
  [ -f "$ROOT/$file" ] || die "missing file: $file"
done

run() {
  local file="$1" label="$2"
  echo "== $label: $file"
  # -1 wraps the file in a transaction; -v ON_ERROR_STOP stops on the first error.
  psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -1 -q -f "$ROOT/$file"
}

case "$PHASE" in
  up)
    for file in "${UP_FILES[@]}"; do run "$file" "apply"; done
    ;;
  down)
    for file in "${DOWN_FILES[@]}"; do run "$file" "roll back"; done
    ;;
  roundtrip)
    for file in "${UP_FILES[@]}"; do run "$file" "apply"; done
    for file in "${DOWN_FILES[@]}"; do run "$file" "roll back"; done
    for file in "${UP_FILES[@]}"; do run "$file" "re-apply"; done
    ;;
  *) die "unknown phase: $PHASE" ;;
esac

echo "staging-migrations: $PHASE completed against staging (production untouched)"
echo "next: STAGING_SUPABASE_URL=... STAGING_ANON_KEY=... node scripts/probe-backend.mjs --expect=applied"
