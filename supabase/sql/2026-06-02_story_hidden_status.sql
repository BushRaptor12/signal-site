alter table public.stories
drop constraint if exists stories_status_check;

update public.stories
set status = 'published'
where status is null
   or status not in ('draft', 'published', 'archived', 'hidden');

alter table public.stories
add constraint stories_status_check
check (status in ('draft', 'published', 'archived', 'hidden'));
