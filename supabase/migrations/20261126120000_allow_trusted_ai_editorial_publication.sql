-- Allow trusted server-side AI newsroom publications to publish without a human approval click.
-- Human review metadata remains reserved for actual authenticated human reviewers.
-- The existing editorial publication RLS and public published-only read policy are unchanged.

create or replace function private.editorial_publication_human_gate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_is_ai boolean;
  v_is_service boolean;
  v_distinct_publishers integer;
  v_source_count integer;
begin
  v_is_ai := coalesce(lower(new.generated_by), '') ~
    '^(groq|nvidia|gemini|openrouter|bazaarlink|gonka|deepl|ai)([^a-z].*)?$';
  v_is_service := coalesce(auth.jwt() ->> 'role', '') = 'service_role';

  if new.status = 'published'
     and v_is_ai
     and (tg_op = 'INSERT' or old.status is distinct from 'published' or new.content is distinct from old.content)
  then
    if v_is_service then
      if jsonb_typeof(new.sources) is distinct from 'array' then
        raise exception 'AI publications require a structured source list'
          using errcode = '22023';
      end if;

      select count(*), count(distinct lower(regexp_replace(
        (regexp_match(coalesce(source_item ->> 'url', ''), '^https?://([^/:?#]+)', 'i'))[1],
        '^www[.]',
        '',
        'i'
      )))
      into v_source_count, v_distinct_publishers
      from jsonb_array_elements(new.sources) as source_item
      where coalesce(source_item ->> 'url', '') ~* '^https?://[^[:space:]]+$'
        and nullif(btrim(source_item ->> 'title'), '') is not null
        and nullif(btrim(source_item ->> 'publisher'), '') is not null;

      if v_source_count < 2 or v_distinct_publishers < 2 then
        raise exception 'AI publications require at least two distinct, attributed source domains'
          using errcode = '22023';
      end if;

      -- Never label an AI publication as human-reviewed.
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_note := null;
      new.review_decision := null;
    elsif not private.trust_is_editor()
       or nullif(btrim(coalesce(new.review_note, '')), '') is null
       or new.reviewed_by is distinct from auth.uid() then
      raise exception 'AI publication must come from the trusted server publisher or receive human editorial review'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.editorial_publication_human_gate() from public, anon, authenticated;

-- The office coordinator may send evidence-passed work to the trusted publication
-- service. No AI employee may fabricate human review metadata or override failed checks.
update public.wrldline_office_employees
set system_prompt = $prompt$
You are Omar, Worldline News Office Manager and workflow coordinator. Convert the editor-in-chief's request into one clear, idempotent plan. Reuse an active task with the same objective instead of creating duplicates. Assign Khalid to research; Layla to independent fact-checking; Sara to Arabic copy-editing only after Layla's evidence gate passes; Adam to SEO/social packaging from reviewed copy; Faisal to clearly labelled editorial illustration concepts; Noura to staging-only technical work; and Mariam to analytics only when actual aggregates are supplied. When Layla returns PASS and the required source evidence is present, send the finished article to the trusted server-side publication workflow without waiting for a separate human editor approval. A PARTIAL or BLOCKED fact-check must never be published as confirmed; preserve uncertainty and attribution. Never invent sources, source counts, completion, dates, or release receipts. You do not impersonate a human editor, write human review notes, or change trust/translation review metadata. Never start scheduled or background news collection. Respond in concise, clear Arabic and ask one targeted question only when essential.
$prompt$
where id = 'omar';
