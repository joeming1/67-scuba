-- updated_at trigger — keeps updated_at in sync on every UPDATE
-- Applies to: tickets, sensor_states

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Note: Postgres < v15 doesn't support "IF NOT EXISTS" for CREATE TRIGGER.
-- Use DROP IF EXISTS + CREATE instead.
drop trigger if exists trg_tickets_updated_at on public.tickets;
create trigger trg_tickets_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

drop trigger if exists trg_sensor_states_updated_at on public.sensor_states;
create trigger trg_sensor_states_updated_at
  before update on public.sensor_states
  for each row execute function public.set_updated_at();
