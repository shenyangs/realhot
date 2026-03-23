create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'hotspot_kind') then
    create type hotspot_kind as enum ('industry', 'mass', 'brand');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'content_track') then
    create type content_track as enum ('rapid-response', 'point-of-view');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'review_status') then
    create type review_status as enum ('pending', 'approved', 'needs-edit');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'publish_status') then
    create type publish_status as enum ('queued', 'published', 'failed', 'canceled');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_name') then
    create type platform_name as enum ('xiaohongshu', 'wechat', 'video-channel', 'douyin');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'source_type') then
    create type source_type as enum ('website', 'knowledge-base', 'wechat-history', 'event', 'press');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'source_freshness') then
    create type source_freshness as enum ('stable', 'timely');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_status') then
    create type profile_status as enum ('active', 'disabled');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_status') then
    create type workspace_status as enum ('active', 'disabled');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_member_role') then
    create type workspace_member_role as enum ('org_admin', 'operator', 'approver');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_member_status') then
    create type workspace_member_status as enum ('active', 'disabled', 'invited');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_invite_status') then
    create type workspace_invite_status as enum ('pending', 'accepted', 'expired', 'revoked');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_invite_code_status') then
    create type workspace_invite_code_status as enum ('active', 'disabled', 'used-up');
  end if;
end $$;

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

create table if not exists platform_ai_routing_configs (
  id uuid primary key default gen_random_uuid(),
  default_provider text not null default 'gemini',
  feature_overrides jsonb not null default '{}'::jsonb,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create index if not exists idx_profiles_email on profiles(email);
create index if not exists idx_workspace_members_user_id on workspace_members(user_id);
create index if not exists idx_workspace_invite_codes_workspace_id on workspace_invite_codes(workspace_id);
create index if not exists idx_brands_workspace_id on brands(workspace_id);
create index if not exists idx_hotspot_packs_workspace_id on hotspot_packs(workspace_id);
create index if not exists idx_publish_jobs_workspace_id on publish_jobs(workspace_id);
create index if not exists idx_audit_logs_created_at on audit_logs(created_at desc);
create index if not exists idx_audit_logs_actor_user_id on audit_logs(actor_user_id);
create index if not exists idx_audit_logs_workspace_id on audit_logs(workspace_id);
create index if not exists idx_audit_logs_action on audit_logs(action);
