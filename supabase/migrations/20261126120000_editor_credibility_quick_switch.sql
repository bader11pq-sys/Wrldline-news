-- WRLDLINE · fast editorial credibility switch
--
-- Editors asked for a single-click credibility status change in the editorial
-- dashboard. The strict human-review path (claims + two independent evidence
-- origins + a review note) stays intact for `review_article_trust`. This
-- migration adds a second, explicitly separate entry point that lets an
-- authorized editor set the status immediately, without attaching sources or
-- writing a mandatory note.
--
-- Safeguards kept:
--   * only editor/admin JWTs can call the RPC (private.trust_is_editor);
--   * the trigger still stamps who reviewed it and when;
--   * the append-only article_change_log still records the change;
--   * the status list is closed; unknown values are rejected.
begin;

-- The reader-facing status now carries the granularity editors already used in
-- the legacy `verification` field (single source, multiple sources, field and
-- official confirmation, correction, retraction). Nothing is removed.
alter table public.articles drop constraint if exists articles_editorial_trust_check;
alter table public.articles add constraint articles_editorial_trust_check
  check (editorial_trust_status in (
    'confirmed','unconfirmed','disputed',
    'single','multi','field_confirmed','official_confirmed','corrected','retracted'
  ));

create or replace function private.trust_article_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare oj jsonb; nj jsonb; translated boolean; review_requested boolean; changed boolean; quick boolean; credit text;
begin
  -- Single-click editorial credibility switch. Only an editor/admin JWT can set
  -- the transaction-local flag, and only public.set_article_credibility does.
  -- It keeps the audit trail but does not require evidence rows or a note.
  quick:=private.trust_is_editor() and coalesce(current_setting('wrldline.credibility_override',true),'')='on';
  credit:=nullif(btrim(coalesce(current_setting('wrldline.credibility_status',true),'')),'');
  if quick then
    if credit is null then raise exception 'Credibility status is required' using errcode='22023'; end if;
    new.trust_needs_review:=false;
    new.trust_reviewed_at:=clock_timestamp();
    new.trust_reviewed_by:=auth.uid();
    new.verification:=credit;
    return new;
  end if;
  nj:=to_jsonb(new); oj:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  translated:=coalesce(nullif(new.source_language,''),new.lang) is distinct from new.lang;
  if tg_op='UPDATE' and new.verification is distinct from old.verification
    and new.verification in ('disputed','unconfirmed','retracted') and new.editorial_trust_status='confirmed' then
    new.trust_needs_review:=true;
    new.editorial_trust_status:=case when new.verification in ('disputed','retracted') then 'disputed' else 'unconfirmed' end;
  end if;
  changed:=tg_op='UPDATE' and (oj->'title' is distinct from nj->'title' or oj->'summary' is distinct from nj->'summary'
    or oj->'lang' is distinct from nj->'lang' or oj->'source_language' is distinct from nj->'source_language'
    or oj->'source_url' is distinct from nj->'source_url' or oj->'agency_narrative' is distinct from nj->'agency_narrative'
    or oj->'agency_statement_url' is distinct from nj->'agency_statement_url' or oj->'agency_account_url' is distinct from nj->'agency_account_url'
    or oj->'trust_source_excerpt' is distinct from nj->'trust_source_excerpt');
  if tg_op='UPDATE' and new.human_translation_status is distinct from old.human_translation_status
    and translated and new.human_translation_status<>'reviewed' and new.editorial_trust_status='confirmed' then
    new.trust_needs_review:=true; new.editorial_trust_status:='unconfirmed'; new.verification:='unconfirmed';
  end if;
  if changed then
    new.trust_needs_review:=true; new.editorial_trust_status:='unconfirmed';
    if translated then new.human_translation_status:='pending'; new.human_translation_reviewed_at:=null; new.human_translation_reviewed_by:=null; end if;
    if new.verification in ('confirmed','field_confirmed','official_confirmed') then new.verification:='unconfirmed'; end if;
  end if;
  if new.agency_account_url is not null and not private.trust_safe_url(new.agency_account_url) then raise exception 'Invalid agency account URL'; end if;
  if new.agency_statement_url is not null and not private.trust_safe_url(new.agency_statement_url) then raise exception 'Invalid agency statement URL'; end if;
  if new.human_translation_status='not_required' and translated then raise exception 'Translated content requires human translation review'; end if;
  if (tg_op='INSERT' and new.human_translation_status='reviewed') or
    (tg_op='UPDATE' and (new.human_translation_status is distinct from old.human_translation_status or new.human_translation_note is distinct from old.human_translation_note)
      and new.human_translation_status='reviewed') then
    if not private.trust_is_editor() or nullif(btrim(new.human_translation_note),'') is null then raise exception 'Explicit human translation review note required' using errcode='42501'; end if;
    new.human_translation_reviewed_at:=clock_timestamp(); new.human_translation_reviewed_by:=auth.uid();
  elsif tg_op='UPDATE' then
    if not changed then new.human_translation_reviewed_at:=old.human_translation_reviewed_at; new.human_translation_reviewed_by:=old.human_translation_reviewed_by; end if;
  else new.human_translation_reviewed_at:=null; new.human_translation_reviewed_by:=null;
  end if;
  review_requested:=(tg_op='INSERT' and (new.editorial_trust_status='confirmed' or not new.trust_needs_review)) or
    (tg_op='UPDATE' and ((new.editorial_trust_status is distinct from old.editorial_trust_status and new.editorial_trust_status='confirmed')
      or (old.trust_needs_review and not new.trust_needs_review)
      or (new.trust_review_note is distinct from old.trust_review_note and not new.trust_needs_review)));
  if review_requested then
    if not private.trust_is_editor() or nullif(btrim(new.trust_review_note),'') is null then raise exception 'Explicit human editorial review required' using errcode='42501'; end if;
    if new.editorial_trust_status='confirmed' then
      if not exists(select 1 from public.article_claims where article_id=new.id)
        or exists(select 1 from public.article_claims where article_id=new.id and status<>'confirmed')
        or exists(select 1 from public.article_evidence where article_id=new.id and evidence_type in ('contradiction','retraction')) then
        raise exception 'Unconfirmed/disputed claims or conflicting evidence prevent story confirmation';
      end if;
      -- Revalidate current evidence, not a stale claim-review label.
      if exists(select 1 from public.article_claims c where c.article_id=new.id and
        not private.trust_claim_current(c.id)) then
        raise exception 'Claim evidence is no longer sufficient or changed since its human review';
      end if;
      if translated and (new.human_translation_status<>'reviewed' or new.human_translation_reviewed_by is null) then raise exception 'Unreviewed translation cannot be confirmed'; end if;
    end if;
    new.trust_needs_review:=false; new.trust_reviewed_at:=clock_timestamp(); new.trust_reviewed_by:=auth.uid();
    new.verification:=new.editorial_trust_status;
  elsif tg_op='UPDATE' then
    new.trust_reviewed_at:=old.trust_reviewed_at; new.trust_reviewed_by:=old.trust_reviewed_by;
  else new.trust_reviewed_at:=null; new.trust_reviewed_by:=null;
  end if;
  -- Legacy verification field cannot bypass the structured claim/translation checks.
  if new.verification in ('confirmed','field_confirmed','official_confirmed') and
    (tg_op='INSERT' or new.verification is distinct from old.verification) and not review_requested then
    raise exception 'Use the human editorial trust review; AI confidence and counts do not verify a story';
  end if;
  return new;
end; $$;


-- The quick switch. p_note is optional by design: the editorial decision is
-- recorded, and the audit log still says exactly what changed and when.
create or replace function public.set_article_credibility(
  p_article_id uuid,
  p_status text,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_status text := lower(btrim(coalesce(p_status,'')));
  v_trust text;
  v_row public.articles;
begin
  if not private.trust_is_editor() then
    raise exception 'Editor/admin required' using errcode='42501';
  end if;
  if v_status not in ('confirmed','unconfirmed','disputed','single','multi','field_confirmed','official_confirmed','corrected','retracted') then
    raise exception 'Unknown credibility status' using errcode='22023';
  end if;
  if p_article_id is null then
    raise exception 'Article is required' using errcode='22023';
  end if;

  v_trust := case v_status
    when 'confirmed' then 'confirmed'
    when 'multi' then 'confirmed'
    when 'field_confirmed' then 'confirmed'
    when 'official_confirmed' then 'confirmed'
    when 'disputed' then 'disputed'
    when 'retracted' then 'disputed'
    when 'corrected' then 'unconfirmed'
    else 'unconfirmed'
  end;

  -- Transaction-local signals read by private.trust_article_guard. They cannot
  -- be set by a client directly: only this security-definer function does.
  perform set_config('wrldline.credibility_override','on',true);
  perform set_config('wrldline.credibility_status',v_status,true);

  update public.articles a
     set editorial_trust_status=v_trust,
         verification=v_status,
         trust_needs_review=false,
         trust_review_note=coalesce(nullif(btrim(p_note),''),a.trust_review_note)
   where a.id=p_article_id
  returning a.* into v_row;

  if v_row.id is null then
    raise exception 'Article not found' using errcode='P0002';
  end if;

  return jsonb_build_object(
    'article_id',v_row.id,
    'credibility_status',v_status,
    'editorial_trust_status',v_row.editorial_trust_status,
    'trust_needs_review',v_row.trust_needs_review,
    'trust_reviewed_at',v_row.trust_reviewed_at,
    'note_recorded',nullif(btrim(p_note),'') is not null
  );
end; $$;
revoke all on function public.set_article_credibility(uuid,text,text) from public,anon;
grant execute on function public.set_article_credibility(uuid,text,text) to authenticated;

comment on function public.set_article_credibility(uuid,text,text) is
  'Editor-only single-click credibility status. Records reviewer + audit entry; evidence links are optional.';

commit;
