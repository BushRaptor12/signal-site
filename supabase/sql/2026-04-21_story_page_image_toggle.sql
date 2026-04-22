alter table public.stories
  add column if not exists image_show_on_story_page boolean not null default false;

update public.stories
set image_show_on_story_page = coalesce(image_show_on_story_page, false);
