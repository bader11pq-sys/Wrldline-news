-- WRLDLINE historical research catalog
-- Public schema access is granted explicitly; RLS policies below control visible rows.
-- Normalized event, civilization, geography, source, and comparative-analysis model.
-- Seed rows are maintained in supabase/seed/history_catalog.sql.

create table if not exists public.history_regions (
 id text primary key, name_ar text not null, name_en text not null,
 parent_id text references public.history_regions(id) on update cascade on delete set null,
 region_type text not null default 'region', geom_note text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.history_civilizations (
 id text primary key, name_ar text not null, name_en text not null,
 region_id text references public.history_regions(id) on update cascade on delete set null,
 civilization_type text not null default 'civilization',
 start_year integer, end_year integer, date_precision text not null default 'approximate',
 summary_ar text, summary_en text, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (start_year is null or end_year is null or start_year <= end_year)
);
create table if not exists public.history_places (
 id text primary key, name_ar text not null, name_en text,
 region_id text references public.history_regions(id) on update cascade on delete set null,
 latitude double precision, longitude double precision,
 place_type text not null default 'site', modern_country text,
 coordinate_precision text not null default 'approximate',
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 check (latitude is null or latitude between -90 and 90),
 check (longitude is null or longitude between -180 and 180)
);
create table if not exists public.history_events (
 id text primary key, title_ar text not null, title_en text,
 summary_ar text not null, summary_en text,
 start_year integer not null, end_year integer,
 date_precision text not null default 'approximate', date_note text,
 region_id text references public.history_regions(id) on update cascade on delete set null,
 place_id text references public.history_places(id) on update cascade on delete set null,
 latitude double precision, longitude double precision,
 event_type text not null default 'historical_event',
 significance_ar text, evidence_note_ar text,
 confidence text not null default 'moderate' check (confidence in ('high','moderate','contested','low')),
 status text not null default 'published' check (status in ('draft','review','published','archived')),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (end_year is null or start_year <= end_year),
 check (latitude is null or latitude between -90 and 90),
 check (longitude is null or longitude between -180 and 180)
);
create table if not exists public.history_civilization_periods (
 id text primary key,
 civilization_id text not null references public.history_civilizations(id) on update cascade on delete cascade,
 title_ar text not null, title_en text, start_year integer, end_year integer,
 date_precision text not null default 'approximate', summary_ar text,
 metadata jsonb not null default '{}'::jsonb, sort_order integer not null default 0,
 check (start_year is null or end_year is null or start_year <= end_year)
);
create table if not exists public.history_sources (
 id text primary key, institution text not null, title text not null,
 url text not null check (url ~ '^https?://'),
 source_type text not null default 'institutional_reference',
 language text, publication_year integer, accessed_at date not null default current_date,
 bibliographic_note text,
 source_quality text not null default 'institutional'
 check (source_quality in ('primary','academic','institutional','reference','community')),
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.history_event_sources (
 event_id text not null references public.history_events(id) on update cascade on delete cascade,
 source_id text not null references public.history_sources(id) on update cascade on delete restrict,
 citation_locator text,
 evidence_role text not null default 'context'
 check (evidence_role in ('primary_evidence','archaeological_record','scholarly_analysis','institutional_context','counter_evidence')),
 supports_claim text, confidence_note text, is_primary boolean not null default false,
 primary key(event_id,source_id)
);
create table if not exists public.history_comparisons (
 id text primary key, title_ar text not null, title_en text, period_label text,
 civilization_a_id text not null references public.history_civilizations(id) on update cascade on delete restrict,
 civilization_b_id text not null references public.history_civilizations(id) on update cascade on delete restrict,
 context_ar text not null, limitations_ar text not null,
 method_version text not null default '1.0',
 status text not null default 'published' check (status in ('draft','review','published','archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.history_comparison_dimensions (
 id text primary key, label_ar text not null, label_en text,
 description_ar text, sort_order integer not null unique
);
create table if not exists public.history_comparison_observations (
 id text primary key,
 comparison_id text not null references public.history_comparisons(id) on update cascade on delete cascade,
 dimension_id text not null references public.history_comparison_dimensions(id) on update cascade on delete restrict,
 civilization_a_observation text not null, civilization_b_observation text not null,
 comparative_reading text not null, evidence_note text,
 source_ids text[] not null default '{}',
 unique(comparison_id,dimension_id)
);
create table if not exists public.history_comparison_sources (
 comparison_id text not null references public.history_comparisons(id) on update cascade on delete cascade,
 source_id text not null references public.history_sources(id) on update cascade on delete restrict,
 citation_note text, primary key(comparison_id,source_id)
);
create table if not exists public.history_event_places (
 event_id text not null references public.history_events(id) on update cascade on delete cascade,
 place_id text not null references public.history_places(id) on update cascade on delete restrict,
 place_role text not null default 'associated'
 check (place_role in ('origin','destination','route_stop','site','associated')),
 sort_order integer not null default 0, note_ar text,
 primary key(event_id,place_id)
);

create index if not exists history_events_timeline_idx on public.history_events(start_year,end_year);
create index if not exists history_events_region_year_idx on public.history_events(region_id,start_year);
create index if not exists history_events_place_idx on public.history_events(place_id);
create index if not exists history_civilizations_region_idx on public.history_civilizations(region_id);
create index if not exists history_civilization_periods_year_idx on public.history_civilization_periods(start_year,end_year);
create index if not exists history_civilization_periods_civ_idx on public.history_civilization_periods(civilization_id);
create index if not exists history_event_sources_source_idx on public.history_event_sources(source_id);
create index if not exists history_comparison_observations_dimension_idx on public.history_comparison_observations(dimension_id);
create index if not exists history_comparison_sources_source_idx on public.history_comparison_sources(source_id);
create index if not exists history_comparisons_civ_a_idx on public.history_comparisons(civilization_a_id);
create index if not exists history_comparisons_civ_b_idx on public.history_comparisons(civilization_b_id);
create index if not exists history_regions_parent_idx on public.history_regions(parent_id);
create index if not exists history_places_region_idx on public.history_places(region_id);
create index if not exists history_event_places_place_idx on public.history_event_places(place_id);

grant usage on schema public to anon,authenticated;

do $
declare t text;
begin
 foreach t in array array[
  'history_regions','history_civilizations','history_places','history_events',
  'history_civilization_periods','history_sources','history_event_sources',
  'history_comparisons','history_comparison_dimensions','history_comparison_observations',
  'history_comparison_sources','history_event_places'
 ] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from anon, authenticated',t);
  execute format('grant select on table public.%I to anon, authenticated',t);
  execute format('grant all on table public.%I to service_role',t);
 end loop;
end $$;

drop policy if exists history_regions_public_read on public.history_regions;
create policy history_regions_public_read on public.history_regions for select to anon,authenticated using(true);
drop policy if exists history_civilizations_public_read on public.history_civilizations;
create policy history_civilizations_public_read on public.history_civilizations for select to anon,authenticated using(true);
drop policy if exists history_places_public_read on public.history_places;
create policy history_places_public_read on public.history_places for select to anon,authenticated using(true);
drop policy if exists history_events_public_read on public.history_events;
create policy history_events_public_read on public.history_events for select to anon,authenticated using(status='published');
drop policy if exists history_civilization_periods_public_read on public.history_civilization_periods;
create policy history_civilization_periods_public_read on public.history_civilization_periods for select to anon,authenticated using(true);
drop policy if exists history_sources_public_read on public.history_sources;
create policy history_sources_public_read on public.history_sources for select to anon,authenticated using(true);
drop policy if exists history_event_sources_public_read on public.history_event_sources;
create policy history_event_sources_public_read on public.history_event_sources for select to anon,authenticated using(exists(select 1 from public.history_events e where e.id=event_id and e.status='published'));
drop policy if exists history_comparisons_public_read on public.history_comparisons;
create policy history_comparisons_public_read on public.history_comparisons for select to anon,authenticated using(status='published');
drop policy if exists history_comparison_dimensions_public_read on public.history_comparison_dimensions;
create policy history_comparison_dimensions_public_read on public.history_comparison_dimensions for select to anon,authenticated using(true);
drop policy if exists history_comparison_observations_public_read on public.history_comparison_observations;
create policy history_comparison_observations_public_read on public.history_comparison_observations for select to anon,authenticated using(exists(select 1 from public.history_comparisons c where c.id=comparison_id and c.status='published'));
drop policy if exists history_comparison_sources_public_read on public.history_comparison_sources;
create policy history_comparison_sources_public_read on public.history_comparison_sources for select to anon,authenticated using(exists(select 1 from public.history_comparisons c where c.id=comparison_id and c.status='published'));
drop policy if exists history_event_places_public_read on public.history_event_places;
create policy history_event_places_public_read on public.history_event_places for select to anon,authenticated using(exists(select 1 from public.history_events e where e.id=event_id and e.status='published'));
