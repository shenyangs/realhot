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
  name: "WPS 365",
  slogan: "一站式 AI 办公",
  sector: "办公软件 / 企业协同 / AI 办公",
  audiences: ["企业管理者", "信息化负责人", "行政与协同办公团队"],
  positioning: [
    "面向中国企业提供文档、协作、会议、邮箱等一体化办公体验",
    "强调 AI 能力、协同效率与企业级安全管理并行"
  ],
  topics: ["AI 办公", "组织协同", "文档与知识管理", "企业数字化"],
  tone: ["专业", "清晰", "可信", "不过度夸张"],
  redLines: [
    "不夸大 AI 效果，不承诺替代人工决策",
    "不虚构客户案例和政企落地成果",
    "不直接贬低竞品，避免碰瓷式对比",
    "涉及数据安全与隐私时必须表述谨慎"
  ],
  competitors: ["飞书", "钉钉", "企业微信", "Microsoft 365"],
  recentMoves: [
    "最近持续强化 AI 办公相关对外表达",
    "近期围绕企业协同和组织效率展开传播",
    "最近一个月适合补充产品更新、客户案例和活动信息"
  ],
  sources: [
    {
      label: "官网产品页",
      type: "website",
      freshness: "stable",
      value: "WPS 365 的产品定位、AI 办公能力与一体化协同卖点"
    },
    {
      label: "公众号历史文章",
      type: "wechat-history",
      freshness: "stable",
      value: "历史内容中的企业办公、协同和 AI 表达方式"
    },
    {
      label: "近期行业活动资料",
      type: "event",
      freshness: "timely",
      value: "最近一个月活动、论坛或发布会素材"
    },
    {
      label: "本月媒体新闻稿",
      type: "press",
      freshness: "timely",
      value: "近期媒体稿、产品更新和合作动态"
    }
  ]
};

export const hotspotSignals: HotspotSignal[] = [
  {
    id: "hotspot-1",
    title: "多家企业开始把 AI 办公助手接入日常文档与协同流程",
    summary:
      "过去 24 小时内，围绕 AI 办公、智能写作、会议纪要和知识整理的讨论明显升温，企业关注点集中在落地效率与可控性。",
    kind: "industry",
    source: "行业媒体 + 企业服务讨论",
    detectedAt: "2026-03-21 08:20",
    relevanceScore: 92,
    industryScore: 91,
    velocityScore: 85,
    riskScore: 28,
    recommendedAction: "ship-now",
    reasons: [
      "和 WPS 365 的 AI 办公定位高度相关",
      "适合借势讨论企业真正需要的是可落地、可协作、可管理的 AI 办公"
    ]
  },
  {
    id: "hotspot-2",
    title: "越来越多企业把协同、会议、邮箱、文档放到一体化办公入口",
    summary:
      "市场讨论从单点工具效率，转向组织级协同体验，关注入口统一、流程衔接和多角色协作成本。",
    kind: "industry",
    source: "企业服务观察 + 社媒发酵",
    detectedAt: "2026-03-21 09:05",
    relevanceScore: 89,
    industryScore: 87,
    velocityScore: 81,
    riskScore: 24,
    recommendedAction: "ship-now",
    reasons: [
      "直接对应 WPS 365 的一体化办公价值主张",
      "适合讲清楚企业为什么要从单点提效走向整套协同体验"
    ]
  },
  {
    id: "hotspot-3",
    title: "企业用户再次把数据权限、内容沉淀和办公安全放到采购前排",
    summary:
      "在 AI 办公热度提升的同时，市场对数据权限、文件管理、组织边界和安全合规的讨论重新升温。",
    kind: "brand",
    source: "行业讨论 + 竞品动态",
    detectedAt: "2026-03-21 10:10",
    relevanceScore: 88,
    industryScore: 72,
    velocityScore: 68,
    riskScore: 46,
    recommendedAction: "watch",
    reasons: [
      "适合转成企业办公安全与治理视角的内容",
      "能帮助 WPS 365 强化企业级能力，而不是只讲表层 AI 功能"
    ]
  }
];

export const hotspotPacks: HotspotPack[] = [
  {
    id: "pack-1",
    brandId: "brand-1",
    hotspotId: "hotspot-1",
    status: "pending",
    whyNow: "过去 24 小时里，AI 办公从概念讨论转向真实工作流场景，热度还在继续上升。",
    whyUs: "WPS 365 本身就在 AI 办公和组织协同场景里，适合把热点讲成具体办公价值，而不是泛泛追热点。",
    reviewOwner: "品牌传播负责人",
    reviewNote: "",
    variants: [
      {
        id: "variant-1",
        track: "rapid-response",
        title: "AI 办公热起来之后，企业真正要补的不是新概念，而是完整协同链路",
        angle: "抢热点，但落在真实办公场景",
        platforms: ["xiaohongshu", "wechat"],
        format: "post",
        body:
          "大家都在聊 AI 办公，但对企业来说，真正决定体验的不是单点功能，而是文档、协作、会议、沟通能不能真正连起来。热点之下，用户更关心的不是多一个按钮，而是能不能少切几个系统、少走几段流程。",
        coverHook: "AI 办公火了，企业先别只看新功能",
        publishWindow: "10:30-11:00"
      },
      {
        id: "variant-2",
        track: "rapid-response",
        title: "为什么大家都在讲 AI 办公，很多团队却还没真正提效",
        angle: "问题拆解式短视频口播",
        platforms: ["video-channel", "douyin"],
        format: "video-script",
        body:
          "开头直接抛问题：为什么 AI 办公工具越来越多，团队协同还是很累？第二段讲清三个断点，入口分散、协作断层、内容沉淀不连续。最后收束一句：真正有效的 AI 办公，不是功能堆叠，而是把日常工作流接起来。",
        coverHook: "工具越来越多，为什么办公还没变轻？",
        publishWindow: "11:30-12:00"
      },
      {
        id: "variant-3",
        track: "point-of-view",
        title: "当 AI 办公进入实用期，企业会重新定义什么叫一体化协同",
        angle: "公众号观点文",
        platforms: ["wechat"],
        format: "article",
        body:
          "如果只把 AI 办公理解成写作、总结和生成，那还只是第一步。更值得关注的是，企业会开始重新审视文档、会议、沟通、知识沉淀和权限管理之间的关系。一体化办公的价值，不在于把工具放在一起，而在于让组织协同真正连续起来。",
        coverHook: "AI 办公进入实用期后，协同会先重做",
        publishWindow: "14:00-15:00"
      },
      {
        id: "variant-4",
        track: "point-of-view",
        title: "别把 AI 办公只理解成提效，它也在重塑组织的协同方式",
        angle: "方法论输出",
        platforms: ["xiaohongshu", "video-channel"],
        format: "post",
        body:
          "很多团队讲 AI 办公时只盯着效率提升，但真正重要的变化，是组织协同方式开始重排。谁来创建内容，谁来共享知识，谁来保证权限边界，都会被重新定义。真正成熟的产品，不只是让个人更快，而是让团队协同更顺。",
        coverHook: "AI 办公不只是提效，它在重塑协同",
        publishWindow: "19:00-20:00"
      }
    ]
  }
];
