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

function countParagraphs(value: string): number {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
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

function isXiaohongshuLike(input: EnsureBodyInput): boolean {
  return /小红书/i.test(input.platformHint ?? "");
}

function buildVideoBlocks(input: EnsureBodyInput): string[] {
  const title = fallback(input.title, "这条热点的关键变化");
  const angle = fallback(input.angle, "结构化判断");
  const whyNow = fallback(input.whyNow, "行业讨论窗口正在快速收敛");
  const whyUs = fallback(input.whyUs, "这件事和品牌业务场景高度相关");

  return [
    ["【开场钩子】", `先说结论：${title} 不是一条可以慢慢补读的新闻，而是今天就要给团队判断的业务议题。`].join(
      "\n"
    ),
    ["【背景交代】", `为什么现在要讲？因为 ${whyNow}。用户不会为“发生了什么”停留太久，但会为“接下来怎么做”停留。`].join(
      "\n"
    ),
    ["【拆第一层影响】", "先看用户侧，大家最先感受到的不是概念变化，而是决策门槛和执行节奏在变。"].join("\n"),
    ["【拆第二层影响】", "再看组织侧，内容、销售、交付如果不在同一套判断里协作，前端发声越快，后端越容易接不住。"].join(
      "\n"
    ),
    ["【核心判断】", `这版口播按「${angle}」展开：先定性变化，再拆影响链路，最后给出动作优先级。`].join("\n"),
    ["【动作建议】", "今天先做三步：1）明确受影响角色；2）给一个可执行动作；3）补一句风险边界，避免误读。"].join(
      "\n"
    ),
    ["【品牌相关】", `这件事和我们相关，不是因为热点热，而是因为 ${whyUs}。真正要说清的是：我们凭什么有资格给这个判断。`].join(
      "\n"
    ),
    ["【结尾金句】", "速度让你进场，判断让你留下，执行让你被信任。热点会过，方法会留。"].join("\n")
  ];
}

function buildArticleBlocks(input: EnsureBodyInput): string[] {
  const title = fallback(input.title, "这条变化的长期影响");
  const angle = fallback(input.angle, "方法论视角");
  const whyNow = fallback(input.whyNow, "当下讨论正在从信息层上升到决策层");
  const whyUs = fallback(input.whyUs, "品牌可在这个议题上给出可执行判断");

  return [
    `【先说结论】围绕「${title}」的讨论，真正值得写的不是事件表层，而是组织决策逻辑正在重排。`,
    `【为什么是现在】因为 ${whyNow}。窗口期内若只做新闻转述，内容很快失效；若能给出判断与动作，才会形成长期认知资产。`,
    `【先看变化】从「${angle}」看，至少有三层变化：第一层是市场预期变化，第二层是内部协同成本变化，第三层是品牌信任门槛变化。`,
    "【再看误区】很多团队会把热点内容当成一次性传播任务，但真正的问题不在“要不要发”，而在“能不能借这个节点把方法讲清楚”。如果只有观点没有论证，内容会显得聪明却不可信；如果只有信息没有动作，内容又会显得勤奋却没用。",
    "【落到业务动作】执行上建议先落三步：先定义影响对象，再明确优先动作，最后给时间边界和验收标准，避免内容停留在口号层。",
    `【为什么和品牌相关】因为 ${whyUs}。这意味着我们不是“借题表达”，而是在公开场景里展示专业判断与执行方法。`,
    "【怎么判断有没有写到位】至少要回答三个问题：变化到底改了什么、谁会先受到影响、今天最应该调整哪一步。如果这三个问题答不出来，说明文章还停留在信息层。",
    "【最后收束】热点只能带来注意力，方法才能沉淀为复利。真正长期有效的内容，不是比别人更快地复述，而是比别人更早地给出清晰判断。"
  ];
}

function buildXiaohongshuBlocks(input: EnsureBodyInput): string[] {
  const title = fallback(input.title, "这次变化值得跟进");
  const angle = fallback(input.angle, "业务判断");
  const whyNow = fallback(input.whyNow, "当前讨论窗口正在收紧");
  const whyUs = fallback(input.whyUs, "该议题与品牌业务链路高度相关");

  return [
    `如果你最近也在看「${title}」这类讨论，先别急着收藏一堆资讯，先把自己的判断立住。`,
    `我更建议从「${angle}」这个角度看，因为 ${whyNow}。晚一天，你看到的就可能已经不是原始问题，而是别人包装过后的结论。`,
    "我会先看 3 件事：1）这件事先影响谁；2）原来的做法哪里开始失效；3）今天能不能立刻改一个动作。",
    "很多内容之所以看着热闹、但发完就没了，是因为只讲现象，不讲场景；只给态度，不给动作。用户看完点头，但不知道下一步怎么做。",
    `为什么这条内容值得我们写？因为 ${whyUs}。能把品牌自己的业务判断讲明白，才不是蹭热点。`,
    "如果你也准备跟这类话题，记得前三行先给判断，中间讲具体场景，结尾留一个今天就能执行的小动作，收藏率和转发意愿会明显不一样。"
  ];
}

function buildPostBlocks(input: EnsureBodyInput): string[] {
  const title = fallback(input.title, "这次变化值得跟进");
  const angle = fallback(input.angle, "业务判断");
  const whyNow = fallback(input.whyNow, "当前讨论窗口正在收紧");
  const whyUs = fallback(input.whyUs, "该议题与品牌业务链路高度相关");

  if (isXiaohongshuLike(input)) {
    return buildXiaohongshuBlocks(input);
  }

  return [
    `核心判断：${title} 不该被写成“信息摘要”，而要写成“可执行判断”。`,
    `为什么现在说？因为 ${whyNow}。晚一天，讨论焦点就会被别的叙事带走。`,
    `从「${angle}」看，这次变化至少会影响目标用户认知、内部协同节奏和内容验收标准三个环节。`,
    "可执行动作建议：先给一句立场，再给两个影响点，最后给一个今天就能做的动作。",
    `为什么和品牌相关？因为 ${whyUs}。真正有效的表达，不是“我也看到了”，而是“我能解释接下来该怎么做”。`,
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
    return 1300;
  }

  if (input.format === "video-script" || input.platforms.includes("video-channel") || input.platforms.includes("douyin")) {
    return 650;
  }

  if (input.track === "point-of-view") {
    return 720;
  }

  return 380;
}

export function resolveMinimumCharsForLabels(input: {
  platformLabel: string;
  trackLabel: string;
}): number {
  if (input.platformLabel.includes("公众号")) {
    return 1300;
  }

  if (input.platformLabel.includes("视频号") || input.platformLabel.includes("抖音")) {
    return 650;
  }

  if (input.trackLabel.includes("观点")) {
    return 720;
  }

  return 380;
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

  if (isVideoLike(input) && countParagraphs(nextBody) < 7) {
    nextBody = cleanParagraphs(`${nextBody}\n\n${buildVideoBlocks(input).join("\n\n")}`);
  }

  if (isArticleLike(input) && countParagraphs(nextBody) < 8) {
    nextBody = cleanParagraphs(`${nextBody}\n\n${buildArticleBlocks(input).join("\n\n")}`);
  }

  if (!isVideoLike(input) && !isArticleLike(input) && countParagraphs(nextBody) < 6) {
    nextBody = cleanParagraphs(`${nextBody}\n\n${buildPostBlocks(input).join("\n\n")}`);
  }

  return {
    body: nextBody,
    wasExpanded: true,
    charCount: countVisibleChars(nextBody)
  };
}
