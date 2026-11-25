-- Reverts 20261126020000_newsroom_desk.sql. Drops internal review notes (data loss limited to those notes).
begin;
drop function if exists public.editor_source_summary(integer);
drop function if exists public.editor_article_queue(text, text, text, integer, integer);
drop function if exists public.editor_newsroom_overview(integer);
drop table if exists public.article_review_notes;
commit;
