alter table public.stories
add column if not exists status text not null default 'published';

update public.stories
set status = 'published'
where status is null
   or status not in ('draft', 'published', 'archived');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stories_status_check'
      and conrelid = 'public.stories'::regclass
  ) then
    alter table public.stories
    add constraint stories_status_check
    check (status in ('draft', 'published', 'archived'));
  end if;
end $$;

create index if not exists stories_status_created_at_idx
on public.stories (status, created_at desc);

create index if not exists stories_status_beacon_include_idx
on public.stories (status, beacon_include, beacon_position, beacon_order);
