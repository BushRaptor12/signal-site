alter table public.user_interest_follows
  add column if not exists match_keywords text[] not null default '{}',
  add column if not exists exclude_keywords text[] not null default '{}';
