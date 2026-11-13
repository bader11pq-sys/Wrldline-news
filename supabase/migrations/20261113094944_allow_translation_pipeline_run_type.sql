alter table public.news_ingestion_runs
  drop constraint if exists news_ingestion_runs_pipeline_check;

alter table public.news_ingestion_runs
  add constraint news_ingestion_runs_pipeline_check
  check (pipeline = any (array['general'::text, 'breaking'::text, 'translation'::text]));
