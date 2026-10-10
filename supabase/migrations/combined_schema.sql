-- FixitFelix Complete Schema Migration
-- Run this in the Supabase SQL Editor or via the migration script.
-- This combines all 6 migration files into one execution.

-- 00001_create_tickets.sql
create extension if not exists "pgcrypto";

create table if not exists public.tickets (
  id                          text        primary key,
  source                      text        not null,
  summary                     text        not null,
  description                 text        not null default '',
  category                    text        not null,
  priority                    text        not null default 'medium',
  location                    text        not null default '',
  status                      text        not null default 'new',
  assignment_department_id    text,
  assignment_department_name   text,
  assignment_technician_id   text,
  assignment_technician_name  text,
  assignment_response         text,
  declined_technician_ids    text[]    not null default '{}',
  scheduled_at                timestamptz,
  notification_channel        text,
  notification_recipient      text,
  notification_status         text,
  notification_updated_at    timestamptz,
  notification_provider_id   text,
  notification_error          text,
  technician_action_token     text,
  student_tracking_token      text     not null,
  cv_state                    text,
  cv_fixed                    boolean,
  cv_confidence               double precision,
  cv_reason                   text,
  cv_model                    text,
  cv_photo_url                text,
  cv_checked_at              timestamptz,
  sensor_id                   text,
  verification_type           text,
  verification_state          text,
  verification_last_value     double precision,
  verification_unit           text,
  student_email               text,
  rationale                   text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create index if not exists idx_tickets_status        on public.tickets (status);
create index if not exists idx_tickets_sensor_id     on public.tickets (sensor_id) where sensor_id is not null;
create index if not exists idx_tickets_student_token  on public.tickets (student_tracking_token);
create index if not exists idx_tickets_tech_token     on public.tickets (technician_action_token) where technician_action_token is not null;
create index if not exists idx_tickets_created_at     on public.tickets (created_at desc);

alter table public.tickets enable row level security;

-- 00002_create_timeline_events.sql
create table if not exists public.timeline_events (
  id           text        primary key,
  ticket_id    text        not null references public.tickets(id) on delete cascade,
  type         text        not null default 'update',
  message      text        not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_timeline_events_ticket_id on public.timeline_events (ticket_id, created_at desc);

alter table public.timeline_events enable row level security;

-- 00003_create_sensor_states.sql
create table if not exists public.sensor_states (
  sensor_id      text        primary key,
  low_count      integer     not null default 0,
  recovery_count integer     not null default 0,
  value          double precision,
  location       text        not null default '',
  observed_at    timestamptz,
  received_at    timestamptz,
  updated_at     timestamptz not null default now()
);

create index if not exists idx_sensor_states_location on public.sensor_states (location);

alter table public.sensor_states enable row level security;

-- 00004_create_sensor_events.sql
create table if not exists public.sensor_events (
  id            bigint generated always as identity primary key,
  sensor_id     text        not null,
  sensor_type   text        not null default 'ldr',
  metric        text        not null,
  value         double precision not null,
  location      text,
  observed_at   timestamptz,
  received_at   timestamptz not null default now()
);

create index if not exists idx_sensor_events_sensor_id  on public.sensor_events (sensor_id, received_at desc);
create index if not exists idx_sensor_events_received   on public.sensor_events (received_at desc);

alter table public.sensor_events enable row level security;

-- 00005_create_evidence.sql
create table if not exists public.evidence (
  id           text        primary key,
  ticket_id    text        not null references public.tickets(id) on delete cascade,
  photo_url    text        not null,
  state        text        not null,
  fixed        boolean     not null,
  confidence   double precision not null,
  reason       text,
  model        text,
  checked_at   timestamptz not null default now()
);

create index if not exists idx_evidence_ticket_id on public.evidence (ticket_id, checked_at desc);

alter table public.evidence enable row level security;

-- 00006_updated_at_trigger.sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger if not exists trg_tickets_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

create trigger if not exists trg_sensor_states_updated_at
  before update on public.sensor_states
  for each row execute function public.set_updated_at();
