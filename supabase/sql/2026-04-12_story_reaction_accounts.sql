begin;

alter table public.story_reactions
  add column if not exists id bigserial;

alter table public.story_reactions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'story_reactions_pkey'
      and conrelid = 'public.story_reactions'::regclass
      and pg_get_constraintdef(oid) ilike '%viewer_key%'
  ) then
    alter table public.story_reactions
      drop constraint story_reactions_pkey;
  end if;
end
$$;

alter table public.story_reactions
  alter column viewer_key drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'story_reactions_pkey'
      and conrelid = 'public.story_reactions'::regclass
  ) then
    alter table public.story_reactions
      add constraint story_reactions_pkey primary key (id);
  end if;
end
$$;

drop index if exists story_reactions_story_user_uidx;
create unique index story_reactions_story_user_uidx
  on public.story_reactions (story_id, user_id)
  where user_id is not null;

drop index if exists story_reactions_story_viewer_uidx;
create unique index story_reactions_story_viewer_uidx
  on public.story_reactions (story_id, viewer_key)
  where user_id is null and viewer_key is not null;

alter table public.story_reactions
  drop constraint if exists story_reactions_identity_check;

alter table public.story_reactions
  add constraint story_reactions_identity_check
  check (
    (user_id is not null and viewer_key is null)
    or (user_id is null and viewer_key is not null)
  );

commit;
