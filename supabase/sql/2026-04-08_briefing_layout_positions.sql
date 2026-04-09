-- Store The Briefing layout by explicit placement instead of derived rank.
-- Run this in Supabase SQL Editor before deploying the updated briefing manager/page.

begin;

alter table public.stories
  add column if not exists beacon_position text;

alter table public.stories
  add column if not exists beacon_order integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stories_beacon_position_check'
  ) then
    alter table public.stories
      add constraint stories_beacon_position_check
      check (beacon_position is null or beacon_position in ('lead', 'left', 'right'));
  end if;
end
$$;

with ranked as (
  select
    id,
    row_number() over (
      order by coalesce(beacon_rank, 2147483647), coalesce(created_at, now()) desc, id
    ) as overall_position
  from public.stories
  where coalesce(beacon_include, false)
)
update public.stories s
set
  beacon_position = case
    when r.overall_position = 1 then 'lead'
    when mod(r.overall_position, 2) = 0 then 'left'
    else 'right'
  end,
  beacon_order = case
    when r.overall_position = 1 then 1
    else ((r.overall_position - 2) / 2) + 1
  end
from ranked r
where s.id = r.id
  and (s.beacon_position is null or s.beacon_order is null);

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
    old.beacon_position is distinct from new.beacon_position or
    old.beacon_order is distinct from new.beacon_order or
    old.beacon_headline is distinct from new.beacon_headline or
    old.title is distinct from new.title;

  if briefing_fields_changed and (old_included or new_included) then
    perform public.touch_briefing_meta();
  end if;

  return new;
end;
$$;

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
