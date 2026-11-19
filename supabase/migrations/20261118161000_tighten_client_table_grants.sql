begin;

-- Subscription state is written only by trusted Edge Functions/webhooks.
-- Authenticated readers may see only their own row through the existing RLS policy.
revoke all on table public.subscriptions from public, anon, authenticated;
grant select on table public.subscriptions to authenticated;
grant all on table public.subscriptions to service_role;

-- Ingestion run telemetry is an internal service-role write/read surface.
-- The table intentionally has no client RLS policies.
revoke all on table public.news_ingestion_runs from public, anon, authenticated;
grant all on table public.news_ingestion_runs to service_role;

-- Feed metadata is public to read, but ingestion/admin writes belong to server jobs.
revoke all on table public.feeds from public, anon, authenticated;
grant select on table public.feeds to anon, authenticated;
grant all on table public.feeds to service_role;

commit;
