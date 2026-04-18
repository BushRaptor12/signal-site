create index if not exists story_embeddings_embedding_cosine_idx
  on public.story_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_story_embeddings(
  query_embedding vector(384),
  similarity_threshold float default 0.33,
  match_count int default 24
)
returns table (
  story_id text,
  similarity float
)
language sql
stable
as $$
  select
    se.story_id,
    1 - (se.embedding <=> query_embedding) as similarity
  from public.story_embeddings se
  join public.stories s
    on s.id = se.story_id
  where
    s.status = 'published'
    and se.embedding is not null
    and se.embedding_state = 'ready'
    and 1 - (se.embedding <=> query_embedding) >= similarity_threshold
  order by se.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
