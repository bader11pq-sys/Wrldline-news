\set ON_ERROR_STOP on
create function public.test_assert(ok boolean,label text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception 'FAIL: %',label; end if; end $$;
select test_assert(not has_table_privilege('anon','newsletter_subscribers','INSERT'),'legacy newsletter insert revoked');
select test_assert(not has_table_privilege('anon','newsletter_optins','SELECT'),'newsletter tokens private');
select test_assert(not has_column_privilege('authenticated','push_subscriptions','endpoint','SELECT'),'push endpoints private');
select test_assert(has_column_privilege('authenticated','push_subscriptions','id','SELECT'),'own push metadata readable');
select test_assert(not has_function_privilege('anon','notification_claim(text[],integer)','EXECUTE'),'claim RPC private');
select test_assert(not has_function_privilege('authenticated','notification_confirm(text)','EXECUTE'),'consent RPC private');
select test_assert(not has_table_privilege('anon','articles','SELECT'),'article access unchanged');
select test_assert(notification_rate_limit('test:hash',2,3600),'rate first');
select test_assert(notification_rate_limit('test:hash',2,3600),'rate second');
select test_assert(not notification_rate_limit('test:hash',2,3600),'rate limited');
insert into auth.users values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into user_preferences(user_id,notify_categories,notify_countries,browser_notifications,notify_breaking) values
 ('10000000-0000-4000-8000-000000000001',array['politics'],array['السعودية'],true,true),
 ('10000000-0000-4000-8000-000000000002',array['politics'],'{}',true,false);
insert into push_subscriptions(id,user_id,endpoint,endpoint_hash,p256dh,auth,created_at) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','https://fcm.googleapis.com/mock/1','hash1','mock','mock',now()-interval '1 hour'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','https://fcm.googleapis.com/mock/2','hash2','mock','mock',now()-interval '1 hour');
insert into articles(id,title,editorial_status,published_at,received_at) values('30000000-0000-4000-8000-000000000001','Disabled','published',now(),now());
select test_assert((select count(*)=0 from notification_events),'disabled by default');
update notification_runtime set push_enabled=true,email_enabled=true,enabled_at=now()-interval '2 days' where id=1;
insert into articles(id,title,editorial_status,published_at,received_at,category,country,is_breaking) values
 ('30000000-0000-4000-8000-000000000002','Historical','published',now()-interval '7 days',now(),'politics','السعودية',true),
 ('30000000-0000-4000-8000-000000000003','Breaking','published',now(),now(),'politics','السعودية',true),
 ('30000000-0000-4000-8000-000000000004','Normal','review',now(),now(),'politics','السعودية',false);
select test_assert((select count(*)=1 from notification_events),'only recent published capture');
update articles set editorial_status='published' where id='30000000-0000-4000-8000-000000000004';
update articles set title='Correction' where id='30000000-0000-4000-8000-000000000003';
select test_assert((select count(*)=2 from notification_events),'new publication captured; correction does not resend');
select notification_plan_push(1) from generate_series(1,7);
select test_assert((select count(*)=3 from notification_deliveries where kind='push'),'break/topic/country filters and paginated fanout');
select notification_plan_push(100);
select test_assert((select count(*)=3 from notification_deliveries where kind='push'),'push planning idempotent');
set role authenticated;
set test.user_id='10000000-0000-4000-8000-000000000001';
select public.test_assert((select count(*)=1 from push_subscriptions),'RLS owner-only metadata');
reset role;
select count(*) from notification_request_optin('40000000-0000-4000-8000-000000000001','NEW@example.invalid','ar','daily',array['politics'],array['السعودية'],'50000000-0000-4000-8000-000000000001','confirmhash','unsubhash');
select test_assert((select status='pending' from newsletter_optins where email='new@example.invalid'),'new optin pending');
select test_assert((select count(*)=0 from newsletter_optins where status='confirmed'),'old active interest never promoted');
select test_assert(notification_confirm('confirmhash'),'confirmation succeeds');
select test_assert(not notification_confirm('confirmhash'),'confirmation single use');
select test_assert((select confirmation_hash is null and confirmed_at is not null from newsletter_optins where email='new@example.invalid'),'hash cleared on consent');
update newsletter_optins set confirmed_at=now()-interval '1 hour';
select notification_plan_digest('daily',now()-interval '1 day',date_trunc('minute',now()),1);
select notification_plan_digest('weekly',now()-interval '1 day',now(),1);
-- Exact duration requirement intentionally rejects malformed period above.
select notification_plan_digest('daily',date_trunc('minute',now())-interval '1 day',date_trunc('minute',now()),1);
select notification_plan_digest('daily',date_trunc('minute',now())-interval '1 day',date_trunc('minute',now()),1);
select test_assert((select count(*)=1 from notification_deliveries where kind='digest'),'digest period unique');
select test_assert((select count(*)=0 from notification_digest_articles('40000000-0000-4000-8000-000000000001',now()-interval '1 day',now()-interval '5 minutes',20)),'digest excludes stories before consent or period');
create temporary table first_claim as select * from notification_claim(array['push','digest'],2);
create temporary table second_claim as select * from notification_claim(array['push','digest'],2);
select test_assert((select count(*)=0 from first_claim a join second_claim b using(id)),'atomic claim prevents duplicate workers');
select test_assert((select notification_finish(id,lease_token,'sent',null,'mock') from first_claim limit 1),'lease finalization');
select test_assert(not (select notification_finish(id,lease_token,'sent',null,'mock') from first_claim limit 1),'same lease cannot finish twice');
update notification_deliveries set status='sending',leased_at=now()-interval '6 minutes',created_at=now()-interval '1 hour',attempts=1 where kind='push';
select count(*) from notification_claim(array['push'],20);
select test_assert((select count(*)=0 from notification_deliveries where kind='push' and status='sending'),'ambiguous push leases never resend');
select test_assert(notification_unsubscribe('unsubhash'),'unsubscribe succeeds');
select test_assert(notification_unsubscribe('unsubhash'),'unsubscribe repeat safe');
select test_assert((select status='unsubscribed' from newsletter_optins where email='new@example.invalid'),'consent disabled');
select test_assert((select count(*)=1 from newsletter_subscribers where status='active'),'legacy row untouched');
select 'Notifications isolated SQL fixture: PASS' as result;

-- Additional strictly local regression boundaries.
insert into articles(id,title,editorial_status,published_at,received_at) values('30000000-0000-4000-8000-000000000009','Unknown date','published',null,now());
select test_assert(not exists(select 1 from notification_events where article_id='30000000-0000-4000-8000-000000000009'),'missing dates cannot push');
insert into newsletter_optins(id,email,cadence,token_nonce,confirmation_hash,unsubscribe_hash,confirmation_expires_at)
values('40000000-0000-4000-8000-000000000009','expired@example.invalid','weekly','50000000-0000-4000-8000-000000000009','expiredhash','expiredunsubhash',now()-interval '1 minute');
select test_assert(not notification_confirm('expiredhash'),'expired confirmation cannot authorize mail');
insert into notification_deliveries(id,dedupe_key,kind,newsletter_id,token_nonce,status,attempts,created_at,leased_at)
values('60000000-0000-4000-8000-000000000009','mock-confirmation-retry','confirmation','40000000-0000-4000-8000-000000000009','50000000-0000-4000-8000-000000000009','sending',1,now()-interval '1 hour',now()-interval '6 minutes');
create temporary table email_reclaimed as select id,attempts from notification_claim(array['confirmation'],20);
select test_assert((select attempts=2 from email_reclaimed where id='60000000-0000-4000-8000-000000000009'),'email lease safely recovers inside idempotency window');
update notification_deliveries set status='sending',created_at=now()-interval '24 hours',leased_at=now()-interval '6 minutes' where id='60000000-0000-4000-8000-000000000009';
select count(*) from notification_claim(array['confirmation'],20);
select test_assert((select status='uncertain' from notification_deliveries where id='60000000-0000-4000-8000-000000000009'),'email cannot retry beyond provider idempotency window');
select 'Notifications SQL boundary cases: PASS' as result;
