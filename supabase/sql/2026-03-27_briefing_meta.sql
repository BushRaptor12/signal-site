-- Track the last meaningful update to The Briefing independently from story views.
-- Run this in Supabase SQL Editor before deploying the updated Briefing page.

begin;

create table if not exists public.briefing_meta (
  id integer primary key default 1 check (id = 1),
  updated_at timestamptz not null default now()
);

insert into public.briefing_meta (id, updated_at)
values (1, now())
on conflict (id) do nothing;

create or replace function public.touch_briefing_meta()
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.briefing_meta (id, updated_at)
  values (1, now())
  on conflict (id)
  do update set updated_at = excluded.updated_at;
end;
$$;

create or replace function public.story_affects_briefing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_included boolean := false;
  new_included boolean := false;
  briefing_fields_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.beacon_include, false) then
      perform public.touch_briefing_meta();
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if coalesce(old.beacon_include, false) then
      perform public.touch_briefing_meta();
    end if;
    return old;
  end if;

  old_included := coalesce(old.beacon_include, false);
  new_included := coalesce(new.beacon_include, false);

  briefing_fields_changed :=
    old_included is distinct from new_included or
    old.beacon_rank is distinct from new.beacon_rank or
    old.beacon_headline is distinct from new.beacon_headline or
    old.title is distinct from new.title;

  if briefing_fields_changed and (old_included or new_included) then
    perform public.touch_briefing_meta();
  end if;

  return new;
end;
$$;

drop trigger if exists stories_touch_briefing_meta on public.stories;

create trigger stories_touch_briefing_meta
after insert or update or delete on public.stories
for each row
execute function public.story_affects_briefing();

update public.briefing_meta
set updated_at = coalesce(
  (
    select max(coalesce(s.updated_at, s.created_at))
    from public.stories s
    where coalesce(s.beacon_include, false)
  ),
  updated_at
)
where id = 1;

commit;
