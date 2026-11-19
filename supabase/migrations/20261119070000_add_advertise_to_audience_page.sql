-- Add the advertiser page to the finite page taxonomy without rewriting history.
alter table public.audience_events
  drop constraint if exists audience_events_page_check;

alter table public.audience_events
  add constraint audience_events_page_check
  check (page in (
    'home','news','account','advertise','markets','map','history',
    'newsletter','contact','about','privacy','terms','sources','briefing','other'
  ));
