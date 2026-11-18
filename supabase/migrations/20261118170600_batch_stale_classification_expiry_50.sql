begin;

create or replace function public.expire_stale_classification_queue()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  -- Keep the maintenance unit small: article trust triggers and audit hooks
  -- run for each row, so a bounded 50-row batch stays below API timeouts.
  with candidates as (
    select a.id
    from public.articles a
    where a.editorial_status = 'published'
      and a.ai_classification_status in ('pending', 'failed', 'processing')
      and a.published_at < now() - interval '1 hour'
    order by a.published_at asc, a.id asc
    limit 50
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
