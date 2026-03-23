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
    "你是中国企业品牌传播策划顾问，服务对象是 WPS 365 / WPS AI 这类办公与 AI 产品团队。",
    "任务：只针对当前这 1 条热点，必须先产出一版可执行的传播策划，再给补充评价。",
    "硬性要求：不能只说相关性弱、不能只说不建议硬蹭、不能拒绝策划。哪怕结合点不强，也必须给出最小可行策划路径。",
    "你可以通过以下方式建立结合：用户场景、办公流程、组织协同、AI提效、内容方法、行业观察、品牌态度表达。",
    "不要泛泛而谈，不要写大词，不要输出拒绝式判断。",
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
    "- 输出必须简洁，方便直接放在热点详情里"
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
      ? `可把这条热点转成“AI 如何帮助团队更快理解、整理和响应外部变化”的议题，切到智能写作、知识整理和判断辅助。`
      : productFocus === "WPS 365"
        ? `可把这条热点转成“企业如何在外部变化中保持协同效率”的议题，切到文档、会议、流程和组织协同场景。`
        : `可先用热点打开讨论，再把表达落到“AI能力 + 组织协同”双结合，形成 WPS AI 与 WPS 365 的组合策划。`;

  const communicationStrategy =
    input.velocityScore >= 80
      ? "建议先发一条快反判断抢窗口，再补一条观点内容把方法讲透，整体语气要专业、克制、像业务团队在给判断。"
      : "建议直接做观点型内容，把热点当成引子，把重点落到企业办公、AI提效或组织协同的方法输出。";

  const planningDirection = [
    "1. 从这条热点背后的用户行为或行业变化切入，讲它对中国企业办公和传播节奏意味着什么。",
    productFocus === "WPS AI"
      ? "2. 把切口落到 AI 写作、知识整理、会议纪要或智能协作，强调真实提效价值。"
      : productFocus === "WPS 365"
        ? "2. 把切口落到文档、协同、会议和流程一体化，强调组织级协同效率。"
        : "2. 先讲 AI 能力，再讲它如何进入组织协同流程，避免只讲概念。",
    "3. 把内容收束到一个可传播主张，例如“变化越快，越需要统一入口和更快判断”，形成品牌表达出口。"
  ].join("\n");

  const recommendedFormat =
    input.industryScore >= 65
      ? "优先公众号 + 视频号，适合讲清判断、影响和方法；如要做短内容，可再补一条小红书。"
      : "优先小红书 + 抖音 / 视频号短内容，用短判断测试反馈，再决定要不要继续放大。";

  const planningScore =
    input.relevanceScore >= 70
      ? "86/100"
      : input.industryScore >= 60
        ? "78/100"
        : "72/100";

  const planningComment =
    input.relevanceScore >= 70
      ? "策划可执行性较高，既能借热点窗口，又能自然带出品牌产品能力。"
      : "虽然不是强直连热点，但策划仍可通过用户场景和行业方法切入，适合做借势型表达。";

  const riskNote =
    input.riskScore >= 70 || input.relevanceScore < 55
      ? "风险偏高，执行时要避免把热点本身讲得过重，重点仍应落在品牌方法和产品场景。"
      : "风险可控，重点是不要脱离品牌真实能力，不要泛泛追热点。";

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
