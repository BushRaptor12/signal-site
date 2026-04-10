create table if not exists public.push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  urgent_news boolean not null default true,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.site_notifications (
  id bigint generated always as identity primary key,
  type text not null check (type in ('urgent')),
  title text not null,
  body text not null,
  href text not null,
  story_id text references public.stories(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_push_subscription_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row
execute function public.set_push_subscription_updated_at();
