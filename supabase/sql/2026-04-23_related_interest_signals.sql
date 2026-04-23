-- Allow stories to carry weaker hidden audience signals for the Following feed.

begin;

alter table public.stories
  add column if not exists related_interest_signals text[] not null default '{}'::text[];

update public.stories
set related_interest_signals = coalesce(related_interest_signals, '{}'::text[])
where related_interest_signals is null;

commit;
