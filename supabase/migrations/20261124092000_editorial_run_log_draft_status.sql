-- The editorial generator now creates drafts only; allow that outcome in the run log.
-- Rollback: restore the previous constraint without 'draft'.
alter table public.editorial_run_log drop constraint if exists editorial_run_log_status_check;
alter table public.editorial_run_log
  add constraint editorial_run_log_status_check
  check (status in ('started','published','draft','skipped','failed'));
