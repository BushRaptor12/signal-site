-- Add per-story image display mode for card layouts.
-- Run this in Supabase SQL Editor before deploying the updated editor and pages.

begin;

alter table public.stories
  add column if not exists image_display text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stories_image_display_check'
  ) then
    alter table public.stories
      add constraint stories_image_display_check
      check (image_display is null or image_display in ('cover', 'contain'));
  end if;
end
$$;

update public.stories
set image_display = coalesce(image_display, 'cover')
where image_path is not null;

commit;
