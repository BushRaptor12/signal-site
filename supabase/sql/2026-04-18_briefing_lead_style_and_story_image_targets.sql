alter table public.stories
  add column if not exists beacon_lead_style text not null default 'default',
  add column if not exists image_show_on_homepage boolean not null default true,
  add column if not exists image_show_on_briefing boolean not null default true;

update public.stories
set
  beacon_lead_style = coalesce(nullif(beacon_lead_style, ''), 'default'),
  image_show_on_homepage = coalesce(image_show_on_homepage, true),
  image_show_on_briefing = coalesce(image_show_on_briefing, true);

alter table public.stories
  drop constraint if exists stories_beacon_lead_style_check;

alter table public.stories
  add constraint stories_beacon_lead_style_check
  check (beacon_lead_style in ('default', 'alert'));
