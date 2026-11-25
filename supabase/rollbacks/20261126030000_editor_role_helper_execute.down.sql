-- Reverts 20261126030000_editor_role_helper_execute.sql: restores the original revoked state.
-- Warning: after this runs, the editor policies on article_updates and article_review_notes raise
-- 42501 for authenticated callers instead of returning rows.
begin;
revoke execute on function private.trust_is_editor() from authenticated, service_role;
commit;
