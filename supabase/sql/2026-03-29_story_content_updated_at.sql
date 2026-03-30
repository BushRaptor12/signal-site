-- Separate content edit timestamps from generic row updates so views
-- do not move the public "Updated" indicators for tracking stories.

begin;

alter table public.stories
  add column if not exists content_updated_at timestamptz;

update public.stories
set content_updated_at = coalesce(content_updated_at, updated_at, created_at, now())
where content_updated_at is null;

alter table public.stories
  alter column content_updated_at set default now();

alter table public.stories
  alter column content_updated_at set not null;

commit;
