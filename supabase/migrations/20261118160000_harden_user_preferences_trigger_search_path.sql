begin;

-- The trigger only calls pg_catalog.now(); do not inherit a caller-controlled
-- search_path when the function executes.
alter function public.set_user_preferences_updated_at()
  set search_path = pg_catalog;

commit;
