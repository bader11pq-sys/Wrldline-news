begin;

-- Expire old classification work in small, index-backed batches.
-- The classifier only claims published articles from the last hour; historical
-- rows are queue metadata, not a reason to block current ingestion.
create or replace function public.expire_stale_classification_queue()
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '30s'
set lock_timeout to '5s'
as $function$
declare
  v_status text;
begin
  -- Separate equality predicates let the partial (status, published_at) index
  -- serve each batch. SKIP LOCKED avoids waiting behind concurrent claims.
  foreach v_status in array array['pending', 'failed', 'processing'] loop
    with candidates as (
      select a.id
      from public.articles as a
      where a.editorial_status = 'published'
        and a.ai_classification_status = v_status
        and a.published_at < now() - interval '1 hour'
      order by a.published_at asc
      limit 100
      for update skip locked
    )
    update public.articles as a
    set ai_classification_status = 'expired',
        classification_claimed_at = null,
        classification_last_error = 'expired: published more than 1 hour ago'
    from candidates as c
    where a.id = c.id;
  end loop;
end;
$function$;

comment on function public.expire_stale_classification_queue() is
  'Expires at most 100 published rows per classification status per call; uses the classification queue index, SKIP LOCKED, a 30s statement timeout, and leaves non-published rows untouched.';

commit;
