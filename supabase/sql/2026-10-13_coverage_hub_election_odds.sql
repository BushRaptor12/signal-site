alter table public.coverage_hubs
  add column if not exists election_snapshot jsonb not null default '{}'::jsonb;
