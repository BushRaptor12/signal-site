create extension if not exists vector;

create table if not exists public.user_interest_follows (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  query text not null,
  normalized_query text not null,
  embedding vector(384),
  embedding_model text,
  embedding_state text not null default 'pending',
  embedding_updated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_interest_follows_query_not_blank check (btrim(query) <> ''),
  constraint user_interest_follows_normalized_query_not_blank check (btrim(normalized_query) <> ''),
  constraint user_interest_follows_embedding_state_check check (embedding_state in ('pending', 'ready', 'error'))
);

drop trigger if exists set_user_interest_follows_updated_at on public.user_interest_follows;
create trigger set_user_interest_follows_updated_at
before update on public.user_interest_follows
for each row
execute function public.touch_account_updated_at();

create unique index if not exists user_interest_follows_user_id_normalized_query_uidx
  on public.user_interest_follows (user_id, normalized_query);

create index if not exists user_interest_follows_user_id_updated_at_idx
  on public.user_interest_follows (user_id, updated_at desc);

alter table public.user_interest_follows enable row level security;

drop policy if exists "users can read own interest follows" on public.user_interest_follows;
create policy "users can read own interest follows"
on public.user_interest_follows
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own interest follows" on public.user_interest_follows;
create policy "users can insert own interest follows"
on public.user_interest_follows
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own interest follows" on public.user_interest_follows;
create policy "users can update own interest follows"
on public.user_interest_follows
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can delete own interest follows" on public.user_interest_follows;
create policy "users can delete own interest follows"
on public.user_interest_follows
for delete
to authenticated
using (auth.uid() = user_id);

create table if not exists public.story_embeddings (
  story_id text primary key references public.stories (id) on delete cascade,
  embedding vector(384),
  embedding_input text not null,
  content_hash text not null,
  embedding_model text,
  embedding_state text not null default 'pending',
  updated_at timestamptz not null default timezone('utc', now()),
  constraint story_embeddings_embedding_state_check check (embedding_state in ('pending', 'ready', 'error'))
);

create index if not exists story_embeddings_embedding_state_idx
  on public.story_embeddings (embedding_state, updated_at desc);
