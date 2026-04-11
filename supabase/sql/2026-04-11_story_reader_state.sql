create table if not exists public.user_story_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  story_id text not null references public.stories (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, story_id)
);

drop trigger if exists set_user_story_seen_updated_at on public.user_story_seen;
create trigger set_user_story_seen_updated_at
before update on public.user_story_seen
for each row
execute function public.touch_account_updated_at();

create index if not exists user_story_seen_story_id_idx on public.user_story_seen (story_id);
create index if not exists user_story_seen_user_id_updated_at_idx on public.user_story_seen (user_id, updated_at desc);

alter table public.user_story_seen enable row level security;

drop policy if exists "users can read own seen stories" on public.user_story_seen;
create policy "users can read own seen stories"
on public.user_story_seen
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own seen stories" on public.user_story_seen;
create policy "users can insert own seen stories"
on public.user_story_seen
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own seen stories" on public.user_story_seen;
create policy "users can update own seen stories"
on public.user_story_seen
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
