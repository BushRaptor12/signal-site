create extension if not exists pgcrypto;

alter table public.push_subscriptions
add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  urgent_news boolean not null default false,
  admin_reviews boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.account_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('urgent', 'username_review')),
  title text not null,
  body text not null,
  href text not null,
  story_id text references public.stories(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz
);

create table if not exists public.username_review_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  username text not null,
  normalized_username text not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  notes text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists account_notifications_user_created_idx on public.account_notifications (user_id, created_at desc);
create index if not exists account_notifications_user_unread_idx on public.account_notifications (user_id, read_at);
create index if not exists username_review_queue_status_created_idx on public.username_review_queue (status, created_at desc);
create index if not exists username_review_queue_normalized_username_idx on public.username_review_queue (normalized_username);

drop trigger if exists user_notification_preferences_set_updated_at on public.user_notification_preferences;
create trigger user_notification_preferences_set_updated_at
before update on public.user_notification_preferences
for each row
execute function public.touch_account_updated_at();

alter table public.user_notification_preferences enable row level security;
alter table public.account_notifications enable row level security;
alter table public.username_review_queue enable row level security;

drop policy if exists "users can read own notification preferences" on public.user_notification_preferences;
create policy "users can read own notification preferences"
on public.user_notification_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can update own notification preferences" on public.user_notification_preferences;
create policy "users can update own notification preferences"
on public.user_notification_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can insert own notification preferences" on public.user_notification_preferences;
create policy "users can insert own notification preferences"
on public.user_notification_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can read own account notifications" on public.account_notifications;
create policy "users can read own account notifications"
on public.account_notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can update own account notifications" on public.account_notifications;
create policy "users can update own account notifications"
on public.account_notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
