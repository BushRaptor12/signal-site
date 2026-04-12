alter table public.user_comments
add column if not exists edited_at timestamptz;

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.user_comments (id) on delete cascade,
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  constraint comment_reports_reason_length check (char_length(trim(reason)) between 3 and 120),
  constraint comment_reports_unique_reporter unique (comment_id, reporter_user_id)
);

drop trigger if exists set_comment_reports_updated_at on public.comment_reports;
create trigger set_comment_reports_updated_at
before update on public.comment_reports
for each row
execute function public.touch_account_updated_at();

create index if not exists comment_reports_status_created_idx
  on public.comment_reports (status, created_at desc);

create index if not exists comment_reports_comment_id_idx
  on public.comment_reports (comment_id, created_at desc);

create table if not exists public.comment_action_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action_type text not null check (action_type in ('comment_post', 'comment_edit', 'comment_report', 'comment_vote')),
  comment_id uuid references public.user_comments (id) on delete cascade,
  story_id text references public.stories (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists comment_action_events_user_action_created_idx
  on public.comment_action_events (user_id, action_type, created_at desc);

create index if not exists comment_action_events_comment_id_idx
  on public.comment_action_events (comment_id, created_at desc);

alter table public.comment_reports enable row level security;
alter table public.comment_action_events enable row level security;

drop policy if exists "users can read own comment reports" on public.comment_reports;
create policy "users can read own comment reports"
on public.comment_reports
for select
to authenticated
using (auth.uid() = reporter_user_id);

drop policy if exists "users can insert own comment reports" on public.comment_reports;
create policy "users can insert own comment reports"
on public.comment_reports
for insert
to authenticated
with check (auth.uid() = reporter_user_id);

drop policy if exists "users can read own comment action events" on public.comment_action_events;
create policy "users can read own comment action events"
on public.comment_action_events
for select
to authenticated
using (auth.uid() = user_id);

alter table public.account_notifications
drop constraint if exists account_notifications_type_check;

alter table public.account_notifications
add constraint account_notifications_type_check
check (type in ('urgent', 'username_review', 'comment_reply', 'comment_report'));
