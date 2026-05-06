alter table public.admin_rss_feeds
  add column if not exists category text not null default 'News';

create index if not exists admin_rss_feeds_category_idx on public.admin_rss_feeds(category);
