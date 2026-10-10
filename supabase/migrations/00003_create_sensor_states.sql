-- Sensor states table — latest known state of each LDR sensor
-- Matches the SensorState interface in lib/types.ts
-- In-memory only before; now persisted so server restarts don't lose sensor data.

create table if not exists public.sensor_states (
  sensor_id      text        primary key,       -- e.g. "ldr_b204"
  low_count      integer     not null default 0,
  recovery_count integer     not null default 0,
  value          double precision,              -- can be null if no reading yet
  location       text        not null default '',
  observed_at    timestamptz,
  received_at    timestamptz,
  updated_at     timestamptz not null default now()
);

create index if not exists idx_sensor_states_location on public.sensor_states (location);

alter table public.sensor_states enable row level security;
