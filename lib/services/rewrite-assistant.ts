import { decideModelRoute, runModelTask } from "@/lib/services/model-router";
import {
  countVisibleChars,
  enforceBodyMinimumWithContext,
  resolveMinimumCharsForLabels
} from "@/lib/services/content-quality";
import { getPublishableDraftRuleLines, getVariationRuleLines } from "@/lib/services/publishable-content-rules";

export interface RewriteVariantInput {
  title: string;
  body: string;
  angle: string;
  platformLabel: string;
  trackLabel: string;
  whyNow: string;
  whyUs: string;
  brandName: string;
  brandTone: string[];
  redLines: string[];
  userRequest: string;
  mode: "direct" | "suggest";
}

export interface RewriteVariantResult {
  mode: "direct" | "suggest";
  applied: boolean;
  route: {
    provider: string;
    model: string;
    reason: string;
  };
  nextTitle: string;
  nextBody: string;
  changeSummary: string;
}

function extractSection(content: string, label: string) {
  const pattern = new RegExp(`${label}:([\\s\\S]*?)(?:\\n[A-Z_]+:|$)`);
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function resolveMinimumChars(input: RewriteVariantInput): number {
  return resolveMinimumCharsForLabels({
    platformLabel: input.platformLabel,
    trackLabel: input.trackLabel
  });
}

function buildPrompt(input: RewriteVariantInput) {
  const minimumChars = resolveMinimumChars(input);
  const currentChars = countVisibleChars(input.body);

  return [
    "你是中国头部品牌内容团队的资深主编。",
    "请基于已有草稿进行改写，不要脱离原文，不要虚构事实。",
    `品牌: ${input.brandName}`,
    `平台: ${input.platformLabel}`,
    `内容类型: ${input.trackLabel}`,
    `建议角度: ${input.angle}`,
    `为什么现在做: ${input.whyNow}`,
    `为什么和品牌相关: ${input.whyUs}`,
    `品牌语气: ${input.brandTone.join(" / ")}`,
    `品牌禁区: ${input.redLines.join("；")}`,
    `用户要求: ${input.userRequest}`,
    `当前正文长度: ${currentChars} 字`,
    `目标最低长度: ${minimumChars} 字`,
    `模式: ${input.mode === "direct" ? "直接改正文" : "建议模式"}`,
    "请输出以下结构：",
    "CHANGE_SUMMARY: 用 1-2 句话说明这次改动重点",
    "TITLE: 改写后的标题",
    "BODY: 改写后的正文",
    "要求：",
    "- 必须是平台专家级文风：有观点、有推理、有动作，不要学生作文腔。",
    "- 更符合中文品牌内容表达，不要英文腔。",
    "- 更好读、更好执行，不要空泛。",
    ...getPublishableDraftRuleLines().map((line) => `- ${line}`),
    ...getVariationRuleLines().map((line) => `- ${line}`),
    "- 如果原稿像在教品牌怎么做营销、写内部策划说明或任务拆解，请改成真正面向外部读者的成稿。",
    "- 不要机械套“先结论、再三点、再动作”的固定结构，除非这轮请求明确要求。",
    "- 保留原文有效信息",
    `- BODY 至少 ${minimumChars} 字，若原稿不足请补齐关键论证与执行动作。`,
    "- 不要输出额外解释",
    "",
    "原始标题:",
    input.title,
    "",
    "原始正文:",
    input.body
  ].join("\n");
}

function tightenSentence(value: string) {
  return value.replace(/\s+/g, " ").replace(/，/g, "，").trim();
}

function buildLocalRewriteFallback(input: RewriteVariantInput): {
  nextTitle: string;
  nextBody: string;
  changeSummary: string;
} {
  const minimumChars = resolveMinimumChars(input);
  const request = input.userRequest.trim();
  const opener = `这件事真正值得说的，不是表层热度，而是 ${input.whyNow || "它已经开始影响当下判断"}。`;
  const relevance = input.whyUs
    ? `更关键的是，它之所以值得这个品牌出来讲，是因为 ${input.whyUs}。`
    : "更关键的是，这次表达要回到品牌自己的真实业务语境。";
  const execution =
    input.trackLabel === "快反"
      ? "这版建议保留快反节奏，但要更像直接可发的判断稿，不要写成内部说明。"
      : "这版建议保留观点稿深度，但要更像成熟文章，不要写成方法讲解。";
  const fallbackExtension =
    "为了达到平台主流内容深度，建议补齐三类信息：变化先落到谁、旧做法为什么开始失效、今天最该先动哪一步。";

  const nextTitle = tightenSentence(
    [
      input.title.replace(/[。！!？?]+$/g, ""),
      request ? `｜${request.slice(0, 16)}` : "｜品牌判断版"
    ].join("")
  );

  const nextBody = [
    opener,
    input.body,
    relevance,
    execution,
    fallbackExtension,
    request ? `本轮额外要求：${request}。` : null
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    nextTitle,
    nextBody,
    changeSummary: `AI 暂不可用，已先把稿子往“可直接发布成稿”方向拉回。当前目标最低长度约 ${minimumChars} 字，建议继续补齐论证段落。`
  };
}

export async function rewriteVariantDraft(
  input: RewriteVariantInput
): Promise<RewriteVariantResult> {
  const route = await decideModelRoute("copy-polish", { feature: "rewrite" });

  if (route.provider === "mock") {
    return {
      mode: input.mode,
      applied: false,
      route,
      nextTitle: input.title,
      nextBody: input.body,
      changeSummary: "当前未接入真实模型，已记录这轮改稿需求。接入模型后可直接回写正文。"
    };
  }

  let output: string;

  try {
    output = await runModelTask("copy-polish", buildPrompt(input), { feature: "rewrite" });
  } catch (error) {
    const fallback = buildLocalRewriteFallback(input);
    const minimumChars = resolveMinimumChars(input);
    const enhancedFallback = enforceBodyMinimumWithContext({
      body: fallback.nextBody,
      title: fallback.nextTitle,
      angle: input.angle,
      whyNow: input.whyNow,
      whyUs: input.whyUs,
      minimumChars,
      platformHint: input.platformLabel,
      trackHint: input.trackLabel.includes("观点") ? "point-of-view" : "rapid-response"
    });

    return {
      mode: input.mode,
      applied: input.mode === "direct",
      route,
      nextTitle: fallback.nextTitle,
      nextBody: enhancedFallback.body,
      changeSummary:
        error instanceof Error
          ? `${fallback.changeSummary} 原因：${error.message}`
          : fallback.changeSummary
    };
  }

  const nextTitle = extractSection(output, "TITLE") || input.title;
  const nextBodyRaw = extractSection(output, "BODY") || input.body;
  const minimumChars = resolveMinimumChars(input);
  const nextBodyEnhanced = enforceBodyMinimumWithContext({
    body: nextBodyRaw,
    title: nextTitle,
    angle: input.angle,
    whyNow: input.whyNow,
    whyUs: input.whyUs,
    minimumChars,
    platformHint: input.platformLabel,
    trackHint: input.trackLabel.includes("观点") ? "point-of-view" : "rapid-response"
  });
  const nextBody = nextBodyEnhanced.body;
  const changeSummary =
    extractSection(output, "CHANGE_SUMMARY") || "已根据本轮要求生成改稿建议。";
  const summaryWithLength =
    nextBodyEnhanced.wasExpanded
      ? `${changeSummary} 已自动补齐至不少于 ${minimumChars} 字。`
      : changeSummary;

  return {
    mode: input.mode,
    applied: input.mode === "direct",
    route,
    nextTitle,
    nextBody,
    changeSummary: summaryWithLength
  };
}
