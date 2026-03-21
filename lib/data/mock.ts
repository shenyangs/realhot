import {
  BrandStrategyPack,
  DashboardMetric,
  HotspotPack,
  HotspotSignal
} from "@/lib/domain/types";

export const dashboardMetrics: DashboardMetric[] = [
  {
    label: "今日命中热点",
    value: "18",
    delta: "+6 vs 昨日",
    tone: "positive"
  },
  {
    label: "待审核热点包",
    value: "7",
    delta: "3 个高优先级",
    tone: "warning"
  },
  {
    label: "本周已产出内容",
    value: "54",
    delta: "16 条观点向",
    tone: "positive"
  },
  {
    label: "模型平均生成时长",
    value: "11 分 20 秒",
    delta: "快反档已达标",
    tone: "neutral"
  }
];

export const brandStrategyPack: BrandStrategyPack = {
  id: "brand-1",
  name: "SignalStack",
  slogan: "让 AI 团队更快跑到市场前面",
  sector: "AI / SaaS",
  audiences: ["市场负责人", "增长负责人", "产品营销团队"],
  positioning: [
    "帮助 AI 与 SaaS 品牌把分散信号转成连续对外传播",
    "强调规模化、时效性和品牌表达一致性"
  ],
  topics: ["AI 生产力", "品牌规模化传播", "热点快反", "B2B 内容系统"],
  tone: ["专业", "直接", "有判断", "不过度营销"],
  redLines: [
    "不虚构客户案例",
    "不碰瓷竞品",
    "不夸大模型能力",
    "行业新闻必须标明事实边界"
  ],
  competitors: ["HubSpot", "Jasper", "Writer", "自建内容团队"],
  recentMoves: [
    "上周发布了热点内容审核工作台 beta",
    "两周前在上海参加 AI 增长峰会",
    "本月发布品牌传播自动化白皮书"
  ],
  sources: [
    {
      label: "官网产品页",
      type: "website",
      freshness: "stable",
      value: "产品定位、功能和核心卖点"
    },
    {
      label: "公众号历史文章",
      type: "wechat-history",
      freshness: "stable",
      value: "过去 30 篇文章的观点与语气"
    },
    {
      label: "AI 增长峰会演讲稿",
      type: "event",
      freshness: "timely",
      value: "最近一个月高管对热点传播的公开观点"
    },
    {
      label: "本月媒体新闻稿",
      type: "press",
      freshness: "timely",
      value: "新功能与合作动态"
    }
  ]
};

export const hotspotSignals: HotspotSignal[] = [
  {
    id: "hotspot-1",
    title: "多家大模型厂商同时上线 Agent 工作流能力",
    summary:
      "行业在过去 12 小时内密集发布 Agent 工作流新能力，讨论点集中在落地效率和企业可控性。",
    kind: "industry",
    source: "行业媒体聚合",
    detectedAt: "2026-03-21 08:20",
    relevanceScore: 92,
    industryScore: 90,
    velocityScore: 85,
    riskScore: 28,
    recommendedAction: "ship-now",
    reasons: [
      "和品牌的 AI 传播自动化定位强相关",
      "适合借势讨论企业如何把 Agent 能力变成稳定产出"
    ]
  },
  {
    id: "hotspot-2",
    title: "某头部平台调整内容推荐权重，强调原创深度",
    summary:
      "平台算法开始降低同质化短内容曝光，增加对深度解读内容和原创表达的扶持力度。",
    kind: "mass",
    source: "平台公告 + 社媒发酵",
    detectedAt: "2026-03-21 09:05",
    relevanceScore: 84,
    industryScore: 78,
    velocityScore: 81,
    riskScore: 35,
    recommendedAction: "ship-now",
    reasons: [
      "直接影响品牌内容分发策略",
      "有利于输出 SignalStack 关于快反与观点并行的产品方法"
    ]
  },
  {
    id: "hotspot-3",
    title: "竞品发布热点营销 Copilot",
    summary:
      "竞品在发布会上展示了一套热点发现与文案生成助手，但未覆盖审核和品牌知识层。",
    kind: "brand",
    source: "竞品发布会",
    detectedAt: "2026-03-21 10:10",
    relevanceScore: 88,
    industryScore: 72,
    velocityScore: 68,
    riskScore: 46,
    recommendedAction: "watch",
    reasons: [
      "适合做产品对比视角，但需要严格控制竞品表述",
      "可转化为品牌差异化观点内容"
    ]
  }
];

export const hotspotPacks: HotspotPack[] = [
  {
    id: "pack-1",
    brandId: "brand-1",
    hotspotId: "hotspot-1",
    status: "pending",
    whyNow: "过去 12 小时行业发布密度异常高，讨论仍在上升。",
    whyUs: "品牌最近刚发布审核工作台 beta，可以自然接到“从 Agent 到可控传播”的观点。",
    reviewOwner: "品牌市场负责人",
    reviewNote: "",
    variants: [
      {
        id: "variant-1",
        track: "rapid-response",
        title: "Agent 爆发之后，品牌传播团队最先该补的不是模型，而是流程",
        angle: "抢速度，但不牺牲品牌控制权",
        platforms: ["xiaohongshu", "wechat"],
        format: "post",
        body:
          "今天大家都在聊 Agent 工作流，但对品牌团队来说，真正的分水岭不是谁先接模型，而是谁能把热点捕捉、内容策划、审核发布串成一条可复用链路。没有品牌策略层和审核层，再快也只是更快地产生噪音。",
        coverHook: "Agent 热起来了，品牌团队先别急着上",
        publishWindow: "10:30-11:00"
      },
      {
        id: "variant-2",
        track: "rapid-response",
        title: "大模型都在做 Agent，品牌内容为什么还是发不快",
        angle: "问题拆解式快评",
        platforms: ["video-channel", "douyin"],
        format: "video-script",
        body:
          "开头先抛问题：为什么模型更强了，内容团队还是追不上热点？接着点出三个断点，监测不连续、品牌知识分散、审核靠人肉。最后抛出结论：Agent 不是替代人，而是缩短热点到内容之间的链路。",
        coverHook: "模型更强了，为什么内容还发不快？",
        publishWindow: "11:30-12:00"
      },
      {
        id: "variant-3",
        track: "point-of-view",
        title: "企业级 Agent 进入实用期后，品牌传播系统要重做一遍",
        angle: "中短篇观点文",
        platforms: ["wechat"],
        format: "article",
        body:
          "企业采用 Agent 的下一步，不是再多接几个模型，而是把品牌策略包、热点引擎、内容生成和审核分层。品牌传播的价值正在从单次创意转向持续稳定输出，这才是 AI 进入运营系统的标志。",
        coverHook: "Agent 真进入实用期，品牌传播会先重构",
        publishWindow: "14:00-15:00"
      },
      {
        id: "variant-4",
        track: "point-of-view",
        title: "快反不该和深度内容对立，真正成熟的系统一定双轨运行",
        angle: "方法论输出",
        platforms: ["xiaohongshu", "video-channel"],
        format: "post",
        body:
          "市场团队经常被迫二选一，要么抢速度，要么做深度。更合理的方式是双引擎：先用快反抢窗口，再把高价值热点沉淀成观点内容。只有这样，热点才不会只换来一次性曝光。",
        coverHook: "别再把快反和深度内容对立起来",
        publishWindow: "19:00-20:00"
      }
    ]
  }
];
