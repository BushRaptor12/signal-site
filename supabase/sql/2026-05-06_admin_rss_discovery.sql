create extension if not exists pgcrypto;

create table if not exists public.admin_rss_feeds (
  id uuid primary key default gen_random_uuid(),
  title text,
  url text not null unique,
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_error text,
  item_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_rss_items (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid references public.admin_rss_feeds(id) on delete cascade,
  source_name text not null default '',
  title text not null,
  url text not null unique,
  summary text not null default '',
  published_at timestamptz,
  content_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.admin_rss_scan_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  feed_count integer not null default 0,
  item_count integer not null default 0,
  new_item_count integer not null default 0,
  error text
);

create index if not exists admin_rss_feeds_enabled_idx on public.admin_rss_feeds(enabled);
create index if not exists admin_rss_items_feed_id_idx on public.admin_rss_items(feed_id);
create index if not exists admin_rss_items_published_at_idx on public.admin_rss_items(published_at desc nulls last);
create index if not exists admin_rss_items_last_seen_at_idx on public.admin_rss_items(last_seen_at desc);
create index if not exists admin_rss_scan_runs_started_at_idx on public.admin_rss_scan_runs(started_at desc);
