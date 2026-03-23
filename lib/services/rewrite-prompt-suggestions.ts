import { decideModelRoute, runModelTask } from "@/lib/services/model-router";
import { countVisibleChars } from "@/lib/services/content-quality";

export interface RewritePromptSuggestionsInput {
  title: string;
  body: string;
  coverHook?: string;
  angle: string;
  platformLabel: string;
  trackLabel: string;
  whyNow: string;
  whyUs: string;
  brandName: string;
  brandTone: string[];
  redLines: string[];
}

export interface RewritePromptSuggestionsResult {
  prompts: string[];
  summary: string;
  route: {
    provider: string;
    model: string;
    reason: string;
  };
}

function extractSection(content: string, label: string) {
  const pattern = new RegExp(`${label}:([\\s\\S]*?)(?:\\n[A-Z_]+:|$)`);
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function normalizePromptItem(value: string) {
  return value.replace(/^[-*0-9.\s]+/, "").replace(/\s+/g, " ").trim();
}

function dedupePrompts(prompts: string[]) {
  return prompts.filter((item, index) => prompts.indexOf(item) === index);
}

function buildFallbackPrompts(input: RewritePromptSuggestionsInput) {
  const prompts = [
    "开头更抓人一点",
    input.trackLabel.includes("观点")
      ? "把核心结论提前，开头先亮观点"
      : "把时效判断提前，先讲现在为什么值得看",
    "增加行业判断，不要像新闻摘要"
  ];

  if (!input.coverHook?.trim()) {
    prompts.push("补一个更抓人的封面钩子");
  } else {
    prompts.push("把封面钩子改得更像可传播的第一句话");
  }

  if (input.platformLabel.includes("小红书")) {
    prompts.push("改得更像小红书会收藏的经验总结");
    prompts.push("多一点分点表达，读起来更适合图文浏览");
  }

  if (input.platformLabel.includes("公众号")) {
    prompts.push("拉长论证层次，更像一篇完整观点文");
    prompts.push("增加一段过渡，让行文更像公众号文章");
  }

  if (input.platformLabel.includes("视频号") || input.platformLabel.includes("抖音")) {
    prompts.push("压缩成更适合短视频口播的表达");
    prompts.push("多用短句和停顿感，读起来更像真人在说");
  }

  if (countVisibleChars(input.body) >= 280) {
    prompts.push("删掉重复表达，压缩到更利落");
  } else {
    prompts.push("补一段关键判断，让内容更完整");
  }

  if (/创始人|CEO|负责人/.test(input.angle)) {
    prompts.push("更像创始人口吻");
  } else {
    prompts.push("切成更可信的专业口吻");
  }

  const source = `${input.title} ${input.body} ${input.angle}`;

  if (/AI|人工智能/i.test(source)) {
    prompts.push("把 AI 相关判断讲得更具体，不要停留在泛概念");
  }

  if (/办公|协同|组织|团队/.test(source)) {
    prompts.push("把组织协同场景写得更具体，补清真实工作流里的断点");
  }

  if (/企业|B端|客户|采购/.test(source)) {
    prompts.push("加强 B 端决策视角，补上客户在意的采购和落地判断");
  }

  if (/安全|权限|合规|治理/.test(source)) {
    prompts.push("把安全、权限和治理边界讲清楚，不要只讲效率");
  }

  return {
    prompts: dedupePrompts(prompts).slice(0, 8),
    summary: "当前未接入可用模型，已按平台、赛道和稿件主题生成本地改稿建议。"
  };
}

function buildPrompt(input: RewritePromptSuggestionsInput) {
  return [
    "你是中国品牌内容团队的总编，请根据当前稿件判断最值得点击的改稿提示词。",
    "这些提示词会直接显示成按钮，供编辑一键选择。",
    "请只给当前稿件真正需要的修改方向，不要给空泛套路。",
    `品牌: ${input.brandName}`,
    `平台: ${input.platformLabel}`,
    `内容类型: ${input.trackLabel}`,
    `建议角度: ${input.angle}`,
    `为什么现在做: ${input.whyNow}`,
    `为什么和品牌相关: ${input.whyUs}`,
    `品牌语气: ${input.brandTone.join(" / ") || "未设置"}`,
    `品牌禁区: ${input.redLines.join("；") || "未设置"}`,
    "",
    "输出要求：",
    "- 输出 5 到 8 条改稿提示",
    "- 每条 8 到 24 个字，适合按钮文案",
    "- 用中文祈使句，直接可执行",
    "- 提示要覆盖结构、口吻、观点、信息密度、钩子、风险边界中的关键问题",
    "- 不要重复，不要只换近义词",
    "- 不能出现序号解释、长句分析或空泛词",
    "",
    "请严格输出下面结构：",
    "SUMMARY: 用一句话概括这篇稿子当前最需要先改什么",
    "PROMPTS:",
    "- 提示 1",
    "- 提示 2",
    "",
    "当前标题:",
    input.title,
    "",
    "当前封面钩子:",
    input.coverHook?.trim() || "未填写",
    "",
    "当前正文:",
    input.body
  ].join("\n");
}

function parsePromptItems(raw: string) {
  return dedupePrompts(
    raw
      .split("\n")
      .map((item) => normalizePromptItem(item))
      .filter(Boolean)
  ).slice(0, 8);
}

export async function generateRewritePromptSuggestions(
  input: RewritePromptSuggestionsInput
): Promise<RewritePromptSuggestionsResult> {
  const route = await decideModelRoute("copy-polish", { feature: "rewrite-prompts" });

  if (route.provider === "mock") {
    const fallback = buildFallbackPrompts(input);

    return {
      ...fallback,
      route
    };
  }

  try {
    const output = await runModelTask("copy-polish", buildPrompt(input), {
      feature: "rewrite-prompts"
    });
    const prompts = parsePromptItems(extractSection(output, "PROMPTS"));
    const summary = extractSection(output, "SUMMARY") || "已根据当前稿件生成本轮改稿提示。";

    if (prompts.length === 0) {
      const fallback = buildFallbackPrompts(input);

      return {
        prompts: fallback.prompts,
        summary,
        route
      };
    }

    return {
      prompts,
      summary,
      route
    };
  } catch (error) {
    const fallback = buildFallbackPrompts(input);

    return {
      prompts: fallback.prompts,
      summary:
        error instanceof Error
          ? `${fallback.summary} 原因：${error.message}`
          : fallback.summary,
      route
    };
  }
}
