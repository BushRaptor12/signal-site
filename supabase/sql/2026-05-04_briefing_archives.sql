-- Store durable twice-daily snapshots of The Briefing for archive pages.
-- Run this in Supabase SQL Editor before enabling the scheduled cron route.

begin;

create table if not exists public.briefing_archives (
  id bigserial primary key,
  archive_key text not null unique,
  slot text not null check (slot in ('am', 'pm')),
  captured_at timestamptz not null default now(),
  briefing_updated_at timestamptz,
  story_count integer not null default 0,
  content_hash text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists briefing_archives_captured_at_idx
  on public.briefing_archives (captured_at desc);

create index if not exists briefing_archives_content_hash_idx
  on public.briefing_archives (content_hash);

commit;
