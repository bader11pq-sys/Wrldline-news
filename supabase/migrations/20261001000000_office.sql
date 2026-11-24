begin;
create table public.users(id uuid primary key references auth.users(id), role text not null check(role='ceo'), name text not null);
create table public.employees(id text primary key, name text not null, role text not null, avatar_url text, system_prompt text not null, status text not null default 'Idle');
create table public.office_state(id uuid primary key references public.users(id), revision integer not null default 0, document jsonb not null default '{}', lease uuid, lease_until timestamptz);
create table public.tasks(id uuid primary key, user_id uuid not null references public.users, title text not null, owner_id text not null references public.employees, status text not null, priority text not null, created_at timestamptz not null, due_at timestamptz not null, inputs_json jsonb not null, outputs_json jsonb not null, approval_status text not null, ceo_feedback text, sources_json jsonb);
create table public.articles(id uuid primary key, user_id uuid not null references public.users, title text not null, summary text not null, body jsonb not null, status text not null check(status in ('review','published','rejected')), author_id text not null references public.employees, fact_checker_id text not null references public.employees, sources_json jsonb not null, created_at timestamptz not null, published_at timestamptz, payload jsonb not null);
create table public.conversations(id uuid primary key, employee_id text references public.employees, user_id uuid not null references public.users, channel text not null, message text not null, role text not null, created_at timestamptz not null);
create table public.approvals(id uuid primary key, user_id uuid not null references public.users, article_id uuid references public.articles, task_id uuid references public.tasks, decision text not null check(decision in ('approved','rejected')), feedback text, decided_at timestamptz not null, check (num_nonnulls(article_id,task_id)=1));
create table public.logs(id uuid primary key, user_id uuid not null references public.users, action text not null, actor text not null, details text not null, created_at timestamptz not null);
create table public.article_views(article_id uuid not null references public.articles, viewed_day date not null, viewed_hour integer not null check(viewed_hour between 0 and 23), views bigint not null default 0, primary key(article_id,viewed_day,viewed_hour));
create index articles_published_idx on public.articles(published_at desc) where status='published';
create index tasks_owner_idx on public.tasks(user_id,owner_id,created_at desc);
create index logs_owner_idx on public.logs(user_id,created_at desc);
do $$ declare t text; begin
  foreach t in array array['users','employees','office_state','tasks','articles','conversations','approvals','logs','article_views'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select,insert,update on public.%I to service_role',t);
  end loop;
end $$;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('office-images','office-images',false,8388608,array['image/webp']) on conflict(id) do nothing;

create function public.office_claim(p_user uuid,p_lease uuid) returns jsonb language plpgsql set search_path='' as $$
declare doc jsonb;
begin
  insert into public.office_state(id) values(p_user) on conflict do nothing;
  update public.office_state set lease=p_lease,lease_until=now()+interval '4 minutes'
  where id=p_user and (lease_until is null or lease_until < now())
  returning document into doc;
  return doc;
end $$;
create function public.office_release(p_user uuid,p_lease uuid) returns void language sql set search_path='' as $$
  update public.office_state set lease=null,lease_until=null where id=p_user and lease=p_lease;
$$;
create function public.office_record_view(p_article uuid) returns void language sql set search_path='' as $$
  insert into public.article_views(article_id,viewed_day,viewed_hour,views)
  select id,(now() at time zone 'Asia/Riyadh')::date,extract(hour from now() at time zone 'Asia/Riyadh')::int,1
  from public.articles where id=p_article and status='published'
  on conflict(article_id,viewed_day,viewed_hour) do update set views=public.article_views.views+1;
$$;
create function public.office_views(p_user uuid) returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('articleId',x.article_id,'hour',x.viewed_hour,'count',x.views)), '[]'::jsonb)
  from (select v.article_id,v.viewed_hour,sum(v.views) views from public.article_views v
  join public.articles a on a.id=v.article_id
  where a.user_id=p_user and v.viewed_day>=((now() at time zone 'Asia/Riyadh')::date-29)
  group by v.article_id,v.viewed_hour) x;
$$;
create function public.office_save(p_user uuid,p_lease uuid,p_document jsonb,p_agents jsonb) returns boolean language plpgsql set search_path='' as $$
declare x jsonb; a uuid; t uuid;
begin
  update public.office_state set document=p_document,revision=revision+1,lease=null,lease_until=null
    where id=p_user and lease=p_lease and lease_until > now();
  if not found then return false; end if;
  for x in select * from jsonb_array_elements(p_agents) loop
    insert into public.employees(id,name,role,system_prompt,status) values(x->>'id',x->>'name',x->>'role',x->>'prompt',x->>'status')
    on conflict(id) do update set name=excluded.name,role=excluded.role,system_prompt=excluded.system_prompt,status=excluded.status;
  end loop;
  for x in select * from jsonb_array_elements(p_document->'tasks') loop
    insert into public.tasks values((x->>'id')::uuid,p_user,x->>'title',x->>'owner',x->>'status',x->>'priority',(x->>'createdAt')::timestamptz,(x->>'dueAt')::timestamptz,x->'inputs',jsonb_build_object('text',x->>'output'),x->>'approval',x->>'feedback',x->'sources')
    on conflict(id) do update set status=excluded.status,outputs_json=excluded.outputs_json,approval_status=excluded.approval_status,ceo_feedback=excluded.ceo_feedback,sources_json=excluded.sources_json;
  end loop;
  for x in select * from jsonb_array_elements(p_document->'articles') loop
    if x->>'status'='published' and (x->>'demo' is distinct from 'false' or x#>>'{check,state}' is distinct from 'passed' or
      coalesce(jsonb_array_length(x#>'{brief,claims}'),0)=0 or exists (
        select 1 from jsonb_array_elements(x#>'{brief,claims}') claim where 2 > (
          select least(count(distinct s->>'group'),count(distinct ev->>'quote'))
          from jsonb_array_elements(claim->'evidence') ev
          join jsonb_array_elements(x->'sources') s on s->>'id'=ev->>'sourceId'
          where length(ev->>'quote')>=18 and strpos(s->>'text',ev->>'quote')>0
            and s->>'demo' is distinct from 'true' and s->>'untrusted' is distinct from 'true'
        )
      ) or not exists (
      select 1 from jsonb_array_elements(p_document->'approvals') ad
      where ad->>'targetId'=x->>'id' and ad->>'actor'=p_user::text and ad->>'decision'='approved'
    )) then raise exception 'Publish gate failed'; end if;
    insert into public.articles values((x->>'id')::uuid,p_user,x->>'title',x->>'summary',x->'body',x->>'status',x->>'author',x->>'factChecker',x->'sources',(x->>'createdAt')::timestamptz,(x->>'publishedAt')::timestamptz,x)
    on conflict(id) do update set status=excluded.status,published_at=excluded.published_at,payload=excluded.payload;
  end loop;
  for x in select * from jsonb_array_elements(p_document->'messages') loop
    insert into public.conversations values((x->>'id')::uuid,nullif(x->>'channel','meeting'),p_user,x->>'channel',x->>'text',x->>'author',(x->>'createdAt')::timestamptz) on conflict do nothing;
  end loop;
  for x in select * from jsonb_array_elements(p_document->'approvals') loop
    a=null;t=null;
    select id into a from public.articles where id=(x->>'targetId')::uuid and user_id=p_user;
    if a is null then t=(x->>'targetId')::uuid; end if;
    insert into public.approvals values((x->>'id')::uuid,p_user,a,t,x->>'decision',x->>'feedback',(x->>'createdAt')::timestamptz) on conflict do nothing;
  end loop;
  for x in select * from jsonb_array_elements(p_document->'logs') loop
    insert into public.logs values((x->>'id')::uuid,p_user,x->>'action',x->>'actor',x->>'details',(x->>'createdAt')::timestamptz) on conflict do nothing;
  end loop;
  return true;
end $$;
revoke all on function public.office_claim(uuid,uuid),public.office_release(uuid,uuid),public.office_save(uuid,uuid,jsonb,jsonb),public.office_record_view(uuid),public.office_views(uuid) from public,anon,authenticated;
grant execute on function public.office_claim(uuid,uuid),public.office_release(uuid,uuid),public.office_save(uuid,uuid,jsonb,jsonb),public.office_record_view(uuid),public.office_views(uuid) to service_role;
commit;
