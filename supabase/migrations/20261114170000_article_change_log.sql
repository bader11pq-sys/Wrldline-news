-- Persistent editorial change log for the visible story history.
create table if not exists public.article_change_log (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  changed_at timestamptz not null default now(),
  change_type text not null check (change_type in ('created','updated','verification','correction','retraction')),
  changed_fields jsonb not null default '{}'::jsonb,
  before_snapshot jsonb,
  after_snapshot jsonb
);
create index if not exists article_change_log_article_idx on public.article_change_log(article_id, changed_at desc);
alter table public.article_change_log enable row level security;
grant select on public.article_change_log to anon, authenticated;
drop policy if exists "Public can read published article changes" on public.article_change_log;
create policy "Public can read published article changes" on public.article_change_log for select to anon, authenticated using (exists (select 1 from public.articles a where a.id=article_id and a.editorial_status='published'));
create or replace function public.log_article_change() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare oldj jsonb:=to_jsonb(old); newj jsonb:=to_jsonb(new); fields jsonb:='{}'::jsonb; kind text:='updated'; k text; keys text[]:=array['title','summary','ai_summary','verification','verification_source_count','verification_independent_count','verification_official_count','correction_note','corrected_at','editorial_status'];
begin
  if tg_op='INSERT' then insert into public.article_change_log(article_id,change_type,after_snapshot) values(new.id,'created',jsonb_build_object('title',new.title,'summary',new.summary,'verification',new.verification)); return new; end if;
  foreach k in array keys loop if oldj->k is distinct from newj->k then fields:=fields || jsonb_build_object(k,jsonb_build_object('before',oldj->k,'after',newj->k)); end if; end loop;
  if fields='{}'::jsonb then return new; end if;
  if fields ? 'correction_note' or fields ? 'corrected_at' then kind:='correction'; elsif fields ? 'verification' or fields ? 'verification_source_count' or fields ? 'verification_independent_count' or fields ? 'verification_official_count' then kind:='verification'; elsif fields ? 'editorial_status' and (new.editorial_status='retracted' or new.editorial_status='removed') then kind:='retraction'; end if;
  insert into public.article_change_log(article_id,change_type,changed_fields,before_snapshot,after_snapshot) values(new.id,kind,fields,oldj,newj); return new;
end; $$;
revoke all on function public.log_article_change() from public,anon,authenticated;
drop trigger if exists article_change_log_trigger on public.articles;
create trigger article_change_log_trigger after insert or update on public.articles for each row execute function public.log_article_change();
