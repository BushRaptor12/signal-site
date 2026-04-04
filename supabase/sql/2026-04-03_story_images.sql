begin;

alter table public.stories
  add column if not exists image_url text;

alter table public.stories
  add column if not exists image_path text;

insert into storage.buckets (id, name, public)
values ('story-images', 'story-images', true)
on conflict (id) do update
set public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Story images are publicly readable'
  ) then
    create policy "Story images are publicly readable"
    on storage.objects for select
    to public
    using (bucket_id = 'story-images');
  end if;
end
$$;

commit;
