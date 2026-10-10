-- FixitFelix core schema: tickets table
-- Matches the Ticket interface in lib/types.ts

create extension if not exists "pgcrypto";

create table if not exists public.tickets (
  id                          text        primary key,          -- e.g. "FX-0001"
  source                      text        not null,             -- 'sensor' | 'student_report'
  summary                     text        not null,
  description                 text        not null default '',
  category                    text        not null,             -- 'lighting' | 'air_conditioning' | 'student_portal' | 'other'
  priority                    text        not null default 'medium', -- 'low' | 'medium' | 'high'
  location                    text        not null default '',
  status                      text        not null default 'new', -- 'new' | 'assigned' | 'scheduled' | 'in_progress' | 'verification_pending' | 'follow_up' | 'unassigned' | 'closed'

  -- Assignment (nullable — unassigned tickets have null)
  assignment_department_id    text,
  assignment_department_name   text,
  assignment_technician_id   text,
  assignment_technician_name  text,
  assignment_response         text,  -- 'pending' | 'accepted' | 'declined'

  -- Declined technician history
  declined_technician_ids    text[]    not null default '{}',

  -- Scheduling
  scheduled_at                timestamptz,

  -- Notification
  notification_channel        text,
  notification_recipient      text,
  notification_status         text,
  notification_updated_at    timestamptz,
  notification_provider_id   text,
  notification_error          text,

  -- Tokens (security)
  technician_action_token     text,
  student_tracking_token      text     not null,

  -- AI Photo completion verification
  cv_state                    text,  -- 'passed' | 'failed' | 'unavailable'
  cv_fixed                    boolean,
  cv_confidence               double precision,
  cv_reason                   text,
  cv_model                    text,
  cv_photo_url                text,
  cv_checked_at              timestamptz,

  -- LDR sensor verification
  sensor_id                   text,
  verification_type           text,  -- 'ldr_brightness'
  verification_state          text,  -- 'pending' | 'passed' | 'failed'
  verification_last_value     double precision,
  verification_unit           text,  -- '%'

  -- Student
  student_email               text,

  -- Metadata
  rationale                   text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

-- Indexes for common lookups
create index if not exists idx_tickets_status        on public.tickets (status);
create index if not exists idx_tickets_sensor_id     on public.tickets (sensor_id) where sensor_id is not null;
create index if not exists idx_tickets_student_token  on public.tickets (student_tracking_token);
create index if not exists idx_tickets_tech_token     on public.tickets (technician_action_token) where technician_action_token is not null;
create index if not exists idx_tickets_created_at     on public.tickets (created_at desc);

-- Enable Row Level Security
alter table public.tickets enable row level security;

-- RLS policy: server-side service role bypasses RLS.
-- No public policies — all access is via server with service role key.
