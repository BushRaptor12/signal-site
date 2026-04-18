create table if not exists public.user_interest_story_feedback (
  user_id uuid not null references auth.users (id) on delete cascade,
  interest_id bigint not null references public.user_interest_follows (id) on delete cascade,
  story_id text not null references public.stories (id) on delete cascade,
  feedback text not null default 'hidden',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, interest_id, story_id),
  constraint user_interest_story_feedback_feedback_check check (feedback in ('hidden'))
);

drop trigger if exists set_user_interest_story_feedback_updated_at on public.user_interest_story_feedback;
create trigger set_user_interest_story_feedback_updated_at
before update on public.user_interest_story_feedback
for each row
execute function public.touch_account_updated_at();

create index if not exists user_interest_story_feedback_user_id_idx
  on public.user_interest_story_feedback (user_id, updated_at desc);

create index if not exists user_interest_story_feedback_interest_id_idx
  on public.user_interest_story_feedback (interest_id, updated_at desc);

alter table public.user_interest_story_feedback enable row level security;

drop policy if exists "users can read own interest story feedback" on public.user_interest_story_feedback;
create policy "users can read own interest story feedback"
on public.user_interest_story_feedback
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own interest story feedback" on public.user_interest_story_feedback;
create policy "users can insert own interest story feedback"
on public.user_interest_story_feedback
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own interest story feedback" on public.user_interest_story_feedback;
create policy "users can update own interest story feedback"
on public.user_interest_story_feedback
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can delete own interest story feedback" on public.user_interest_story_feedback;
create policy "users can delete own interest story feedback"
on public.user_interest_story_feedback
for delete
to authenticated
using (auth.uid() = user_id);
