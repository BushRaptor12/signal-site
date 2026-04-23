create table if not exists public.coverage_hubs (
  slug text primary key,
  eyebrow text not null default '',
  title text not null default '',
  dek text not null default '',
  date_label text not null default '',
  description text not null default '',
  hero_story_id text null,
  latest_story_ids jsonb not null default '[]'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  picks_title text null,
  picks_description text null,
  picks jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid null
);
