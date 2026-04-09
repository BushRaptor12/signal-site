-- Add per-story image focus controls for cropped card/briefing images.
-- Run this in Supabase SQL Editor before deploying the updated editor and pages.

begin;

alter table public.stories
  add column if not exists image_focus_x numeric(5,2);

alter table public.stories
  add column if not exists image_focus_y numeric(5,2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stories_image_focus_x_check'
  ) then
    alter table public.stories
      add constraint stories_image_focus_x_check
      check (image_focus_x is null or (image_focus_x >= 0 and image_focus_x <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stories_image_focus_y_check'
  ) then
    alter table public.stories
      add constraint stories_image_focus_y_check
      check (image_focus_y is null or (image_focus_y >= 0 and image_focus_y <= 100));
  end if;
end
$$;

update public.stories
set
  image_focus_x = coalesce(image_focus_x, 50),
  image_focus_y = coalesce(image_focus_y, 50)
where image_path is not null
  and (image_focus_x is null or image_focus_y is null);

commit;
