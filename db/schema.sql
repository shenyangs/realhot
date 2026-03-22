create extension if not exists "pgcrypto";

create type hotspot_kind as enum ('industry', 'mass', 'brand');
create type content_track as enum ('rapid-response', 'point-of-view');
create type review_status as enum ('pending', 'approved', 'needs-edit');
create type publish_status as enum ('queued', 'published', 'failed', 'canceled');
create type platform_name as enum ('xiaohongshu', 'wechat', 'video-channel', 'douyin');
create type source_type as enum ('website', 'knowledge-base', 'wechat-history', 'event', 'press');
create type source_freshness as enum ('stable', 'timely');
create type profile_status as enum ('active', 'disabled');
create type workspace_status as enum ('active', 'disabled');
create type workspace_member_role as enum ('org_admin', 'operator', 'approver');
create type workspace_member_status as enum ('active', 'disabled', 'invited');
create type workspace_invite_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type workspace_invite_code_status as enum ('active', 'disabled', 'used-up');
create type production_job_status as enum ('queued', 'running', 'needs-review', 'completed', 'failed');
create type production_job_stage as enum ('script', 'image', 'video', 'voice', 'subtitle', 'finalize');
create type production_asset_kind as enum ('script', 'image', 'video', 'voice', 'subtitle', 'bundle');
create type production_asset_status as enum ('ready', 'failed');
create type production_event_level as enum ('info', 'warning', 'error');

create table if not exists profiles (
  id uuid primary key,
  email text,
  display_name text not null,
  avatar_url text,
  status profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform_admins (
  user_id uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status workspace_status not null default 'active',
  plan_type text not null default 'trial',
  owner_user_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role workspace_member_role not null,
  status workspace_member_status not null default 'active',
  invited_by uuid references profiles(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role workspace_member_role not null,
  token text not null unique,
  status workspace_invite_status not null default 'pending',
  invited_by uuid references profiles(id) on delete set null,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists workspace_invite_codes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  code text not null unique,
  role workspace_member_role not null,
  status workspace_invite_code_status not null default 'active',
  max_uses int not null default 1,
  used_count int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  actor_user_id uuid references profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
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
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
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
  source_url text,
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
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  hotspot_id uuid not null references hotspots(id) on delete cascade,
  status review_status not null default 'pending',
  why_now text not null,
  why_us text not null,
  review_owner text not null,
  created_by uuid references profiles(id) on delete set null,
  submitted_by uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  submitted_at timestamptz,
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
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists publish_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  pack_id uuid not null references hotspot_packs(id) on delete cascade,
  variant_id uuid not null references content_variants(id) on delete cascade,
  platform platform_name not null,
  status publish_status not null default 'queued',
  queue_source text not null default 'manual',
  requested_by uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  scheduled_at timestamptz,
  published_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pack_id, variant_id, platform)
);

create table if not exists production_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  pack_id uuid not null references hotspot_packs(id) on delete cascade,
  status production_job_status not null default 'queued',
  stage production_job_stage not null default 'script',
  created_by uuid references profiles(id) on delete set null,
  error_message text,
  retry_count int not null default 0,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists production_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  pack_id uuid not null references hotspot_packs(id) on delete cascade,
  job_id uuid not null references production_jobs(id) on delete cascade,
  kind production_asset_kind not null,
  name text not null,
  status production_asset_status not null default 'ready',
  provider text not null,
  model text not null,
  preview_url text,
  text_content text,
  json_content text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists production_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  pack_id uuid not null references hotspot_packs(id) on delete cascade,
  title text not null,
  body text not null,
  subtitles text not null default '',
  cover_asset_id uuid references production_assets(id) on delete set null,
  video_asset_id uuid references production_assets(id) on delete set null,
  voice_asset_id uuid references production_assets(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, pack_id)
);

create table if not exists production_asset_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  pack_id uuid not null references hotspot_packs(id) on delete cascade,
  job_id uuid not null references production_jobs(id) on delete cascade,
  asset_id uuid not null references production_assets(id) on delete cascade,
  changed_by uuid references profiles(id) on delete set null,
  before_state jsonb,
  after_state jsonb,
  change_reason text,
  created_at timestamptz not null default now()
);

create table if not exists production_job_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  pack_id uuid not null references hotspot_packs(id) on delete cascade,
  job_id uuid not null references production_jobs(id) on delete cascade,
  stage production_job_stage,
  level production_event_level not null default 'info',
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on profiles(email);
create index if not exists idx_workspace_members_user_id on workspace_members(user_id);
create index if not exists idx_workspace_invite_codes_workspace_id on workspace_invite_codes(workspace_id);
create index if not exists idx_brands_workspace_id on brands(workspace_id);
create index if not exists idx_hotspot_packs_workspace_id on hotspot_packs(workspace_id);
create index if not exists idx_publish_jobs_workspace_id on publish_jobs(workspace_id);
create index if not exists idx_production_jobs_workspace_id on production_jobs(workspace_id);
create index if not exists idx_production_jobs_status on production_jobs(status, created_at);
create index if not exists idx_production_assets_job_id on production_assets(job_id);
create index if not exists idx_production_assets_pack_id on production_assets(pack_id);
create index if not exists idx_production_drafts_workspace_pack on production_drafts(workspace_id, pack_id);
create index if not exists idx_production_asset_versions_asset_id on production_asset_versions(asset_id);
create index if not exists idx_production_job_events_job_id on production_job_events(job_id, created_at);
