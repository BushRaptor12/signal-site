alter table public.stories
  add column if not exists locations text[] not null default '{}',
  add column if not exists organizations text[] not null default '{}',
  add column if not exists people text[] not null default '{}',
  add column if not exists industries text[] not null default '{}',
  add column if not exists sports_teams text[] not null default '{}',
  add column if not exists offices text[] not null default '{}',
  add column if not exists facets text[] not null default '{}';
