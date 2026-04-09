alter table public.stories
add column if not exists related_story_ids text[] not null default '{}';
