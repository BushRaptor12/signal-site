drop function if exists public.match_story_embeddings(text, float, int);

create or replace function public.match_story_embeddings(
  query_embedding_text text,
  similarity_threshold float default 0.18,
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
    1 - (se.embedding <=> (query_embedding_text::vector(384))) as similarity
  from public.story_embeddings se
  join public.stories s
    on s.id = se.story_id
  where
    s.status = 'published'
    and se.embedding is not null
    and se.embedding_state = 'ready'
    and 1 - (se.embedding <=> (query_embedding_text::vector(384))) >= similarity_threshold
  order by se.embedding <=> (query_embedding_text::vector(384))
  limit greatest(match_count, 1);
$$;
