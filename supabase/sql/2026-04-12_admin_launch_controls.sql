alter table public.user_profiles
add column if not exists staff_role text not null default 'reader';

alter table public.user_profiles
add column if not exists comment_moderation_status text not null default 'active';

alter table public.user_profiles
add column if not exists comment_moderation_until timestamptz;

alter table public.user_profiles
add column if not exists comment_moderation_note text;

alter table public.user_profiles
add column if not exists comment_moderated_at timestamptz;

alter table public.user_profiles
add column if not exists comment_moderated_by uuid references auth.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_staff_role_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
    add constraint user_profiles_staff_role_check
    check (staff_role in ('reader', 'moderator', 'admin'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_comment_moderation_status_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
    add constraint user_profiles_comment_moderation_status_check
    check (comment_moderation_status in ('active', 'muted', 'banned'));
  end if;
end $$;

update public.user_profiles
set staff_role = 'admin'
where is_admin = true
  and staff_role <> 'admin';

create index if not exists user_profiles_staff_role_idx
  on public.user_profiles (staff_role);

create index if not exists user_profiles_comment_moderation_status_idx
  on public.user_profiles (comment_moderation_status, comment_moderation_until);

create table if not exists public.site_settings (
  id integer primary key check (id = 1),
  allow_new_comments boolean not null default true,
  allow_comment_replies boolean not null default true,
  allow_comment_voting boolean not null default true,
  allow_comment_realtime boolean not null default true,
  comments_read_only boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.site_settings (
  id,
  allow_new_comments,
  allow_comment_replies,
  allow_comment_voting,
  allow_comment_realtime,
  comments_read_only
)
values (1, true, true, true, true, false)
on conflict (id) do nothing;

drop trigger if exists set_site_settings_updated_at on public.site_settings;
create trigger set_site_settings_updated_at
before update on public.site_settings
for each row
execute function public.touch_account_updated_at();

create table if not exists public.story_revisions (
  id uuid primary key default gen_random_uuid(),
  story_id text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'story_revisions_action_check'
      and conrelid = 'public.story_revisions'::regclass
  ) then
    alter table public.story_revisions
    add constraint story_revisions_action_check
    check (action in ('saved', 'deleted', 'restored'));
  end if;
end $$;

create index if not exists story_revisions_story_id_created_at_idx
  on public.story_revisions (story_id, created_at desc);
