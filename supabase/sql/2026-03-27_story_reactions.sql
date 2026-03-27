-- Add compact per-story reactions for quick feedback.
-- Run this in Supabase SQL Editor before deploying the reaction buttons.

begin;

create table if not exists public.story_reactions (
  story_id text not null references public.stories(id) on delete cascade,
  viewer_key text not null,
  reaction text not null check (
    reaction in ('encouraging', 'interesting', 'concerning', 'surprising', 'frustrating', 'sad')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (story_id, viewer_key)
);

create index if not exists story_reactions_story_idx
  on public.story_reactions (story_id, updated_at desc);

create or replace function public.set_story_reaction_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists story_reactions_set_updated_at on public.story_reactions;

create trigger story_reactions_set_updated_at
before update on public.story_reactions
for each row
execute function public.set_story_reaction_updated_at();

alter table public.story_reactions enable row level security;

commit;
