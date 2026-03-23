import { getBrandStrategyPack, getHotspotSignals } from "@/lib/data";
import { decideModelRoute, runModelTask } from "@/lib/services/model-router";
import { getChinaHotspotRules, getChinaMarketPromptLines } from "@/lib/services/china-market";

export interface HotspotInsightResult {
  route: {
    provider: string;
    model: string;
    reason: string;
  };
  productFocus: string;
  connectionPoint: string;
  communicationStrategy: string;
  planningDirection: string;
  recommendedFormat: string;
  planningScore: string;
  planningComment: string;
  riskNote: string;
}

function extractSection(content: string, label: string) {
  const pattern = new RegExp(`${label}:([\\s\\S]*?)(?:\\n[A-Z_]+:|$)`);
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function sanitizeInsightText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/```(?:markdown|md|text|json)?\n?/gi, "")
    .replace(/```/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/(^|\n)\s*(\d+)\s*\/\s*/g, "$1$2. ")
    .replace(/\s*[—-]\s*(?=\*\*|[^\n])/g, "\n- ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildPrompt(input: {
  brandName: string;
  sector: string;
  topics: string[];
  positioning: string[];
  tone: string[];
  redLines: string[];
  recentMoves: string[];
  title: string;
  summary: string;
  kind: string;
  source: string;
  relevanceScore: number;
  industryScore: number;
  velocityScore: number;
  riskScore: number;
  reasons: string[];
}) {
  return [
    "你是中国市场的企业品牌策略顾问，服务对象是 WPS 365 / WPS AI 这类办公与 AI 产品团队。",
    "任务：仅针对当前这 1 条热点，输出一版可执行、可审核、可落地的传播策划。",
    "硬性要求：必须给出可执行路径，不允许只给否定结论；即使相关度偏弱，也要提供“借势议题 + 品牌方法”的最小可行方案。",
    "可使用的结合路径：用户场景、办公流程、组织协同、AI提效、内容方法、行业观察、品牌态度表达。",
    "表达要求：专业、克制、结构化，避免口语化和空泛表述。",
    `品牌: ${input.brandName}`,
    `行业: ${input.sector}`,
    `品牌主题: ${input.topics.join("、")}`,
    `品牌定位: ${input.positioning.join("；")}`,
    `品牌语气: ${input.tone.join(" / ")}`,
    `品牌禁区: ${input.redLines.join("；")}`,
    `近期动态: ${input.recentMoves.join("；") || "暂无"}`,
    `热点标题: ${input.title}`,
    `热点摘要: ${input.summary}`,
    `热点类型: ${input.kind}`,
    `热点来源: ${input.source}`,
    `相关性分: ${input.relevanceScore}`,
    `行业性分: ${input.industryScore}`,
    `传播速度分: ${input.velocityScore}`,
    `风险分: ${input.riskScore}`,
    `已有判断: ${input.reasons.join("；") || "暂无"}`,
    "中国市场要求:",
    ...getChinaMarketPromptLines().map((line) => `- ${line}`),
    "热点判断要求:",
    ...getChinaHotspotRules().map((line) => `- ${line}`),
    "请输出以下固定结构：",
    "PRODUCT_FOCUS: 只能填 WPS AI / WPS 365 / 两者结合",
    "CONNECTION_POINT: 用 1-2 句话说明这条热点最适合如何转进 WPS AI / WPS 365 语境，不允许输出无法结合",
    "COMMUNICATION_STRATEGY: 明确传播打法，说明适合快反 / 观点 / 组合拳，以及语气和主张",
    "PLANNING_DIRECTION: 必须给出 3 个具体策划切口，写成一段中文，用 1 / 2 / 3 编号",
    "RECOMMENDED_FORMAT: 明确推荐更适合的小红书 / 公众号 / 视频号 / 抖音中的哪些平台，以及建议原因",
    "PLANNING_SCORE: 给这版策划打分，格式必须是 XX/100",
    "PLANNING_COMMENT: 用 1-2 句话评价这版策划为什么值得做，重点说可执行性",
    "RISK_NOTE: 最后一行简短说明是否有硬蹭、敏感、低相关等风险，但不能否定前面的策划",
    "要求：",
    "- 只分析这一条，不扩展到全局",
    "- 先做策划，再做评价",
    "- 如果更偏 WPS AI，就讲 AI 助手、写作、知识、智能协同",
    "- 如果更偏 WPS 365，就讲组织协同、文档、会议、流程、企业办公入口",
    "- 如果结合点偏弱，就把策划做成“借势议题 + 品牌方法论”，但仍然要给出 3 个切口",
    "- 输出必须简洁，方便直接放在热点详情里",
    "- 每条建议都要有“动作词”，例如：先定义、再验证、最后放大"
  ].join("\n");
}

function buildLocalFallback(input: {
  brandName: string;
  title: string;
  summary: string;
  relevanceScore: number;
  industryScore: number;
  velocityScore: number;
  riskScore: number;
}) {
  const prefersAi = /(ai|智能|大模型|写作|知识|agent|助手)/i.test(`${input.title} ${input.summary}`);
  const prefers365 = /(办公|协同|文档|会议|组织|企业服务|saas|软件)/i.test(
    `${input.title} ${input.summary}`
  );

  const productFocus = prefersAi && prefers365
    ? "两者结合"
    : prefersAi
      ? "WPS AI"
      : prefers365
        ? "WPS 365"
        : input.industryScore >= 60
          ? "WPS 365"
          : "两者结合";

  const connectionPoint =
    productFocus === "WPS AI"
      ? "建议将议题聚焦为“AI 如何提升团队判断效率与响应质量”，并落到智能写作、知识整理与判断辅助场景。"
      : productFocus === "WPS 365"
        ? "建议将议题聚焦为“企业如何在外部变化中维持协同效率”，并落到文档、会议、流程与组织协同场景。"
        : "建议采用“AI能力 + 组织协同”的双引擎路径：先用热点建立关注，再落到 WPS AI 与 WPS 365 的组合价值。";

  const communicationStrategy =
    input.velocityScore >= 80
      ? "建议采用“快反判断 + 方法论补充”的双段策略：先在窗口期给业务判断，再发布观点稿解释影响链路与执行方法。"
      : "建议采用观点优先策略：以热点为引子，重点输出企业办公、AI提效或组织协同的方法论结论。";

  const planningDirection = [
    "1. 先定义议题：从用户行为或行业变化切入，明确它对中国企业办公与传播节奏的影响。",
    productFocus === "WPS AI"
      ? "2. 再落产品：把切口落到 AI 写作、知识整理、会议纪要或智能协作，强调可量化提效。"
      : productFocus === "WPS 365"
        ? "2. 再落产品：把切口落到文档、协同、会议与流程一体化，强调组织级协同效率。"
        : "2. 再落产品：先讲 AI 能力，再讲其如何进入组织协同流程，避免停留在概念层。",
    "3. 最后收束主张：形成一句可传播结论，例如“变化越快，越需要统一入口与更快判断”。"
  ].join("\n");

  const recommendedFormat =
    input.industryScore >= 65
      ? "建议优先公众号 + 视频号：公众号承载完整判断链路，视频号用于观点口播放大；小红书可做摘要扩散。"
      : "建议优先小红书 + 抖音/视频号短内容：先用短判断验证反馈，再决定是否升级为长文深度稿。";

  const planningScore =
    input.relevanceScore >= 70
      ? "86/100"
      : input.industryScore >= 60
        ? "78/100"
        : "72/100";

  const planningComment =
    input.relevanceScore >= 70
      ? "策划可执行性较高，既能承接热点窗口，也能自然映射到品牌产品能力。"
      : "虽然不是强直连热点，但可通过用户场景与行业方法切入，形成稳健的借势表达。";

  const riskNote =
    input.riskScore >= 70 || input.relevanceScore < 55
      ? "风险偏高，执行时应降低事件叙述比重，把重点放在品牌方法与可验证产品场景。"
      : "风险可控，重点是避免脱离品牌真实能力，确保每个结论有业务场景支撑。";

  return {
    productFocus,
    connectionPoint,
    communicationStrategy,
    planningDirection,
    recommendedFormat,
    planningScore,
    planningComment,
    riskNote
  };
}

export async function generateHotspotInsight(hotspotId: string): Promise<HotspotInsightResult> {
  const [brand, hotspots] = await Promise.all([getBrandStrategyPack(), getHotspotSignals()]);
  const hotspot = hotspots.find((item) => item.id === hotspotId);

  if (!hotspot) {
    throw new Error("找不到这条热点");
  }

  const route = await decideModelRoute("hotspot-analysis", { feature: "hotspot-insight" });
  const fallback = buildLocalFallback({
    brandName: brand.name,
    title: hotspot.title,
    summary: hotspot.summary,
    relevanceScore: hotspot.relevanceScore,
    industryScore: hotspot.industryScore,
    velocityScore: hotspot.velocityScore,
    riskScore: hotspot.riskScore
  });

  if (route.provider === "mock") {
    return {
      route,
      ...fallback
    };
  }

  try {
    const output = await runModelTask(
      "hotspot-analysis",
      buildPrompt({
        brandName: brand.name,
        sector: brand.sector,
        topics: brand.topics,
        positioning: brand.positioning,
        tone: brand.tone,
        redLines: brand.redLines,
        recentMoves: brand.recentMoves,
        title: hotspot.title,
        summary: hotspot.summary,
        kind: hotspot.kind,
        source: hotspot.source,
        relevanceScore: hotspot.relevanceScore,
        industryScore: hotspot.industryScore,
        velocityScore: hotspot.velocityScore,
        riskScore: hotspot.riskScore,
        reasons: hotspot.reasons
      }),
      { feature: "hotspot-insight" }
    );

    return {
      route,
      productFocus: sanitizeInsightText(extractSection(output, "PRODUCT_FOCUS") || fallback.productFocus),
      connectionPoint: sanitizeInsightText(extractSection(output, "CONNECTION_POINT") || fallback.connectionPoint),
      communicationStrategy: sanitizeInsightText(extractSection(output, "COMMUNICATION_STRATEGY") || fallback.communicationStrategy),
      planningDirection: sanitizeInsightText(extractSection(output, "PLANNING_DIRECTION") || fallback.planningDirection),
      recommendedFormat: sanitizeInsightText(extractSection(output, "RECOMMENDED_FORMAT") || fallback.recommendedFormat),
      planningScore: sanitizeInsightText(extractSection(output, "PLANNING_SCORE") || fallback.planningScore),
      planningComment: sanitizeInsightText(extractSection(output, "PLANNING_COMMENT") || fallback.planningComment),
      riskNote: sanitizeInsightText(extractSection(output, "RISK_NOTE") || fallback.riskNote)
    };
  } catch (error) {
    return {
      route,
      ...fallback,
      riskNote:
        error instanceof Error
          ? `${fallback.riskNote} 当前 AI 深挖暂不可用，已回退为本地建议：${error.message}`
          : fallback.riskNote
    };
  }
}
