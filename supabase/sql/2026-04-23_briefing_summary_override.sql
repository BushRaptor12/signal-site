-- Allow a dedicated per-story summary override for The Briefing.
-- Leave beacon_summary null to fall back to the first line of the story summary.

begin;

alter table public.stories
  add column if not exists beacon_summary text;

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
    old.beacon_summary is distinct from new.beacon_summary or
    old.title is distinct from new.title;

  if briefing_fields_changed and (old_included or new_included) then
    perform public.touch_briefing_meta();
  end if;

  return new;
end;
$$;

commit;
