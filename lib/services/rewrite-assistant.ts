import { decideModelRoute, runModelTask } from "@/lib/services/model-router";

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

function buildPrompt(input: RewriteVariantInput) {
  return [
    "你是中国企业品牌内容团队的资深编辑。",
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
    `模式: ${input.mode === "direct" ? "直接改正文" : "建议模式"}`,
    "请输出以下结构：",
    "CHANGE_SUMMARY: 用 1-2 句话说明这次改动重点",
    "TITLE: 改写后的标题",
    "BODY: 改写后的正文",
    "要求：",
    "- 更符合中文品牌内容表达",
    "- 更好读、更好执行，不要空泛",
    "- 保留原文有效信息",
    "- 不要输出额外解释",
    "",
    "原始标题:",
    input.title,
    "",
    "原始正文:",
    input.body
  ].join("\n");
}

export async function rewriteVariantDraft(
  input: RewriteVariantInput
): Promise<RewriteVariantResult> {
  const route = decideModelRoute("copy-polish");

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

  const output = await runModelTask("copy-polish", buildPrompt(input));
  const nextTitle = extractSection(output, "TITLE") || input.title;
  const nextBody = extractSection(output, "BODY") || input.body;
  const changeSummary =
    extractSection(output, "CHANGE_SUMMARY") || "已根据本轮要求生成改稿建议。";

  return {
    mode: input.mode,
    applied: input.mode === "direct",
    route,
    nextTitle,
    nextBody,
    changeSummary
  };
}
