alter table public.story_revisions
  drop constraint if exists story_revisions_action_check;

alter table public.story_revisions
  add constraint story_revisions_action_check
  check (action in ('saved', 'update', 'correction', 'deleted', 'restored'));
