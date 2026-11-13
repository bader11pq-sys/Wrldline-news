-- Persist per-article translation retry backoff so a provider outage cannot pin the queue.
alter table public.articles
  add column if not exists translation_attempts integer not null default 0,
  add column if not exists translation_retry_after timestamptz,
  add column if not exists translation_last_error text;

-- Remove obvious false positives already ingested during the active ticker window.
update public.articles
set is_breaking = false
where is_breaking = true
  and source_name like '%Breaking Desk'
  and published_at >= now() - interval '10 minutes'
  and title !~* '^[[:space:][:punct:]]*(BREAKING([[:space:]]+NEWS)?|JUST IN)([[:space:]:：|—-]|$)'
  and title !~ '^[[:space:][:punct:]]*(عاجل|نبأ عاجل|خبر عاجل|تطور عاجل)([[:space:]:：،|—-]|$)';
