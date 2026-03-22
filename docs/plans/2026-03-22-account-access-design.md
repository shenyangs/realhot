# 账号与权限设计

## 目标

给产品补齐一套适合当前阶段的账号与权限骨架，满足以下要求：

- 支持平台方管理所有客户与用户
- 支持客户团队内多人协作
- 支持一个客户组织管理多个品牌
- 支持内容生产、审核、导出这条主链路的权限隔离
- 保持首版简单，不提前做过重的细粒度授权

本方案采用四层结构：

- 平台 `platform`
- 组织 `workspace`
- 品牌 `brand`
- 成员 `membership`

权限先按 `workspace` 控制，`brand` 只做业务归属，不做首版细粒度授权。

## 角色模型

### 平台角色

- `super_admin`

仅平台内部使用。进入 `/admin`，管理全平台用户、组织、套餐、模型配置、热点源、任务日志。

### 组织角色

- `org_admin`
- `operator`
- `approver`

角色说明：

- `org_admin`：客户负责人，管理成员、品牌、素材、发布配置，查看和处理本组织全部业务数据
- `operator`：内容操盘手，负责看热点、做策划、生成内容、编辑内容、提交审核
- `approver`：审核负责人，负责审核、退回、批准导出或进入发布

一个用户可以加入多个 `workspace`，并且在不同 `workspace` 中拥有不同角色。

## 权限边界

### super_admin

- 可访问平台后台 `/admin/*`
- 可查看与管理所有用户、组织、套餐、系统配置
- 可查看系统级任务状态、失败日志、同步状态
- 不默认进入客户工作台执行内容生产，避免后台与前台混用

### org_admin

- 可访问本组织工作台
- 可管理品牌资料、素材、成员、发布配置
- 可查看本组织所有热点、策划、内容、审核、导出数据
- 可执行审核通过、退回、导出放行

### operator

- 可查看热点看板
- 可触发热点深挖与传播策划
- 可生成内容、编辑内容、提交审核
- 不可管理成员
- 不可修改组织级配置
- 不可修改平台级设置

### approver

- 可查看品牌资料、热点、策划结果、内容成品
- 可审核通过、退回、补充批注
- 可决定内容是否允许导出或进入发布环节
- 不负责组织配置和成员管理

## 页面访问模型

### 平台后台

- `/admin`
- `/admin/users`
- `/admin/workspaces`
- `/admin/plans`
- `/admin/system`
- `/admin/jobs`
- `/admin/logs`

仅 `super_admin` 可访问。

### 客户工作台

- `/`
- `/hotspots`
- `/review`
- `/publish`
- `/brands`

`org_admin`、`operator`、`approver` 可访问，但页面内动作按钮按角色控制显示。

## 数据模型

建议复用 `Supabase Auth` 做认证，业务权限走业务表。

### 新增表

#### profiles

用户资料表，主键与 `auth.users.id` 一致。

字段建议：

- `id uuid primary key`
- `display_name text not null`
- `avatar_url text`
- `email text`
- `status text not null default 'active'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### platform_admins

平台管理员表。

字段建议：

- `user_id uuid primary key references profiles(id) on delete cascade`
- `created_at timestamptz not null default now()`

#### workspaces

客户组织表。

字段建议：

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `slug text not null unique`
- `status text not null default 'active'`
- `plan_type text not null default 'trial'`
- `owner_user_id uuid references profiles(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### workspace_members

组织成员表。

字段建议：

- `id uuid primary key default gen_random_uuid()`
- `workspace_id uuid not null references workspaces(id) on delete cascade`
- `user_id uuid not null references profiles(id) on delete cascade`
- `role text not null`
- `status text not null default 'active'`
- `invited_by uuid references profiles(id)`
- `joined_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `unique (workspace_id, user_id)`

其中 `role` 取值限定为：

- `org_admin`
- `operator`
- `approver`

#### workspace_invites

成员邀请表。

字段建议：

- `id uuid primary key default gen_random_uuid()`
- `workspace_id uuid not null references workspaces(id) on delete cascade`
- `email text not null`
- `role text not null`
- `token text not null unique`
- `status text not null default 'pending'`
- `invited_by uuid references profiles(id)`
- `expires_at timestamptz`
- `accepted_at timestamptz`
- `created_at timestamptz not null default now()`

#### audit_logs

审计日志表。

字段建议：

- `id uuid primary key default gen_random_uuid()`
- `workspace_id uuid references workspaces(id) on delete cascade`
- `actor_user_id uuid references profiles(id)`
- `entity_type text not null`
- `entity_id uuid`
- `action text not null`
- `payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

## 现有业务表改造

### brands

新增：

- `workspace_id uuid not null references workspaces(id) on delete cascade`
- `created_by uuid references profiles(id)`
- `updated_by uuid references profiles(id)`

目的：

- 把品牌归属到组织
- 为成员操作留痕

### brand_sources

保留 `brand_id` 关联即可。必要时补：

- `created_by uuid references profiles(id)`

### hotspots

热点本身可继续作为平台共享数据，不必强绑 `workspace_id`。这样可以避免同一热点为每个组织重复存储。

### hotspot_scores

当前使用 `brand_id` 关联即可，后续如果要做组织级缓存可再补 `workspace_id`。

### hotspot_packs

建议新增：

- `workspace_id uuid not null references workspaces(id) on delete cascade`
- `created_by uuid references profiles(id)`
- `submitted_by uuid references profiles(id)`
- `approved_by uuid references profiles(id)`
- `submitted_at timestamptz`

目的：

- 支持列表按组织过滤
- 支持审核链路留痕

### content_variants

建议新增：

- `created_by uuid references profiles(id)`
- `updated_by uuid references profiles(id)`
- `updated_at timestamptz not null default now()`

### publish_jobs

建议新增：

- `workspace_id uuid not null references workspaces(id) on delete cascade`
- `requested_by uuid references profiles(id)`
- `approved_by uuid references profiles(id)`

## 首版动作权限矩阵

### 品牌与素材

- 创建品牌：`org_admin`
- 编辑品牌资料：`org_admin`
- 上传素材：`org_admin`、`operator`
- 删除品牌：`org_admin`
- 管成员：`org_admin`

### 热点与策划

- 查看热点看板：`org_admin`、`operator`、`approver`
- 触发深挖传播建议：`org_admin`、`operator`
- 生成内容：`org_admin`、`operator`
- 编辑内容：`org_admin`、`operator`
- 提交审核：`org_admin`、`operator`

### 审核与导出

- 查看待审内容：`org_admin`、`approver`
- 审核通过：`org_admin`、`approver`
- 审核退回：`org_admin`、`approver`
- 导出内容：`org_admin`、`approver`
- 进入发布流程：`org_admin`、`approver`

### 平台管理

- 管全部用户：`super_admin`
- 管全部组织：`super_admin`
- 管系统热源：`super_admin`
- 管模型配置：`super_admin`
- 看全局日志：`super_admin`

## 路由与中间件建议

首版不需要很重的授权框架，建议采用三层判断：

1. 是否登录
2. 是否属于当前 `workspace`
3. 当前角色是否允许执行该动作

建议补以下能力：

- 登录后如果用户属于多个 `workspace`，先进入组织选择页
- 当前选择的 `workspace` 存在 cookie 或 session 中
- 页面服务端读取当前 `workspace` 与角色，决定是否渲染操作按钮
- `POST` / `PATCH` / `DELETE` 接口再次做服务端角色校验，前端按钮隐藏不能代替后端鉴权

## 首版实施顺序

### 第一步：数据层

- 补 `profiles`
- 补 `platform_admins`
- 补 `workspaces`
- 补 `workspace_members`
- 补 `workspace_invites`
- 补 `audit_logs`
- 改造 `brands`、`hotspot_packs`、`content_variants`、`publish_jobs`

### 第二步：认证层

- 接入 `Supabase Auth`
- 建立登录态读取工具
- 建立当前用户、当前 workspace、当前角色的查询方法

### 第三步：页面访问控制

- 增加 `/admin/*` 路由保护
- 增加工作台页面对 workspace 的过滤
- 按角色控制按钮显示

### 第四步：组织管理

- 成员列表
- 邀请成员
- 角色调整
- 停用成员

### 第五步：审核流闭环

- 提交审核
- 审核通过/退回
- 审计日志记录

## 当前阶段结论

现阶段最合适的方案不是一开始做复杂权限系统，而是先完成：

- 平台后台和客户工作台分区
- `workspace` 级别授权
- 四类角色
- 审核链路留痕

这样既能支撑多人协作，也不会把页面和实现复杂度拉得过高，适合当前产品仍在快速迭代的阶段。
