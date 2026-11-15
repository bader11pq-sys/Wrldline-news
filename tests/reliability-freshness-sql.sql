do $$
begin
 if has_function_privilege('anon','public.get_source_freshness_snapshot(integer,integer)','EXECUTE') then raise exception 'Anon can read metrics'; end if;
 if has_table_privilege('authenticated','public.source_freshness_state','SELECT') then raise exception 'Authenticated table leak'; end if;
 if (select received_count from public.source_freshness_state where source_key='rss:https://example.test/feed')<>2 then raise exception 'Bootstrap counts wrong'; end if;
end $$;
-- Repeated successful polling of unchanged stories is not a new receipt.
update public.feeds set last_fetched=now(),last_error=null where url='https://example.test/feed';
update public.feeds set last_fetched=now(),last_error=null where url='https://example.test/feed';
do $$ begin
 if (select last_poll_had_new_news from public.source_freshness_state where source_key='rss:https://example.test/feed') is distinct from false then raise exception 'No-new-news not captured'; end if;
end $$;
update public.feeds set last_fetched=null,last_error='Fixture failure' where url='https://example.test/feed';
do $$ begin
 if (select last_result from public.source_freshness_state where source_key='rss:https://example.test/feed')<>'error' then raise exception 'Failure not captured'; end if;
 if (select last_success_at from public.source_freshness_state where source_key='rss:https://example.test/feed') is null then raise exception 'Last success lost'; end if;
end $$;
insert into public.newsdata_sources(source_id,source_name,source_url) values('fixture-provider','Fixture','https://example.test');
insert into public.articles(id,title,editorial_status,source_url,published_at,newsdata_only)
values('00000000-0000-0000-0000-000000000004','Provider fixture','review','https://example.test',now(),true);
do $$ begin
 if (select received_count from public.source_freshness_state where source_key='rss:https://example.test/feed')<>2 then raise exception 'Cross-feed attribution'; end if;
 if (select last_attempt_at from public.source_freshness_state where source_key='newsdata:fixture-provider') is not null then raise exception 'Discovery inferred polling'; end if;
end $$;
begin;
set local role service_role;
select count(*) from public.get_source_freshness_snapshot(500,0);
rollback;
