begin;

alter table public.stories
  add column if not exists pinned boolean;

update public.stories
set pinned = false
where pinned is null;

alter table public.stories
  alter column pinned set default false;

alter table public.stories
  alter column pinned set not null;

commit;
