-- Remove legacy false-positive urgent flags created by generic Telegram/Google News feeds.
-- New ingestion requires an explicit alert marker in the title.
update public.articles
set is_breaking = false
where is_breaking = true
  and source_name like '%Breaking Desk'
  and published_at >= now() - interval '1 hour'
  and title !~* $re$^[[:space:][:punct:]]*(BREAKING([[:space:]]+NEWS)?|JUST IN)([[:space:]:：|—-]|$)$re$
  and title !~ $ar$^[[:space:][:punct:]]*(عاجل|نبأ عاجل|خبر عاجل|تطور عاجل)([[:space:]:：،|—-]|$)$ar$;
