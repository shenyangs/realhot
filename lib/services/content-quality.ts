import { ContentTrack, ContentVariant, Platform } from "@/lib/domain/types";

interface EnsureBodyInput {
  body: string;
  title: string;
  angle?: string;
  whyNow?: string;
  whyUs?: string;
  minimumChars: number;
  formatHint?: ContentVariant["format"];
  trackHint?: ContentTrack;
  platformHint?: string;
}

function cleanLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanParagraphs(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, list) => Boolean(line) || (index > 0 && Boolean(list[index - 1])))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fallback(value: string | undefined, backup: string): string {
  const cleaned = cleanLine(value ?? "");
  return cleaned || backup;
}

function isVideoLike(input: EnsureBodyInput): boolean {
  if (input.formatHint === "video-script") {
    return true;
  }

  return /视频号|抖音|口播|video/i.test(input.platformHint ?? "");
}

function isArticleLike(input: EnsureBodyInput): boolean {
  if (input.formatHint === "article") {
    return true;
  }

  if (input.minimumChars >= 900) {
    return true;
  }

  return /公众号|长文/i.test(input.platformHint ?? "");
}

function buildVideoBlocks(input: EnsureBodyInput): string[] {
  const title = fallback(input.title, "这条热点的关键变化");
  const angle = fallback(input.angle, "结构化判断");
  const whyNow = fallback(input.whyNow, "行业讨论窗口正在快速收敛");
  const whyUs = fallback(input.whyUs, "这件事和品牌业务场景高度相关");

  return [
    ["【开场钩子】", `先说结论：${title} 不是资讯补读，而是今天必须给判断的业务议题。`].join("\n"),
    ["【背景交代】", `为什么现在要讲？因为 ${whyNow}，用户期待的是“怎么做”，不是“发生了什么”。`].join("\n"),
    ["【核心判断】", `这版口播按「${angle}」展开：先定性变化，再拆影响链路，最后给出动作优先级。`].join("\n"),
    ["【动作建议】", "今天先做三步：1）明确受影响角色；2）给一个可执行动作；3）补一句风险边界，避免误读。"].join(
      "\n"
    ),
    ["【品牌相关】", `这件事和我们相关，不是因为热点热，而是因为 ${whyUs}。`].join("\n"),
    ["【结尾金句】", "速度让你进场，判断让你留下，执行让你被信任。"].join("\n")
  ];
}

function buildArticleBlocks(input: EnsureBodyInput): string[] {
  const title = fallback(input.title, "这条变化的长期影响");
  const angle = fallback(input.angle, "方法论视角");
  const whyNow = fallback(input.whyNow, "当下讨论正在从信息层上升到决策层");
  const whyUs = fallback(input.whyUs, "品牌可在这个议题上给出可执行判断");

  return [
    `先说结论：围绕「${title}」的讨论，真正值得写的不是事件表层，而是组织决策逻辑正在重排。`,
    `为什么是现在？因为 ${whyNow}。窗口期内若只做新闻转述，内容很快失效；若能给出判断与动作，才会形成长期认知资产。`,
    `从「${angle}」看，至少有三层影响。第一层是市场预期变化，第二层是内部协同成本变化，第三层是品牌信任门槛变化。`,
    "执行上建议先落三步：先定义影响对象，再明确优先动作，最后给时间边界和验收标准，避免内容停留在口号层。",
    `为什么和品牌相关？因为 ${whyUs}。这意味着我们不是“借题表达”，而是在公开场景里展示专业判断与执行方法。`,
    "最后收束：热点只能带来注意力，方法才能沉淀为复利。"
  ];
}

function buildPostBlocks(input: EnsureBodyInput): string[] {
  const title = fallback(input.title, "这次变化值得跟进");
  const angle = fallback(input.angle, "业务判断");
  const whyNow = fallback(input.whyNow, "当前讨论窗口正在收紧");
  const whyUs = fallback(input.whyUs, "该议题与品牌业务链路高度相关");

  return [
    `核心判断：${title} 不该被写成“信息摘要”，而要写成“可执行判断”。`,
    `为什么现在说？因为 ${whyNow}。晚一天，讨论焦点就会被别的叙事带走。`,
    `从「${angle}」看，这次变化至少会影响目标用户认知、内部协同节奏和内容验收标准三个环节。`,
    "可执行动作建议：先给一句立场，再给两个影响点，最后给一个今天就能做的动作。",
    `为什么和品牌相关？因为 ${whyUs}。`,
    "补一句边界：不夸大、不绝对化，用事实和场景说服。"
  ];
}

export function countVisibleChars(value: string): number {
  return value.replace(/\s+/g, "").length;
}

export function resolveMinimumCharsForVariant(input: {
  format: ContentVariant["format"];
  track: ContentTrack;
  platforms: Platform[];
}): number {
  if (input.format === "article") {
    return 900;
  }

  if (input.format === "video-script" || input.platforms.includes("video-channel") || input.platforms.includes("douyin")) {
    return 420;
  }

  if (input.track === "point-of-view") {
    return 520;
  }

  return 260;
}

export function resolveMinimumCharsForLabels(input: {
  platformLabel: string;
  trackLabel: string;
}): number {
  if (input.platformLabel.includes("公众号")) {
    return 900;
  }

  if (input.platformLabel.includes("视频号") || input.platformLabel.includes("抖音")) {
    return 420;
  }

  if (input.trackLabel.includes("观点")) {
    return 520;
  }

  return 260;
}

export function enforceBodyMinimumWithContext(input: EnsureBodyInput): {
  body: string;
  wasExpanded: boolean;
  charCount: number;
} {
  const cleanedBody = cleanParagraphs(input.body);
  let nextBody = cleanedBody || `核心观点：${fallback(input.title, "这条内容的关键判断")}。`;

  if (countVisibleChars(nextBody) >= input.minimumChars) {
    return {
      body: nextBody,
      wasExpanded: false,
      charCount: countVisibleChars(nextBody)
    };
  }

  const blocks = isVideoLike(input)
    ? buildVideoBlocks(input)
    : isArticleLike(input)
      ? buildArticleBlocks(input)
      : buildPostBlocks(input);

  let index = 0;

  while (countVisibleChars(nextBody) < input.minimumChars && index < 24) {
    const block = blocks[index % blocks.length];
    nextBody = `${nextBody}\n\n${block}`;
    index += 1;
  }

  const genericPadding = "补充执行细节：把判断拆到角色、节点、动作、验收四个维度，确保今天就能落地。";

  while (countVisibleChars(nextBody) < input.minimumChars) {
    nextBody = `${nextBody}\n\n${genericPadding}`;
  }

  nextBody = cleanParagraphs(nextBody);

  return {
    body: nextBody,
    wasExpanded: true,
    charCount: countVisibleChars(nextBody)
  };
}
