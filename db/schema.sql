create extension if not exists "pgcrypto";

create type hotspot_kind as enum ('industry', 'mass', 'brand');
create type content_track as enum ('rapid-response', 'point-of-view');
create type review_status as enum ('pending', 'approved', 'needs-edit');
create type publish_status as enum ('queued', 'published', 'failed', 'canceled');
create type platform_name as enum ('xiaohongshu', 'wechat', 'video-channel', 'douyin');
create type source_type as enum ('website', 'knowledge-base', 'wechat-history', 'event', 'press');
create type source_freshness as enum ('stable', 'timely');

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slogan text not null,
  sector text not null,
  audiences text[] not null default '{}',
  positioning text[] not null default '{}',
  topics text[] not null default '{}',
  tone text[] not null default '{}',
  red_lines text[] not null default '{}',
  competitors text[] not null default '{}',
  recent_moves text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists brand_sources (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  label text not null,
  type source_type not null,
  freshness source_freshness not null,
  value text not null,
  fetched_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists hotspots (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  kind hotspot_kind not null,
  source text not null,
  detected_at timestamptz not null,
  relevance_score int not null,
  industry_score int not null,
  velocity_score int not null,
  risk_score int not null,
  recommended_action text not null,
  reasons text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists hotspot_scores (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  hotspot_id uuid not null references hotspots(id) on delete cascade,
  priority_score int not null,
  is_high_priority boolean not null default false,
  created_at timestamptz not null default now(),
  unique (brand_id, hotspot_id)
);

create table if not exists hotspot_packs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  hotspot_id uuid not null references hotspots(id) on delete cascade,
  status review_status not null default 'pending',
  why_now text not null,
  why_us text not null,
  review_owner text not null,
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content_variants (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references hotspot_packs(id) on delete cascade,
  track content_track not null,
  title text not null,
  angle text not null,
  format text not null,
  body text not null,
  cover_hook text not null,
  publish_window text not null,
  platforms platform_name[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists publish_jobs (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references hotspot_packs(id) on delete cascade,
  variant_id uuid not null references content_variants(id) on delete cascade,
  platform platform_name not null,
  status publish_status not null default 'queued',
  queue_source text not null default 'manual',
  scheduled_at timestamptz,
  published_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pack_id, variant_id, platform)
);
