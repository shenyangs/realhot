begin;

delete from publish_jobs
where pack_id in (
  '44444444-4444-4444-4444-444444444441'
);

delete from content_variants
where pack_id in (
  '44444444-4444-4444-4444-444444444441'
);

delete from hotspot_packs
where id in (
  '44444444-4444-4444-4444-444444444441'
);

delete from hotspot_scores
where brand_id in ('11111111-1111-1111-1111-111111111111');

delete from hotspots
where id in (
  '33333333-3333-3333-3333-333333333331',
  '33333333-3333-3333-3333-333333333332',
  '33333333-3333-3333-3333-333333333333'
);

delete from brand_sources
where brand_id in ('11111111-1111-1111-1111-111111111111');

delete from brands
where id in ('11111111-1111-1111-1111-111111111111');

delete from workspace_members
where workspace_id in ('88888888-8888-8888-8888-888888888881');

delete from workspace_invites
where workspace_id in ('88888888-8888-8888-8888-888888888881');

delete from workspace_invite_codes
where workspace_id in ('88888888-8888-8888-8888-888888888881');

delete from platform_admins
where user_id in (
  '99999999-9999-9999-9999-999999999991',
  '99999999-9999-9999-9999-999999999992',
  '99999999-9999-9999-9999-999999999993',
  '99999999-9999-9999-9999-999999999994'
);

delete from workspaces
where id in ('88888888-8888-8888-8888-888888888881');

delete from profiles
where id in (
  '99999999-9999-9999-9999-999999999991',
  '99999999-9999-9999-9999-999999999992',
  '99999999-9999-9999-9999-999999999993',
  '99999999-9999-9999-9999-999999999994'
);

insert into profiles (
  id,
  email,
  display_name,
  status
) values
  (
    '99999999-9999-9999-9999-999999999991',
    'superadmin@example.com',
    'Platform Super Admin',
    'active'
  ),
  (
    '99999999-9999-9999-9999-999999999992',
    'owner@example.com',
    'Workspace Owner',
    'active'
  ),
  (
    '99999999-9999-9999-9999-999999999993',
    'operator@example.com',
    'Content Operator',
    'active'
  ),
  (
    '99999999-9999-9999-9999-999999999994',
    'approver@example.com',
    'Content Approver',
    'active'
  );

insert into platform_admins (
  user_id
) values (
  '99999999-9999-9999-9999-999999999991'
);

insert into workspaces (
  id,
  name,
  slug,
  status,
  plan_type,
  owner_user_id
) values (
  '88888888-8888-8888-8888-888888888881',
  'SignalStack Demo Workspace',
  'signalstack-demo',
  'active',
  'trial',
  '99999999-9999-9999-9999-999999999992'
);

insert into workspace_members (
  id,
  workspace_id,
  user_id,
  role,
  status,
  invited_by,
  joined_at
) values
  (
    '12121212-1212-1212-1212-121212121212',
    '88888888-8888-8888-8888-888888888881',
    '99999999-9999-9999-9999-999999999992',
    'org_admin',
    'active',
    '99999999-9999-9999-9999-999999999991',
    now()
  ),
  (
    '13131313-1313-1313-1313-131313131313',
    '88888888-8888-8888-8888-888888888881',
    '99999999-9999-9999-9999-999999999993',
    'operator',
    'active',
    '99999999-9999-9999-9999-999999999992',
    now()
  ),
  (
    '14141414-1414-1414-1414-141414141414',
    '88888888-8888-8888-8888-888888888881',
    '99999999-9999-9999-9999-999999999994',
    'approver',
    'active',
    '99999999-9999-9999-9999-999999999992',
    now()
  );

insert into workspace_invite_codes (
  id,
  workspace_id,
  code,
  role,
  status,
  max_uses,
  used_count,
  created_by,
  created_at
) values (
  '17171717-1717-1717-1717-171717171717',
  '88888888-8888-8888-8888-888888888881',
  'SIGNALSTACK-TRIAL-01',
  'operator',
  'active',
  3,
  0,
  '99999999-9999-9999-9999-999999999991',
  '2026-03-22T09:20:00+08:00'
);

insert into brands (
  id,
  workspace_id,
  name,
  slogan,
  sector,
  audiences,
  positioning,
  topics,
  tone,
  red_lines,
  competitors,
  recent_moves,
  created_by,
  updated_by
) values (
  '11111111-1111-1111-1111-111111111111',
  '88888888-8888-8888-8888-888888888881',
  'SignalStack',
  '让 AI 团队更快跑到市场前面',
  'AI / SaaS',
  array['市场负责人', '增长负责人', '产品营销团队'],
  array[
    '帮助 AI 与 SaaS 品牌把分散信号转成连续对外传播',
    '强调规模化、时效性和品牌表达一致性'
  ],
  array['AI 生产力', '品牌规模化传播', '热点快反', 'B2B 内容系统'],
  array['专业', '直接', '有判断', '不过度营销'],
  array['不虚构客户案例', '不碰瓷竞品', '不夸大模型能力', '行业新闻必须标明事实边界'],
  array['HubSpot', 'Jasper', 'Writer', '自建内容团队'],
  array['上周发布了热点内容审核工作台 beta', '两周前在上海参加 AI 增长峰会', '本月发布品牌传播自动化白皮书'],
  '99999999-9999-9999-9999-999999999992',
  '99999999-9999-9999-9999-999999999992'
);

insert into brand_sources (
  id,
  brand_id,
  label,
  type,
  freshness,
  value,
  fetched_at
) values
  (
    '22222222-2222-2222-2222-222222222221',
    '11111111-1111-1111-1111-111111111111',
    '官网产品页',
    'website',
    'stable',
    '产品定位、功能和核心卖点',
    '2026-03-21T08:00:00+08:00'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    '公众号历史文章',
    'wechat-history',
    'stable',
    '过去 30 篇文章的观点与语气',
    '2026-03-21T08:05:00+08:00'
  ),
  (
    '22222222-2222-2222-2222-222222222223',
    '11111111-1111-1111-1111-111111111111',
    'AI 增长峰会演讲稿',
    'event',
    'timely',
    '最近一个月高管对热点传播的公开观点',
    '2026-03-21T08:10:00+08:00'
  ),
  (
    '22222222-2222-2222-2222-222222222224',
    '11111111-1111-1111-1111-111111111111',
    '本月媒体新闻稿',
    'press',
    'timely',
    '新功能与合作动态',
    '2026-03-21T08:15:00+08:00'
  );

insert into hotspots (
  id,
  title,
  summary,
  kind,
  source,
  detected_at,
  relevance_score,
  industry_score,
  velocity_score,
  risk_score,
  recommended_action,
  reasons
) values
  (
    '33333333-3333-3333-3333-333333333331',
    '多家大模型厂商同时上线 Agent 工作流能力',
    '行业在过去 12 小时内密集发布 Agent 工作流新能力，讨论点集中在落地效率和企业可控性。',
    'industry',
    '行业媒体聚合',
    '2026-03-21T08:20:00+08:00',
    92,
    90,
    85,
    28,
    'ship-now',
    array['和品牌的 AI 传播自动化定位强相关', '适合借势讨论企业如何把 Agent 能力变成稳定产出']
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    '某头部平台调整内容推荐权重，强调原创深度',
    '平台算法开始降低同质化短内容曝光，增加对深度解读内容和原创表达的扶持力度。',
    'mass',
    '平台公告 + 社媒发酵',
    '2026-03-21T09:05:00+08:00',
    84,
    78,
    81,
    35,
    'ship-now',
    array['直接影响品牌内容分发策略', '有利于输出 SignalStack 关于快反与观点并行的产品方法']
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '竞品发布热点营销 Copilot',
    '竞品在发布会上展示了一套热点发现与文案生成助手，但未覆盖审核和品牌知识层。',
    'brand',
    '竞品发布会',
    '2026-03-21T10:10:00+08:00',
    88,
    72,
    68,
    46,
    'watch',
    array['适合做产品对比视角，但需要严格控制竞品表述', '可转化为品牌差异化观点内容']
  );

insert into hotspot_scores (
  id,
  brand_id,
  hotspot_id,
  priority_score,
  is_high_priority
) values
  (
    '55555555-5555-5555-5555-555555555551',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333331',
    84,
    true
  ),
  (
    '55555555-5555-5555-5555-555555555552',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333332',
    74,
    true
  ),
  (
    '55555555-5555-5555-5555-555555555553',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
    65,
    false
  );

insert into hotspot_packs (
  id,
  workspace_id,
  brand_id,
  hotspot_id,
  status,
  why_now,
  why_us,
  review_owner,
  created_by,
  submitted_by,
  approved_by,
  submitted_at,
  review_note,
  reviewed_by,
  reviewed_at
) values (
  '44444444-4444-4444-4444-444444444441',
  '88888888-8888-8888-8888-888888888881',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333331',
  'pending',
  '过去 12 小时行业发布密度异常高，讨论仍在上升。',
  '品牌最近刚发布审核工作台 beta，可以自然接到“从 Agent 到可控传播”的观点。',
  '品牌市场负责人',
  '99999999-9999-9999-9999-999999999993',
  '99999999-9999-9999-9999-999999999993',
  null,
  now(),
  null,
  null,
  null
);

insert into content_variants (
  id,
  pack_id,
  track,
  title,
  angle,
  format,
  body,
  cover_hook,
  publish_window,
  platforms
) values
  (
    '66666666-6666-6666-6666-666666666661',
    '44444444-4444-4444-4444-444444444441',
    'rapid-response',
    'Agent 爆发之后，品牌传播团队最先该补的不是模型，而是流程',
    '抢速度，但不牺牲品牌控制权',
    'post',
    '今天大家都在聊 Agent 工作流，但对品牌团队来说，真正的分水岭不是谁先接模型，而是谁能把热点捕捉、内容策划、审核发布串成一条可复用链路。没有品牌策略层和审核层，再快也只是更快地产生噪音。',
    'Agent 热起来了，品牌团队先别急着上',
    '10:30-11:00',
    array['xiaohongshu', 'wechat']::platform_name[]
  ),
  (
    '66666666-6666-6666-6666-666666666662',
    '44444444-4444-4444-4444-444444444441',
    'rapid-response',
    '大模型都在做 Agent，品牌内容为什么还是发不快',
    '问题拆解式快评',
    'video-script',
    '开头先抛问题：为什么模型更强了，内容团队还是追不上热点？接着点出三个断点，监测不连续、品牌知识分散、审核靠人肉。最后抛出结论：Agent 不是替代人，而是缩短热点到内容之间的链路。',
    '模型更强了，为什么内容还发不快？',
    '11:30-12:00',
    array['video-channel', 'douyin']::platform_name[]
  ),
  (
    '66666666-6666-6666-6666-666666666663',
    '44444444-4444-4444-4444-444444444441',
    'point-of-view',
    '企业级 Agent 进入实用期后，品牌传播系统要重做一遍',
    '中短篇观点文',
    'article',
    '企业采用 Agent 的下一步，不是再多接几个模型，而是把品牌策略包、热点引擎、内容生成和审核分层。品牌传播的价值正在从单次创意转向持续稳定输出，这才是 AI 进入运营系统的标志。',
    'Agent 真进入实用期，品牌传播会先重构',
    '14:00-15:00',
    array['wechat']::platform_name[]
  ),
  (
    '66666666-6666-6666-6666-666666666664',
    '44444444-4444-4444-4444-444444444441',
    'point-of-view',
    '快反不该和深度内容对立，真正成熟的系统一定双轨运行',
    '方法论输出',
    'post',
    '市场团队经常被迫二选一，要么抢速度，要么做深度。更合理的方式是双引擎：先用快反抢窗口，再把高价值热点沉淀成观点内容。只有这样，热点才不会只换来一次性曝光。',
    '别再把快反和深度内容对立起来',
    '19:00-20:00',
    array['xiaohongshu', 'video-channel']::platform_name[]
  );

insert into publish_jobs (
  id,
  workspace_id,
  pack_id,
  variant_id,
  platform,
  status,
  queue_source,
  requested_by,
  approved_by,
  scheduled_at,
  published_at,
  failure_reason
) values
  (
    '77777777-7777-7777-7777-777777777771',
    '88888888-8888-8888-8888-888888888881',
    '44444444-4444-4444-4444-444444444441',
    '66666666-6666-6666-6666-666666666661',
    'xiaohongshu',
    'queued',
    'manual',
    '99999999-9999-9999-9999-999999999993',
    null,
    null,
    null,
    null
  ),
  (
    '77777777-7777-7777-7777-777777777772',
    '88888888-8888-8888-8888-888888888881',
    '44444444-4444-4444-4444-444444444441',
    '66666666-6666-6666-6666-666666666662',
    'douyin',
    'queued',
    'manual',
    '99999999-9999-9999-9999-999999999993',
    null,
    null,
    null,
    null
  );

commit;
