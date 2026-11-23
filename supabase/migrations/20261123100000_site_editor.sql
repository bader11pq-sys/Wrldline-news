begin;

-- A revocation takes effect even if a browser still has an old admin JWT.
-- Keep the legacy dashboard's editor/admin policies and the ingestion roles intact.
create function public.site_editor(
  p_action text, p_id uuid default null, p_version text default null, p_values jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  a public.articles%rowtype;
  v public.articles%rowtype;
  version text;
  snapshot jsonb;
  edition_version text;
  original_link text;
  input_values jsonb;
  target uuid;
  item_id uuid;
  edition public.article_translations%rowtype;
  evidence public.article_evidence%rowtype;
  claim public.article_claims%rowtype;
  href text;
  note text;
  loc text;
  fields constant text[] := array[
    'title','summary','category','event_country','source_name','source_url','author','lang','source_language',
    'editorial_status','content_type','image_url','media_type','is_breaking','is_exclusive','exclusive_type',
    'exclusive_reason','sponsor_name','sponsor_url','correction_note','published_at','agency_name',
    'agency_account_url','agency_statement_url','agency_narrative','trust_source_excerpt'
  ];
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin'
    or not exists (select 1 from auth.users u where u.id = auth.uid() and u.raw_app_meta_data->>'role' = 'admin') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_action = 'access' then return 'true'::jsonb; end if;
  if p_action = 'queue' then
    return coalesce((
      select jsonb_agg(to_jsonb(q) order by q.published_at desc nulls last,q.id) from (
        select id,title,editorial_status,published_at from public.articles
        where editorial_status in ('draft','review','rejected')
          and (coalesce(btrim(p_values->>'query'),'') = '' or
            strpos(lower(title),lower(left(btrim(p_values->>'query'),160))) > 0)
        order by published_at desc nulls last,id limit 30
      ) q
    ), '[]'::jsonb);
  end if;
  if jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'Invalid editor input' using errcode = '22023';
  end if;

  if p_id is not null then
    if p_action in ('load','review_tools') then
      select to_jsonb(x), x.xmin::text into snapshot, version from public.articles x where id = p_id;
    else
      select to_jsonb(x), x.xmin::text into snapshot, version from public.articles x where id = p_id for update;
    end if;
    if not found then raise exception 'Article not found' using errcode = 'P0002'; end if;
    a := jsonb_populate_record(null::public.articles,snapshot);
    original_link:=case when private.trust_safe_url(a.url) then a.url else a.source_url end;
    if p_action not in ('load','review_tools') and p_version is distinct from version then
      raise exception 'Article changed since it was opened' using errcode = '40001';
    end if;
  elsif p_action <> 'save' then
    raise exception 'Article required' using errcode = '22023';
  end if;

  if p_action = 'review_tools' then
    return jsonb_build_object(
      'evidence',coalesce((select jsonb_agg(to_jsonb(e) - 'article_id' - 'created_by' - 'independence_reviewed_by') from
        (select * from public.article_evidence where article_id=p_id order by created_at,id limit 100) e),'[]'::jsonb),
      'claims',coalesce((select jsonb_agg(to_jsonb(c) - 'article_id' - 'reviewed_by') from
        (select * from public.article_claims where article_id=p_id order by created_at,id limit 100) c),'[]'::jsonb),
      'editions',coalesce((select jsonb_agg(to_jsonb(tr)) from
        (select id,lang,title,summary,translation_status,translation_source,xmin::text as version from public.article_translations
          where article_id=p_id and lang in ('ar','en') order by created_at desc limit 2) tr),'[]'::jsonb)
    );
  elsif p_action = 'save' then
    if (p_values - fields) <> '{}'::jsonb then
      raise exception 'Unsupported article field' using errcode = '22023';
    end if;
    input_values:=p_values;
    if jsonb_typeof(p_values->'author')='string' and pg_typeof(a.author)::text in ('text[]','character varying[]') then
      input_values:=jsonb_set(input_values,'{author}',to_jsonb(regexp_split_to_array(p_values->>'author','[[:space:]]*[,،][[:space:]]*')));
    end if;
    v := jsonb_populate_record(a,input_values);
    if not (p_values ? 'source_url') then v.source_url:=original_link; end if;
    v.title := btrim(v.title);
    v.source_name := btrim(v.source_name);
    v.editorial_status := coalesce(v.editorial_status,'draft');
    v.category := coalesce(v.category,'uncategorized');
    v.content_type := coalesce(v.content_type,'news');
    v.lang := coalesce(v.lang,'ar');
    v.source_language := coalesce(v.source_language,v.lang);
    if nullif(v.title,'') is null or length(v.title)>300 or nullif(btrim(v.summary),'') is null
       or length(v.summary)>1000000 or nullif(v.source_name,'') is null or length(v.source_name)>200
       or v.editorial_status not in ('draft','review','published','rejected')
       or (v.category is distinct from a.category and v.category not in ('politics','economy','security','world','sports','tech','culture','health','science','environment','society','uncategorized'))
       or v.content_type not in ('news','analysis','opinion','sponsored')
       or ((v.lang is distinct from a.lang and v.lang not in ('ar','en')) or
           (v.source_language is distinct from a.source_language and v.source_language not in ('ar','en')))
       or length(p_values->>'author')>200 or length(v.event_country)>80 or length(v.correction_note)>1200
       or length(v.agency_name)>180 or length(v.agency_narrative)>2000 or length(v.trust_source_excerpt)>2000
       or (v.content_type='sponsored' and nullif(btrim(v.sponsor_name),'') is null)
       or length(v.sponsor_name)>120 or length(v.exclusive_reason)>1200
       or (v.is_exclusive and a.is_exclusive is distinct from true and nullif(btrim(v.exclusive_reason),'') is null)
       or (v.media_type is not null and v.media_type not in ('image','video')) then
      raise exception 'Invalid article fields' using errcode = '22023';
    end if;
    for href in select value from jsonb_each_text(p_values) where key in
      ('source_url','image_url','sponsor_url','agency_account_url','agency_statement_url') loop
      if href is not null and (length(href)>2048 or not private.trust_safe_url(href) or href ~ '[[:cntrl:]]' or strpos(href,chr(92))>0) then
        raise exception 'Use a valid HTTP(S) URL' using errcode = '22023';
      end if;
    end loop;
    if v.content_type <> 'sponsored' then v.sponsor_name:=null; v.sponsor_url:=null; end if;
    if v.is_exclusive and a.is_exclusive is distinct from true then v.exclusive_type:='original_reporting'; end if;
    if not coalesce(v.is_exclusive,false) then v.exclusive_type:=null; v.exclusive_reason:=null; end if;
    if v.image_url is null then v.media_type:=null; else v.media_type:=coalesce(v.media_type,'image'); end if;
    if v.correction_note is distinct from a.correction_note then
      v.corrected_at:=case when v.correction_note is not null then clock_timestamp() end;
    end if;
    v.published_at:=coalesce(v.published_at,clock_timestamp());
    if v.editorial_status='published' and v.published_at>clock_timestamp() then
      raise exception 'Scheduled publishing is not available in this editor' using errcode = '22023';
    end if;
    loc := case when lower(coalesce(btrim(v.event_country),'')) not in ('','غير محدد','دولي','unknown','international','world')
      then btrim(v.event_country) end;
    if p_id is null then
      insert into public.articles (title,summary,category,country,event_country,source_name,source_url,url,author,lang,
        source_language,editorial_status,content_type,image_url,media_type,is_breaking,is_exclusive,exclusive_type,
        exclusive_reason,sponsor_name,sponsor_url,correction_note,corrected_at,published_at,agency_name,agency_account_url,
        agency_statement_url,agency_narrative,trust_source_excerpt,ai_classification_status,classification_reason,topics)
      values (v.title,v.summary,v.category,loc,loc,v.source_name,v.source_url,coalesce(v.source_url,'editorial-'||gen_random_uuid()::text),
        v.author,v.lang,v.source_language,v.editorial_status,v.content_type,v.image_url,v.media_type,coalesce(v.is_breaking,false),
        coalesce(v.is_exclusive,false),v.exclusive_type,v.exclusive_reason,v.sponsor_name,v.sponsor_url,v.correction_note,v.corrected_at,
        v.published_at,v.agency_name,v.agency_account_url,v.agency_statement_url,v.agency_narrative,v.trust_source_excerpt,
        'skipped','editorial_metadata',case when v.category='uncategorized' then '{}'::text[] else array[v.category] end)
      returning id into p_id;
    else
      -- Preserve ingestion identity unless the administrator changes the public link.
      -- The old browser-edit metadata trigger skips definer calls, so apply the
      -- same location, classifier-ownership and topic rules explicitly here.
      update public.articles set title=v.title,summary=v.summary,category=v.category,
        country=case when loc is distinct from a.event_country then loc else a.country end,
        event_country=loc,source_name=v.source_name,
        url=case when v.source_url is not distinct from original_link then a.url else coalesce(v.source_url,'editorial-'||p_id::text) end,
        source_url=case when v.source_url is not distinct from original_link then a.source_url else v.source_url end,
        author=v.author,lang=v.lang,source_language=v.source_language,
        editorial_status=v.editorial_status,content_type=v.content_type,image_url=v.image_url,media_type=v.media_type,
        is_breaking=coalesce(v.is_breaking,false),is_exclusive=coalesce(v.is_exclusive,false),
        exclusive_type=v.exclusive_type,exclusive_reason=v.exclusive_reason,
        exclusive_confidence=case when v.is_exclusive is distinct from a.is_exclusive then null else a.exclusive_confidence end,
        sponsor_name=v.sponsor_name,sponsor_url=v.sponsor_url,correction_note=v.correction_note,corrected_at=v.corrected_at,
        published_at=v.published_at,agency_name=v.agency_name,agency_account_url=v.agency_account_url,
        agency_statement_url=v.agency_statement_url,agency_narrative=v.agency_narrative,trust_source_excerpt=v.trust_source_excerpt,
        ai_country_code=case when loc is not distinct from a.event_country then a.ai_country_code end,
        ai_region=case when loc is not distinct from a.event_country then a.ai_region end,
        ai_location_name=case when loc is not distinct from a.event_country then a.ai_location_name end,
        ai_latitude=case when loc is not distinct from a.event_country then a.ai_latitude end,
        ai_longitude=case when loc is not distinct from a.event_country then a.ai_longitude end,
        topics=case when v.category is not distinct from a.category then a.topics when v.category='uncategorized' then '{}'::text[] else array[v.category] end,
        classification_reason='editorial_metadata',
        ai_classification_status=case when a.ai_classification_status in ('pending','processing','failed','needs_review') then 'skipped' else a.ai_classification_status end,
        classification_claimed_at=null,classification_retry_after=null
      where id=p_id;
    end if;
  elsif p_action = 'trust' then
    note := nullif(btrim(p_values->>'note'),'');
    if note is null or length(note)>2000
      or coalesce(p_values->>'status','') not in ('confirmed','unconfirmed','disputed')
      or coalesce(p_values->>'translation_status','pending') not in ('pending','reviewed','not_required')
      or (p_values->>'translation_status'='reviewed' and nullif(btrim(p_values->>'translation_note'),'') is null)
      or length(p_values->>'translation_note')>2000 then
      raise exception 'A human review note is required' using errcode = '22023';
    end if;
    perform public.review_article_trust(p_id,p_values->>'status',note,p_values->>'translation_status',p_values->>'translation_note');
  elsif p_action = 'edition' then
    if coalesce(p_values->>'lang','') not in ('ar','en') or p_values->>'lang'=left(coalesce(a.source_language,a.lang),2)
      or nullif(btrim(p_values->>'title'),'') is null or length(p_values->>'title')>300
      or nullif(btrim(p_values->>'summary'),'') is null or length(p_values->>'summary')>1000000 then
      raise exception 'Invalid editorial edition' using errcode = '22023';
    end if;
    select to_jsonb(tr),tr.xmin::text into snapshot,edition_version from public.article_translations tr
      where article_id=p_id and lang=p_values->>'lang' for update;
    edition:=jsonb_populate_record(null::public.article_translations,snapshot);
    if found and edition.translation_source is distinct from 'editorial' then
      raise exception 'Existing machine translation requires the review queue' using errcode = '22023';
    end if;
    if edition.id is distinct from (p_values->>'id')::uuid or edition_version is distinct from p_values->>'edition_version' then
      raise exception 'Edition changed since it was opened' using errcode = '40001';
    end if;
    if edition.id is null then
      insert into public.article_translations(article_id,lang,title,summary,translation_status,translation_source)
      values(p_id,p_values->>'lang',btrim(p_values->>'title'),p_values->>'summary','review','editorial') returning id into target;
    else
      target:=edition.id;
      if edition.title is distinct from btrim(p_values->>'title') or edition.summary is distinct from p_values->>'summary' then
        update public.article_translations set title=btrim(p_values->>'title'),summary=p_values->>'summary',translation_status='review'
        where id=target;
      end if;
    end if;
    if p_values->>'publish'='true' then
      note:=nullif(btrim(p_values->>'note'),'');
      if a.editorial_status<>'published' or note is null or length(note)>2000 then
        raise exception 'Publish the original first and record a human review note' using errcode = '22023';
      end if;
      perform public.review_article_translation(target,'published',note);
    end if;
  elsif p_action in ('evidence','claim') then
    item_id:=(p_values->>'id')::uuid;
    if p_action='evidence' then
      evidence:=jsonb_populate_record(null::public.article_evidence,p_values);
      if evidence.publisher is null or length(btrim(evidence.publisher)) not between 2 and 200
        or evidence.evidence_url is null or length(evidence.evidence_url)>2048 or not private.trust_safe_url(evidence.evidence_url)
        or evidence.evidence_url ~ '[[:cntrl:]]' or strpos(evidence.evidence_url,chr(92))>0
        or length(evidence.notes)>2000 or length(evidence.provenance_group)>160 or length(evidence.independence_note)>2000 then
        raise exception 'Invalid evidence' using errcode='22023';
      end if;
      if item_id is null then
        insert into public.article_evidence(article_id,publisher,evidence_url,evidence_type,independent_source,notes,provenance_group,independence_note)
        values(p_id,evidence.publisher,evidence.evidence_url,evidence.evidence_type,coalesce(evidence.independent_source,false),
          evidence.notes,evidence.provenance_group,evidence.independence_note);
      else
        update public.article_evidence set publisher=evidence.publisher,evidence_url=evidence.evidence_url,evidence_type=evidence.evidence_type,
          independent_source=coalesce(evidence.independent_source,false),notes=evidence.notes,provenance_group=evidence.provenance_group,
          independence_note=evidence.independence_note where id=item_id and article_id=p_id;
        if not found then raise exception 'Evidence not found' using errcode='P0002'; end if;
      end if;
    else
      claim:=jsonb_populate_record(null::public.article_claims,p_values);
      if claim.claim_text is null or length(btrim(claim.claim_text)) not between 3 and 2000
        or length(claim.review_note)>2000 or cardinality(claim.supporting_evidence_ids)>100 then
        raise exception 'Invalid claim' using errcode='22023';
      end if;
      if item_id is null then
        insert into public.article_claims(article_id,claim_text,status,supporting_evidence_ids,review_note)
        values(p_id,claim.claim_text,claim.status,coalesce(claim.supporting_evidence_ids,'{}'::uuid[]),claim.review_note);
      else
        update public.article_claims set claim_text=claim.claim_text,status=claim.status,
          supporting_evidence_ids=coalesce(claim.supporting_evidence_ids,'{}'::uuid[]),review_note=claim.review_note
        where id=item_id and article_id=p_id;
        if not found then raise exception 'Claim not found' using errcode='P0002'; end if;
      end if;
    end if;
  elsif p_action <> 'load' then
    raise exception 'Unsupported editor operation' using errcode = '22023';
  end if;

  if p_action <> 'load' then
    select to_jsonb(x),x.xmin::text into snapshot,version from public.articles x where id=p_id;
    a:=jsonb_populate_record(null::public.articles,snapshot);
  end if;
  return (select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(a))
          where key=any(fields||array['id','editorial_trust_status','trust_needs_review','human_translation_status']))
    || jsonb_build_object('version',version,'source_url',case when private.trust_safe_url(a.url) then a.url else a.source_url end);
end;
$$;

revoke all on function public.site_editor(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.site_editor(text,uuid,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
