alter table public.user_profiles
add column if not exists is_admin boolean not null default false;

alter table public.user_profiles
add column if not exists admin_granted_at timestamptz;
