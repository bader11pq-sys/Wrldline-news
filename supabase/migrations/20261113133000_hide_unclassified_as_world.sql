-- Do not display newly ingested, unclassified stories as international/world news.
-- The AI worker will replace this temporary category after successful classification.
update public.articles
set category = 'uncategorized',
    country = case when country = 'دولي' then 'غير محدد' else country end
where published_at >= now() - interval '1 hour'
  and ai_classification_status in ('pending','failed')
  and category = 'world';
