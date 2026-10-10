-- Evidence photos table — records of AI-verified completion photos
-- The actual image files are stored on disk under demo/data/evidence/
-- This table tracks metadata about each verification.

create table if not exists public.evidence (
  id           text        primary key,          -- UUID
  ticket_id    text        not null references public.tickets(id) on delete cascade,
  photo_url    text        not null,              -- relative path, e.g. /evidence/fx-0001-abc.jpg
  state        text        not null,              -- 'passed' | 'failed'
  fixed        boolean     not null,
  confidence   double precision not null,
  reason       text,
  model        text,
  checked_at   timestamptz not null default now()
);

create index if not exists idx_evidence_ticket_id on public.evidence (ticket_id, checked_at desc);

alter table public.evidence enable row level security;
