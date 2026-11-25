-- Editor role helper: grant EXECUTE to authenticated so RLS policies can call it.
--
-- 20261115030000_editorial_trust.sql created private.trust_is_editor() and revoked it from
-- public, anon and authenticated. That is right for direct calls, but the same function is used
-- inside row-level-security policies that target authenticated:
--   * article_updates  (20261125170000_story_updates.sql, editor read/delete)
--   * article_review_notes (20261126020000_newsroom_desk.sql, editor read/insert)
-- RLS policy expressions are evaluated with the privileges of the calling role, so a policy that
-- calls a function the role cannot EXECUTE fails the whole statement with
--   permission denied for function trust_is_editor   (SQLSTATE 42501)
-- instead of returning zero rows. In production, then, an editor opening the desk would get an
-- error rather than the notes queue, even though the migration applied cleanly and the local
-- PGlite suites passed (their fixtures never revoked the helper).
--
-- The helper only reads the caller's own JWT app_metadata.role and touches no table, so it reveals
-- nothing the caller does not already know. Granting EXECUTE to authenticated is the standard
-- pattern for policy helpers; anon and public stay revoked.
--
-- No table, policy or grant of data access changes here. This only lets the existing policies be
-- evaluated.
-- Rollback: supabase/rollbacks/20261126030000_editor_role_helper_execute.down.sql
begin;

revoke all on function private.trust_is_editor() from public, anon;
grant execute on function private.trust_is_editor() to authenticated, service_role;

commit;
