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
    `先把话放前面：${title} 不是一条可以慢慢补读的新闻，而是今天就要给出判断的业务变化。`,
    `为什么现在非说不可？因为 ${whyNow}。用户不会为“发生了什么”停留太久，但会为“接下来怎么做”停下来。`,
    "先看第一层影响，最先变化的通常不是概念，而是决策门槛和执行节奏。以前能拖到下周讨论的事，现在很可能今天就要定。 ",
    "再看第二层影响，组织协同会被直接放大。内容、销售、交付如果不站在同一个判断里协作，前端说得越快，后端越容易接不住。",
    `如果从「${angle}」这个角度看，真正值得展开的不是热度本身，而是它正在把影响链路一层层压缩。`,
    "更实际的做法是先抓三件事：谁最先受影响，哪一步旧流程先失效，今天能立刻调整哪个动作。把这三件事说清，口播就不会空。 ",
    `这件事之所以值得你认真听，不是因为它够热，而是因为 ${whyUs}。说到底，市场会记住的不是谁反应最快，而是谁判断更准。`,
    "所以最后只留一句话：热点会过去，判断留下来；热度能把人带进来，真正让人记住你的，是你有没有把问题讲透。"
  ];
}

function buildArticleBlocks(input: EnsureBodyInput): string[] {
  const title = fallback(input.title, "这条变化的长期影响");
  const angle = fallback(input.angle, "判断视角");
  const whyNow = fallback(input.whyNow, "当下讨论正在从信息层上升到决策层");
  const whyUs = fallback(input.whyUs, "品牌可在这个议题上给出可执行判断");

  return [
    `围绕「${title}」的讨论，真正值得展开的，从来不是表层事件本身，而是背后的决策逻辑已经开始重排。`,
    `为什么必须现在写？因为 ${whyNow}。窗口期里最怕的不是慢，而是慢半拍地重复所有人都已经知道的话。`,
    `如果从「${angle}」切进去，会看到至少三层连续变化：市场预期在变，内部协同成本在变，品牌信任门槛也在变。`,
    "很多稿子之所以读起来很满，却留不下判断，是因为它把热点当成一次性传播动作，而不是一次公开表达能力的检验。只有观点没有论证，会显得飘；只有信息没有动作，又会显得勤奋但没用。",
    "更有价值的写法，是把影响对象、优先动作和时间边界一起讲清楚。这样读者读到的不是态度展示，而是一套能判断现实问题的思路。",
    `这件事之所以和品牌表达有关，不是因为热点够热，而是因为 ${whyUs}。能把这一层讲清楚，内容才会像成熟判断，而不是追着热闹跑。`,
    "判断一篇稿子有没有写到位，其实就看三个问题能不能回答出来：变化到底改了什么、谁最先受到影响、今天最应该调整哪一步。如果这三个问题还答不出，文章就还没到可发的状态。",
    "到最后你会发现，热点真正带来的机会不是多一次曝光，而是多一次把专业度讲清楚的机会。真正长期有效的内容，不是更快地复述，而是更早地判断。"
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
    `这件事之所以值得认真聊，不是因为它够热，而是因为 ${whyUs}。真正能留下来的表达，永远不是“我也看到了”，而是“我知道它接下来会影响什么”。`,
    "所以比起继续补背景，我更建议你先把判断、场景和动作写出来。读者需要的不是更完整的资料，而是一句更准的提醒。"
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
    `这件事之所以不能只停留在热度上，是因为 ${whyUs}。真正有效的表达，不是“我也看到了”，而是“我能解释接下来该怎么做”。`,
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
