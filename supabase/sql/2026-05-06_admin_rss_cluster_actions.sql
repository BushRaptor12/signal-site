create table if not exists public.admin_rss_cluster_actions (
  cluster_id text primary key,
  status text not null default 'reviewed',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint admin_rss_cluster_actions_status_check check (status in ('reviewed', 'hidden'))
);

create index if not exists admin_rss_cluster_actions_status_idx on public.admin_rss_cluster_actions(status);
