alter table public.user_comments
add column if not exists parent_comment_id uuid references public.user_comments (id) on delete cascade;

alter table public.user_comments
add column if not exists root_comment_id uuid references public.user_comments (id) on delete cascade;

alter table public.user_comments
add column if not exists depth integer not null default 0;

alter table public.user_comments
add column if not exists deleted_at timestamptz;

alter table public.user_comments
add column if not exists deleted_by uuid references auth.users (id) on delete set null;

create or replace function public.set_user_comment_thread_fields()
returns trigger
language plpgsql
as $$
declare
  parent_row public.user_comments%rowtype;
begin
  if new.id is null then
    new.id = gen_random_uuid();
  end if;

  if tg_op = 'UPDATE' and new.parent_comment_id is distinct from old.parent_comment_id then
    raise exception 'Comment parent cannot be changed after creation.';
  end if;

  if new.parent_comment_id is null then
    new.depth = 0;
    new.root_comment_id = coalesce(new.root_comment_id, new.id);
    return new;
  end if;

  select *
  into parent_row
  from public.user_comments
  where id = new.parent_comment_id;

  if not found then
    raise exception 'Parent comment does not exist.';
  end if;

  if parent_row.story_id <> new.story_id then
    raise exception 'Replies must belong to the same story.';
  end if;

  if parent_row.deleted_at is not null then
    raise exception 'Replies cannot be added to a removed comment.';
  end if;

  new.depth = parent_row.depth + 1;
  new.root_comment_id = coalesce(parent_row.root_comment_id, parent_row.id);

  return new;
end;
$$;

drop trigger if exists set_user_comment_thread_fields on public.user_comments;
create trigger set_user_comment_thread_fields
before insert or update on public.user_comments
for each row
execute function public.set_user_comment_thread_fields();

update public.user_comments
set root_comment_id = id,
    depth = 0
where parent_comment_id is null
  and (root_comment_id is null or depth <> 0);

create index if not exists user_comments_story_root_created_at_idx
  on public.user_comments (story_id, root_comment_id, created_at asc);

create index if not exists user_comments_parent_created_at_idx
  on public.user_comments (parent_comment_id, created_at asc);

create index if not exists user_comments_story_deleted_created_at_idx
  on public.user_comments (story_id, deleted_at, created_at desc);

create table if not exists public.comment_votes (
  comment_id uuid not null references public.user_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  vote smallint not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (comment_id, user_id),
  constraint comment_votes_vote_check check (vote in (-1, 1))
);

drop trigger if exists set_comment_votes_updated_at on public.comment_votes;
create trigger set_comment_votes_updated_at
before update on public.comment_votes
for each row
execute function public.touch_account_updated_at();

create index if not exists comment_votes_comment_id_idx
  on public.comment_votes (comment_id);

create index if not exists comment_votes_user_id_updated_at_idx
  on public.comment_votes (user_id, updated_at desc);

alter table public.comment_votes enable row level security;

drop policy if exists "users can read own comment votes" on public.comment_votes;
create policy "users can read own comment votes"
on public.comment_votes
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own comment votes" on public.comment_votes;
create policy "users can insert own comment votes"
on public.comment_votes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own comment votes" on public.comment_votes;
create policy "users can update own comment votes"
on public.comment_votes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can delete own comment votes" on public.comment_votes;
create policy "users can delete own comment votes"
on public.comment_votes
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.refresh_story_comment_count(target_story_id text)
returns void
language plpgsql
as $$
begin
  update public.stories
  set comments = (
    select count(*)
    from public.user_comments
    where story_id = target_story_id
      and deleted_at is null
  )
  where id = target_story_id;
end;
$$;

create or replace function public.sync_story_comment_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_story_comment_count(old.story_id);
    return old;
  end if;

  perform public.refresh_story_comment_count(new.story_id);

  if tg_op = 'UPDATE' and old.story_id is distinct from new.story_id then
    perform public.refresh_story_comment_count(old.story_id);
  end if;

  return new;
end;
$$;

drop trigger if exists sync_story_comment_count on public.user_comments;
create trigger sync_story_comment_count
after insert or update or delete on public.user_comments
for each row
execute function public.sync_story_comment_count();

update public.stories
set comments = (
  select count(*)
  from public.user_comments
  where user_comments.story_id = stories.id
    and user_comments.deleted_at is null
);
