-- WRLDLINE AI enrichment and Telegram-only breaking ticker
alter table public.articles
  add column if not exists ai_event_type text,
  add column if not exists ai_region text,
  add column if not exists ai_country_code text,
  add column if not exists ai_risk_level text not null default 'unknown' check (ai_risk_level in ('unknown','low','guarded','elevated','high','critical')),
  add column if not exists ai_risk_score integer check (ai_risk_score is null or ai_risk_score between 0 and 100),
  add column if not exists ai_confidence numeric(4,3) check (ai_confidence is null or ai_confidence between 0 and 1),
  add column if not exists ai_summary text,
  add column if not exists ai_location_name text,
  add column if not exists ai_latitude double precision check (ai_latitude is null or ai_latitude between -90 and 90),
  add column if not exists ai_longitude double precision check (ai_longitude is null or ai_longitude between -180 and 180),
  add column if not exists ai_classified_at timestamptz,
  add column if not exists ai_classification_status text not null default 'pending' check (ai_classification_status in ('pending','classified','needs_review','failed'));

create index if not exists articles_ai_risk_country_idx on public.articles(ai_country_code,ai_risk_score desc,published_at desc) where editorial_status='published' and ai_country_code is not null;
create index if not exists articles_ai_pending_idx on public.articles(published_at desc) where ai_classification_status in ('pending','failed') and editorial_status='published';

create table if not exists public.telegram_breaking_items (
 article_id uuid primary key references public.articles(id) on delete cascade,
 title text not null,summary text,source_name text,source_url text,article_url text,published_at timestamptz,
 received_at timestamptz not null default now(),is_breaking boolean not null default true
);
create index if not exists telegram_breaking_received_idx on public.telegram_breaking_items(received_at desc);
alter table public.telegram_breaking_items enable row level security;
revoke all on public.telegram_breaking_items from anon,authenticated;
grant select on public.telegram_breaking_items to anon,authenticated;
drop policy if exists "Public read Telegram ticker" on public.telegram_breaking_items;
create policy "Public read Telegram ticker" on public.telegram_breaking_items for select to anon,authenticated using(true);

create or replace function public.wrldline_sync_telegram_ticker()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare is_telegram boolean;
begin
 is_telegram:=lower(coalesce(new.url,'')||' '||coalesce(new.source_url,'')||' '||coalesce(new.source_name,'')) ~ '(t\.me|telegram\.me|telegram)';
 if is_telegram and new.editorial_status='published' then
  insert into public.telegram_breaking_items(article_id,title,summary,source_name,source_url,article_url,published_at,received_at,is_breaking)
  values(new.id,new.title,new.summary,new.source_name,new.source_url,new.url,new.published_at,coalesce(new.received_at,now()),true)
  on conflict(article_id) do update set title=excluded.title,summary=excluded.summary,source_name=excluded.source_name,source_url=excluded.source_url,article_url=excluded.article_url,published_at=excluded.published_at,is_breaking=true;
 else delete from public.telegram_breaking_items where article_id=new.id;
 end if;
 return new;
end $$;
revoke all on function public.wrldline_sync_telegram_ticker() from public,anon,authenticated;
drop trigger if exists wrldline_telegram_ticker_sync on public.articles;
create trigger wrldline_telegram_ticker_sync after insert or update of url,source_url,source_name,title,summary,published_at,received_at,editorial_status on public.articles for each row execute function public.wrldline_sync_telegram_ticker();

insert into public.telegram_breaking_items(article_id,title,summary,source_name,source_url,article_url,published_at,received_at,is_breaking)
select id,title,summary,source_name,source_url,url,published_at,coalesce(received_at,now()),true from public.articles
where editorial_status='published' and lower(coalesce(url,'')||' '||coalesce(source_url,'')||' '||coalesce(source_name,'')) ~ '(t\.me|telegram\.me|telegram)'
on conflict(article_id) do update set title=excluded.title,summary=excluded.summary,source_name=excluded.source_name,source_url=excluded.source_url,article_url=excluded.article_url,published_at=excluded.published_at;

drop policy if exists "Public read published articles" on public.articles;
drop policy if exists "Authenticated read published or editorial articles" on public.articles;
create policy "Public read published non-Telegram articles" on public.articles for select to anon
using(editorial_status='published' and lower(coalesce(url,'')||' '||coalesce(source_url,'')||' '||coalesce(source_name,'')) !~ '(t\.me|telegram\.me|telegram)');
create policy "Authenticated read published non-Telegram or editorial articles" on public.articles for select to authenticated
using((editorial_status='published' and lower(coalesce(url,'')||' '||coalesce(source_url,'')||' '||coalesce(source_name,'')) !~ '(t\.me|telegram\.me|telegram)') or ((select auth.jwt())->'app_metadata'->>'role') in ('editor','admin'));

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='telegram_breaking_items') then alter publication supabase_realtime add table public.telegram_breaking_items; end if;
end $$;
