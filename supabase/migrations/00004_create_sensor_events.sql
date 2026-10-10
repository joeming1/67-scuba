-- Sensor events log — append-only raw readings from ESP32 sensors
-- Each reading is stored for audit/debugging; sensor_states holds the latest snapshot.

create table if not exists public.sensor_events (
  id            bigint generated always as identity primary key,
  sensor_id     text        not null,
  sensor_type   text        not null default 'ldr',  -- 'ldr' | future types
  metric        text        not null,                 -- 'brightness_pct'
  value         double precision not null,
  location      text,
  observed_at   timestamptz,
  received_at   timestamptz not null default now()
);

create index if not exists idx_sensor_events_sensor_id  on public.sensor_events (sensor_id, received_at desc);
create index if not exists idx_sensor_events_received   on public.sensor_events (received_at desc);

alter table public.sensor_events enable row level security;
