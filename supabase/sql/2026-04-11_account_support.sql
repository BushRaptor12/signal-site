create extension if not exists pgcrypto;

create or replace function public.touch_account_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  username text not null unique,
  username_normalized text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  constraint user_profiles_username_normalized_lower check (username_normalized = lower(username_normalized))
);

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.touch_account_updated_at();

create table if not exists public.user_story_follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  story_id text not null references public.stories (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, story_id)
);

create table if not exists public.user_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  story_id text not null references public.stories (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_user_comments_updated_at on public.user_comments;
create trigger set_user_comments_updated_at
before update on public.user_comments
for each row
execute function public.touch_account_updated_at();

create index if not exists user_story_follows_story_id_idx on public.user_story_follows (story_id);
create index if not exists user_comments_user_id_created_at_idx on public.user_comments (user_id, created_at desc);
create index if not exists user_comments_story_id_idx on public.user_comments (story_id);

alter table public.user_profiles enable row level security;
alter table public.user_story_follows enable row level security;
alter table public.user_comments enable row level security;

drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile"
on public.user_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can update own profile" on public.user_profiles;
create policy "users can update own profile"
on public.user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can read own follows" on public.user_story_follows;
create policy "users can read own follows"
on public.user_story_follows
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own follows" on public.user_story_follows;
create policy "users can insert own follows"
on public.user_story_follows
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can delete own follows" on public.user_story_follows;
create policy "users can delete own follows"
on public.user_story_follows
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can read own comments" on public.user_comments;
create policy "users can read own comments"
on public.user_comments
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own comments" on public.user_comments;
create policy "users can insert own comments"
on public.user_comments
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own comments" on public.user_comments;
create policy "users can update own comments"
on public.user_comments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can delete own comments" on public.user_comments;
create policy "users can delete own comments"
on public.user_comments
for delete
to authenticated
using (auth.uid() = user_id);
