import { decideModelRoute, runModelTask } from "@/lib/services/model-router";
import {
  countVisibleChars,
  enforceBodyMinimumWithContext,
  resolveMinimumCharsForLabels
} from "@/lib/services/content-quality";

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
  const opener = `${input.brandName} 这次不打算泛泛跟热点，而是把重点放在 ${input.whyNow || "当前时机"}。`;
  const relevance = input.whyUs
    ? `更关键的是，这件事和品牌相关，因为 ${input.whyUs}。`
    : `更关键的是，这次表达要回到品牌自己的业务语境。`;
  const execution =
    input.trackLabel === "快反"
      ? "这版建议保留快反节奏，开头先给判断，中段讲清影响，结尾落到品牌动作。"
      : "这版建议保留观点结构，先讲变化，再讲判断，最后落到品牌方法。";
  const fallbackExtension = `为了达到平台主流内容深度，建议至少补齐这三段：1）行业变化与受影响角色；2）品牌判断依据与边界；3）本周可执行动作清单。`;

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
    changeSummary: `AI 暂不可用，已先给出本地改稿建议。当前目标最低长度约 ${minimumChars} 字，建议继续补齐论证段落。`
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
