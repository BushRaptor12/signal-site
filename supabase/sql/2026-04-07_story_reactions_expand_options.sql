begin;

alter table public.story_reactions
  drop constraint if exists story_reactions_reaction_check;

alter table public.story_reactions
  add constraint story_reactions_reaction_check
  check (
    reaction in (
      'encouraging',
      'love',
      'interesting',
      'funny',
      'concerning',
      'surprising',
      'frustrating',
      'sad'
    )
  );

commit;
