alter table public.coverage_hubs
  add column if not exists active_coverage boolean not null default false;

update public.coverage_hubs
set active_coverage = true
where slug = 'midterm-elections-2026';
