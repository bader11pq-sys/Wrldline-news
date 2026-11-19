begin;

-- The old cleanup query combined three statuses and the planner selected the
-- generic publication index, then filtered/sorted a large candidate set.
-- This small partial index matches both the expiry predicate and its ordering.
create index if not exists articles_classification_expiry_idx
  on public.articles (published_at asc, id asc)
  where editorial_status = 'published'
    and ai_classification_status in ('pending', 'failed', 'processing');

comment on index public.articles_classification_expiry_idx is
  'Supports bounded expiry of published articles outside the one-hour AI classification window.';

create or replace function public.expire_stale_classification_queue()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  -- Ten rows per invocation keeps trust guards and audit hooks within the
  -- PostgREST statement budget. The partial index above matches this exact
  -- multi-status predicate and (published_at, id) ordering.
  with candidates as (
    select a.id
    from public.articles a
    where a.editorial_status = 'published'
      and a.ai_classification_status in ('pending', 'failed', 'processing')
      and a.published_at < now() - interval '1 hour'
    order by a.published_at asc, a.id asc
    limit 10
    for update skip locked
  )
  update public.articles a
  set ai_classification_status = 'expired',
      classification_claimed_at = null,
      classification_last_error = 'expired: published more than 1 hour ago'
  from candidates c
  where a.id = c.id;
end;
$function$;

commit;
