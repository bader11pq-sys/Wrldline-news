-- PostgREST schema introspection can exceed the default 8s authenticator timeout
-- as the editorial schema grows. Keep this bounded; do not change ingestion or AI jobs.
alter role authenticator set statement_timeout = '45s';
alter role authenticator set lock_timeout = '30s';
notify pgrst, 'reload schema';
