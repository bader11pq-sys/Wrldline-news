begin;

alter table public.feeds
  add column if not exists last_attempted_at timestamptz;

comment on column public.feeds.last_attempted_at is
  'Timestamp of the latest RSS fetch attempt; last_fetched remains the latest successful fetch.';

commit;
