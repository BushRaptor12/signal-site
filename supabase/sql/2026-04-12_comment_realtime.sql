create table if not exists public.comment_vote_totals (
  comment_id uuid primary key references public.user_comments (id) on delete cascade,
  story_id text not null references public.stories (id) on delete cascade,
  upvotes integer not null default 0 check (upvotes >= 0),
  downvotes integer not null default 0 check (downvotes >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists comment_vote_totals_story_updated_idx
  on public.comment_vote_totals (story_id, updated_at desc);

create or replace function public.refresh_comment_vote_totals(target_comment_id uuid)
returns void
language plpgsql
as $$
declare
  target_story_id text;
begin
  select story_id
  into target_story_id
  from public.user_comments
  where id = target_comment_id;

  if target_story_id is null then
    delete from public.comment_vote_totals
    where comment_id = target_comment_id;
    return;
  end if;

  insert into public.comment_vote_totals (comment_id, story_id, upvotes, downvotes, updated_at)
  select
    target_comment_id,
    target_story_id,
    count(*) filter (where vote = 1),
    count(*) filter (where vote = -1),
    timezone('utc', now())
  from public.comment_votes
  where comment_id = target_comment_id
  on conflict (comment_id) do update
  set
    story_id = excluded.story_id,
    upvotes = excluded.upvotes,
    downvotes = excluded.downvotes,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.sync_comment_vote_totals()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_comment_vote_totals(old.comment_id);
    return old;
  end if;

  perform public.refresh_comment_vote_totals(new.comment_id);

  if tg_op = 'UPDATE' and old.comment_id is distinct from new.comment_id then
    perform public.refresh_comment_vote_totals(old.comment_id);
  end if;

  return new;
end;
$$;

drop trigger if exists sync_comment_vote_totals on public.comment_votes;
create trigger sync_comment_vote_totals
after insert or update or delete on public.comment_votes
for each row
execute function public.sync_comment_vote_totals();

insert into public.comment_vote_totals (comment_id, story_id, upvotes, downvotes, updated_at)
select
  comments.id,
  comments.story_id,
  count(votes.*) filter (where votes.vote = 1) as upvotes,
  count(votes.*) filter (where votes.vote = -1) as downvotes,
  timezone('utc', now())
from public.user_comments comments
left join public.comment_votes votes
  on votes.comment_id = comments.id
group by comments.id, comments.story_id
on conflict (comment_id) do update
set
  story_id = excluded.story_id,
  upvotes = excluded.upvotes,
  downvotes = excluded.downvotes,
  updated_at = excluded.updated_at;

alter table public.comment_vote_totals enable row level security;

drop policy if exists "public can read published story comments" on public.user_comments;
create policy "public can read published story comments"
on public.user_comments
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.stories
    where stories.id = user_comments.story_id
      and stories.status = 'published'
  )
);

drop policy if exists "public can read published story vote totals" on public.comment_vote_totals;
create policy "public can read published story vote totals"
on public.comment_vote_totals
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.stories
    where stories.id = comment_vote_totals.story_id
      and stories.status = 'published'
  )
);

alter table public.user_comments replica identity full;
alter table public.comment_vote_totals replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.user_comments;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.comment_vote_totals;
  exception
    when duplicate_object then null;
  end;
end;
$$;
