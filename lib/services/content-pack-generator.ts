import { createHash } from "node:crypto";
import { getCurrentViewer } from "@/lib/auth/session";
import { updateLocalDataStore } from "@/lib/data/local-store";
import { getBrandStrategyPack, getHotspotSignals } from "@/lib/data";
import { BrandStrategyPack, ContentVariant, HotspotPack, HotspotSignal, Platform } from "@/lib/domain/types";
import { getChinaMarketPromptLines } from "@/lib/services/china-market";
import { enforceBodyMinimumWithContext, resolveMinimumCharsForVariant } from "@/lib/services/content-quality";
import { runModelTask } from "@/lib/services/model-router";
import { getSupabaseServerClient } from "@/lib/supabase/client";

export interface GeneratedPackResult {
  pack: HotspotPack;
  persisted: boolean;
  usedMockStorage: boolean;
  modelOutput?: string;
}

interface GenerationContext {
  workspaceId?: string;
  actorUserId?: string;
}

type VariantSlot = "rapid-1" | "rapid-2" | "pov-1" | "pov-2";

interface VariantBlueprint {
  slot: VariantSlot;
  track: ContentVariant["track"];
  index: number;
  format: ContentVariant["format"];
  platforms: Platform[];
  publishWindow: string;
  angleHint: string;
  minChars: number;
  targetRange: string;
  structureHint: string;
}

interface ModelGeneratedVariant {
  slot?: string;
  title?: string;
  angle?: string;
  coverHook?: string;
  body?: string;
}

interface ModelGeneratedPayload {
  whyNow?: string;
  whyUs?: string;
  variants?: ModelGeneratedVariant[];
}

const platformLabels: Record<Platform, string> = {
  xiaohongshu: "小红书",
  wechat: "公众号",
  "video-channel": "视频号",
  douyin: "抖音"
};

function deterministicId(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function resolvePlatforms(track: "rapid-response" | "point-of-view", hotspot: HotspotSignal): Platform[] {
  if (track === "rapid-response") {
    return hotspot.kind === "mass"
      ? ["xiaohongshu", "douyin"]
      : ["xiaohongshu", "video-channel"];
  }

  return hotspot.kind === "industry"
    ? ["wechat", "video-channel"]
    : ["wechat", "xiaohongshu"];
}

function resolveFormat(track: "rapid-response" | "point-of-view", index: number): ContentVariant["format"] {
  if (track === "rapid-response") {
    return index === 0 ? "post" : "video-script";
  }

  return index === 0 ? "article" : "post";
}

function resolvePublishWindow(track: "rapid-response" | "point-of-view", index: number): string {
  if (track === "rapid-response") {
    return index === 0 ? "30 分钟内" : "60 分钟内";
  }

  return index === 0 ? "今天 14:00-16:00" : "今天 19:00-21:00";
}

function resolveVariantBlueprints(hotspot: HotspotSignal): VariantBlueprint[] {
  return [
    {
      slot: "rapid-1",
      track: "rapid-response",
      index: 0,
      format: resolveFormat("rapid-response", 0),
      platforms: resolvePlatforms("rapid-response", hotspot),
      publishWindow: resolvePublishWindow("rapid-response", 0),
      angleHint: "快反判断帖",
      minChars: 260,
      targetRange: "260-420 字",
      structureHint: "开头一句判断，中段拆 2-3 个影响点，结尾给一个可执行动作。"
    },
    {
      slot: "rapid-2",
      track: "rapid-response",
      index: 1,
      format: resolveFormat("rapid-response", 1),
      platforms: resolvePlatforms("rapid-response", hotspot),
      publishWindow: resolvePublishWindow("rapid-response", 1),
      angleHint: "视频口播快反",
      minChars: 420,
      targetRange: "420-700 字",
      structureHint: "按口播节奏拆段，含开场钩子、背景、判断、动作建议与结尾金句。"
    },
    {
      slot: "pov-1",
      track: "point-of-view",
      index: 0,
      format: resolveFormat("point-of-view", 0),
      platforms: resolvePlatforms("point-of-view", hotspot),
      publishWindow: resolvePublishWindow("point-of-view", 0),
      angleHint: "公众号深度观点",
      minChars: 900,
      targetRange: "900-1600 字",
      structureHint: "观点文结构，含现象定性、三层影响、品牌方法与行动清单。"
    },
    {
      slot: "pov-2",
      track: "point-of-view",
      index: 1,
      format: resolveFormat("point-of-view", 1),
      platforms: resolvePlatforms("point-of-view", hotspot),
      publishWindow: resolvePublishWindow("point-of-view", 1),
      angleHint: "结构化观点卡片",
      minChars: 520,
      targetRange: "520-900 字",
      structureHint: "先给核心结论，再给三点变化与三步动作，最后收束品牌态度。"
    }
  ];
}

function cleanSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\u3000/g, " ").trim();
}

function cleanParagraphText(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, list) => Boolean(line) || (index > 0 && Boolean(list[index - 1])))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function actionLabel(action: HotspotSignal["recommendedAction"]): string {
  if (action === "ship-now") {
    return "立即跟进";
  }

  if (action === "watch") {
    return "持续观察";
  }

  return "暂不跟进";
}

function createWhyNow(hotspot: HotspotSignal): string {
  const reasons = hotspot.reasons.slice(0, 2).join("；");
  const reasonText = reasons || "行业讨论重心正在变化";
  return `这条热点来自 ${hotspot.source}，当前建议是「${actionLabel(hotspot.recommendedAction)}」，速度分 ${hotspot.velocityScore}。${reasonText}。这意味着窗口期不是“要不要发”，而是“先用什么判断抢占认知位”。`;
}

function createWhyUs(brand: BrandStrategyPack, hotspot: HotspotSignal): string {
  const topicText = brand.topics.slice(0, 3).join("、") || "品牌核心议题";
  const toneText = brand.tone.slice(0, 3).join("、") || "专业、清晰、克制";
  return `${brand.name} 的长期表达重心是 ${topicText}，这和「${hotspot.title}」讨论的是同一类决策问题。以 ${toneText} 的语气切入，可以把热点写成“有方法、有边界、有执行动作”的行业判断，而不是一次性蹭流量。`;
}

function buildFallbackDraft(
  brand: BrandStrategyPack,
  hotspot: HotspotSignal,
  blueprint: VariantBlueprint
): Pick<ContentVariant, "title" | "angle" | "body" | "coverHook"> {
  const topReason = hotspot.reasons[0] ?? "行业正在快速形成新共识";
  const secondReason = hotspot.reasons[1] ?? "组织传播节奏会被这类变化重新定义";

  if (blueprint.slot === "rapid-1") {
    return {
      title: `${hotspot.title}：${brand.name} 这波快反别做信息搬运，要先给业务判断`,
      angle: "快反判断帖",
      coverHook: "先给判断，再抢窗口",
      body: [
        `先给结论：${hotspot.title} 不是“可发可不发”的资讯，它会直接改变客户今天如何判断品牌是否真的懂业务。`,
        `如果我们只是复述新闻，内容会在两小时内被更快的账号吞没；但如果先给出一个明确立场，再把影响拆到真实场景里，品牌会被记住为“会判断的人”，而不是“转热点的人”。`,
        `对 ${brand.name} 来说，快反稿建议只抓三件事。第一，讲清这波变化会先影响谁，最好落到具体角色和流程。第二，用一句话指出旧做法为什么失效，避免空泛喊口号。第三，给出今天就能执行的动作，比如先改哪一段流程、先补哪一类内容资产。`,
        `结合当前信号（${topReason}；${secondReason}），这条内容建议在 ${blueprint.publishWindow} 发出。先占判断位，再用后续长文补方法，节奏和深度都能兼顾。`
      ].join("\n\n")
    };
  }

  if (blueprint.slot === "rapid-2") {
    return {
      title: `${hotspot.title}爆了之后，品牌团队 60 秒该怎么判断、怎么跟`,
      angle: "视频口播快反",
      coverHook: "别等热度过去才开会",
      body: [
        "【开场 0-8s】",
        `今天这个热点你要是还在“先收集资料、再内部开会”，窗口基本就没了。${brand.name} 这波建议先做一件事：直接给判断，不要先做长解释。`,
        "",
        "【背景 8-20s】",
        `为什么？因为 ${hotspot.title} 已经不是单条新闻，它在改的是行业讨论顺序。大家现在问的不是“发生了什么”，而是“接下来怎么做”。`,
        "",
        "【核心判断 20-40s】",
        `第一个判断：快反不是抢热搜，而是抢认知位。第二个判断：有结论但没执行动作，等于空话。第三个判断：如果只讲平台话术，不讲企业场景，内容看起来会很聪明，但业务上没有抓手。`,
        "",
        "【动作建议 40-55s】",
        `所以今天就按三步走：先用一句话定性变化，再讲两个受影响最明显的业务环节，最后给团队一个当日可执行动作。比如内容审核口径怎么调、素材优先级怎么排、谁来负责二次放大。`,
        "",
        "【收束 55-65s】",
        `这件事真正拉开差距的，不是谁先发，而是谁能把热点讲成组织方法。${brand.name} 的态度就是：先有判断，再有动作，最后再把动作沉淀成可复用流程。`
      ].join("\n")
    };
  }

  if (blueprint.slot === "pov-1") {
    return {
      title: `${hotspot.title}之后，品牌内容团队最该升级的不是速度，而是判断系统`,
      angle: "公众号深度观点",
      coverHook: "速度是门槛，判断才是壁垒",
      body: [
        `最近围绕「${hotspot.title}」的讨论很密集。很多团队第一反应是“赶紧出一版”，但从品牌长期建设看，更重要的问题是：我们要不要借这个节点，把内容生产逻辑从“热点驱动”升级成“判断驱动”。`,
        `先讲一个常被忽略的事实。热点本身会过去，但热点触发的客户问题不会马上消失。今天用户点开内容，期待的不是你把新闻再说一遍，而是你能不能告诉他：这件事会改变什么、先影响哪里、组织应该怎么应对。没有这三层，内容再快也只是信息转运。`,
        `第一层变化，是行业讨论门槛正在上移。过去只要“跟得上”就不会掉队，现在不够了。你必须给出清晰判断，说明你看到的是趋势还是噪音。${hotspot.title} 之所以值得跟，不是因为它热，而是因为它会重排行业沟通优先级。`,
        `第二层变化，是平台语境在变。中国平台对表达边界、信息密度和可执行性要求更高。用户不会为“看起来很懂”的内容停留太久，但会为“说得清、用得上”的内容收藏和转发。换句话说，内容质量的标准正在从“观点是否新鲜”转向“观点能否落地”。`,
        `第三层变化，是品牌内部协同链路被迫提速。内容团队单点冲刺已经不够，传播、产品、销售和交付要在同一判断框架里协作。否则前端发声很漂亮，后端承接跟不上，最终会透支品牌信任。`,
        `回到 ${brand.name}。这类热点不是拿来“表态一次”就结束，而是拿来校准品牌长期表达资产。建议建立一个可复用框架：热点触发后先定性，再拆影响，再给动作，最后沉淀成下次可复用模板。这里的关键不在模板长什么样，而在每次都能产出同样稳定的判断质量。`,
        `可执行上，建议今天先做三件事。1. 明确这次变化影响最大的两个业务场景，避免泛谈行业。2. 把“我们建议怎么做”写成可被业务团队直接拿去开的行动条目。3. 为后续一周预留二次表达位：短稿占窗口、长稿沉淀方法、视频稿放大观点。`,
        `总结一句：热点带来的真正机会，不是多一次曝光，而是多一次证明专业度的机会。速度决定你能不能上场，判断决定你能不能留下。`
      ].join("\n\n")
    };
  }

  return {
    title: `${brand.name}对${hotspot.title}的三点判断：别只追热点，要把动作做实`,
    angle: "结构化观点卡片",
    coverHook: "三点判断，三步动作",
    body: [
      `先说核心结论：${hotspot.title} 这类热点的价值，不在“讨论热度有多高”，而在“它能不能倒逼团队升级决策质量”。`,
      `第一点判断，窗口变短了。用户今天看到内容，期待的是快速结论，而不是背景科普。第二点判断，表达标准更高了。没有业务抓手的观点，转发率和留存都会掉。第三点判断，组织协同比单条爆文更重要。没有后续动作承接，前端声量会很快衰减。`,
      `对应三步动作可以立刻执行。第一步，先用一句话定性这次变化会影响谁、影响到什么流程。第二步，把观点拆成“今天可执行”的任务，比如要先补哪类内容、先对齐哪条审核口径。第三步，把这次输出沉淀成方法卡，保证下次类似热点不再从零开始。`,
      `如果要把这条内容发在 ${blueprint.platforms.map((platform) => platformLabels[platform]).join(" / ")}，建议开头更直接，尽量在前三行给出判断和立场，避免读者滑走。`,
      `最后一句留给团队：热点不是目的，借热点把“判断力 + 执行力”展示出来，才是品牌长期资产。`
    ].join("\n\n")
  };
}

function createTemplateVariants(
  brand: BrandStrategyPack,
  hotspot: HotspotSignal,
  blueprints: VariantBlueprint[]
): ContentVariant[] {
  return blueprints.map((blueprint) => {
    const fallback = buildFallbackDraft(brand, hotspot, blueprint);
    const legacyTrackSeed = blueprint.track === "rapid-response" ? "rapid" : "pov";

    return {
      id: deterministicId(`${hotspot.id}:${legacyTrackSeed}:${blueprint.index}`),
      track: blueprint.track,
      title: fallback.title,
      angle: fallback.angle,
      platforms: blueprint.platforms,
      format: blueprint.format,
      body: enforceBodyMinimumWithContext({
        body: fallback.body,
        title: fallback.title,
        angle: fallback.angle,
        whyNow: createWhyNow(hotspot),
        whyUs: createWhyUs(brand, hotspot),
        minimumChars: resolveMinimumCharsForVariant({
          format: blueprint.format,
          track: blueprint.track,
          platforms: blueprint.platforms
        }),
        formatHint: blueprint.format,
        trackHint: blueprint.track,
        platformHint: blueprint.platforms.map((platform) => platformLabels[platform]).join(" / ")
      }).body,
      coverHook: fallback.coverHook,
      publishWindow: blueprint.publishWindow
    };
  });
}

function buildGenerationPrompt(
  brand: BrandStrategyPack,
  hotspot: HotspotSignal,
  blueprints: VariantBlueprint[]
): string {
  const slotSpecs = blueprints.map((blueprint) => ({
    slot: blueprint.slot,
    track: blueprint.track,
    format: blueprint.format,
    platforms: blueprint.platforms.map((platform) => platformLabels[platform]),
    publishWindow: blueprint.publishWindow,
    angleHint: blueprint.angleHint,
    bodyLength: blueprint.targetRange,
    structureHint: blueprint.structureHint
  }));

  return [
    "你是中国头部品牌内容团队的资深内容总监 + 平台主笔。",
    "任务：基于给定热点和品牌背景，输出 4 条可直接进入审核的高质量成稿（不是提纲、不是建议）。",
    "质量底线（必须满足）：",
    "- 文风：中文商业内容语境，专业、有判断、有执行动作，不要学生作文腔。",
    "- 内容：禁止只复述新闻，必须给出“判断 + 影响 + 动作”。",
    "- 平台：按稿件规格匹配平台口吻和结构，视频稿按口播节奏写。",
    "- 字数：每条正文必须达到对应区间，下限不足视为失败。",
    "- 事实：只使用输入信息进行归纳，不要虚构政策、数据、人物表态。",
    "",
    "品牌信息：",
    `- 品牌名称: ${brand.name}`,
    `- 行业: ${brand.sector}`,
    `- 核心受众: ${brand.audiences.join("、")}`,
    `- 品牌定位: ${brand.positioning.join("；")}`,
    `- 品牌主题: ${brand.topics.join("、")}`,
    `- 品牌语气: ${brand.tone.join("、")}`,
    `- 品牌禁区: ${brand.redLines.join("；")}`,
    `- 近期动作: ${brand.recentMoves.join("；")}`,
    "",
    "热点信息：",
    `- 标题: ${hotspot.title}`,
    `- 摘要: ${hotspot.summary}`,
    `- 来源: ${hotspot.source}`,
    `- 推荐动作: ${actionLabel(hotspot.recommendedAction)}`,
    `- 评分: relevance=${hotspot.relevanceScore}, industry=${hotspot.industryScore}, velocity=${hotspot.velocityScore}, risk=${hotspot.riskScore}`,
    `- 关键原因: ${hotspot.reasons.join("；") || "暂无补充原因"}`,
    "",
    "中国市场要求：",
    ...getChinaMarketPromptLines().map((line) => `- ${line}`),
    "",
    "稿件规格（严格遵守）：",
    JSON.stringify(slotSpecs, null, 2),
    "",
    "只输出 JSON，不要 Markdown，不要解释，不要代码块。JSON 结构如下：",
    "{",
    '  "whyNow": "80-150字，说明为什么现在做",',
    '  "whyUs": "90-180字，说明为什么和品牌相关",',
    '  "variants": [',
    '    {"slot":"rapid-1","title":"...","angle":"...","coverHook":"...","body":"..."},',
    '    {"slot":"rapid-2","title":"...","angle":"...","coverHook":"...","body":"..."},',
    '    {"slot":"pov-1","title":"...","angle":"...","coverHook":"...","body":"..."},',
    '    {"slot":"pov-2","title":"...","angle":"...","coverHook":"...","body":"..."}',
    "  ]",
    "}"
  ].join("\n");
}

function extractLikelyJson(raw: string): string | null {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith("{") && inner.endsWith("}")) {
      return inner;
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

function parseModelPayload(raw: string): ModelGeneratedPayload | null {
  const json = extractLikelyJson(raw);

  if (!json) {
    return null;
  }

  try {
    const parsed = JSON.parse(json) as ModelGeneratedPayload;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function toSlot(value: string | undefined): VariantSlot | undefined {
  if (value === "rapid-1" || value === "rapid-2" || value === "pov-1" || value === "pov-2") {
    return value;
  }

  return undefined;
}

function findModelVariant(
  payload: ModelGeneratedPayload | null,
  blueprint: VariantBlueprint,
  fallbackIndex: number
): ModelGeneratedVariant | undefined {
  const variants = payload?.variants;

  if (!Array.isArray(variants)) {
    return undefined;
  }

  const bySlot = variants.find((variant) => toSlot(cleanSingleLine(variant.slot ?? "")) === blueprint.slot);
  if (bySlot) {
    return bySlot;
  }

  return variants[fallbackIndex];
}

function mergeModelVariants(
  brand: BrandStrategyPack,
  hotspot: HotspotSignal,
  blueprints: VariantBlueprint[],
  fallbackVariants: ContentVariant[],
  payload: ModelGeneratedPayload | null
): {
  variants: ContentVariant[];
  whyNow: string;
  whyUs: string;
} {
  const variants = blueprints.map((blueprint, index) => {
    const fallback = fallbackVariants[index];
    const modelVariant = findModelVariant(payload, blueprint, index);

    const modelTitle = cleanSingleLine(modelVariant?.title ?? "");
    const modelAngle = cleanSingleLine(modelVariant?.angle ?? "");
    const modelHook = cleanSingleLine(modelVariant?.coverHook ?? "");
    const modelBody = cleanParagraphText(modelVariant?.body ?? "");
    const validTitle = modelTitle.length >= 10;
    const minimumChars = resolveMinimumCharsForVariant({
      format: blueprint.format,
      track: blueprint.track,
      platforms: blueprint.platforms
    });
    const nextBody = enforceBodyMinimumWithContext({
      body: modelBody || fallback.body,
      title: modelTitle || fallback.title,
      angle: modelAngle || fallback.angle,
      whyNow: createWhyNow(hotspot),
      whyUs: createWhyUs(brand, hotspot),
      minimumChars,
      formatHint: blueprint.format,
      trackHint: blueprint.track,
      platformHint: blueprint.platforms.map((platform) => platformLabels[platform]).join(" / ")
    }).body;

    return {
      ...fallback,
      title: validTitle ? modelTitle : fallback.title,
      angle: modelAngle || fallback.angle,
      coverHook: modelHook || fallback.coverHook,
      body: nextBody
    };
  });

  const whyNowCandidate = cleanSingleLine(payload?.whyNow ?? "");
  const whyUsCandidate = cleanSingleLine(payload?.whyUs ?? "");

  return {
    variants,
    whyNow: whyNowCandidate.length >= 30 ? whyNowCandidate : createWhyNow(hotspot),
    whyUs: whyUsCandidate.length >= 30 ? whyUsCandidate : createWhyUs(brand, hotspot)
  };
}

async function tryModelGeneration(
  brand: BrandStrategyPack,
  hotspot: HotspotSignal,
  blueprints: VariantBlueprint[]
): Promise<{
  output?: string;
  payload: ModelGeneratedPayload | null;
}> {
  try {
    const output = await runModelTask("content-generation", buildGenerationPrompt(brand, hotspot, blueprints));
    return {
      output,
      payload: parseModelPayload(output)
    };
  } catch {
    return {
      payload: null
    };
  }
}

async function resolveGenerationContext(input?: GenerationContext): Promise<GenerationContext> {
  if (input?.workspaceId || input?.actorUserId) {
    return input;
  }

  try {
    const viewer = await getCurrentViewer();
    return {
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined
    };
  } catch {
    return {};
  }
}

async function persistGeneratedPack(pack: HotspotPack, context?: GenerationContext): Promise<{
  persisted: boolean;
  usedMockStorage: boolean;
}> {
  const supabase = getSupabaseServerClient();
  const resolved = await resolveGenerationContext(context);

  if (!supabase) {
    await updateLocalDataStore((store) => ({
      ...store,
      packs: [pack, ...store.packs.filter((item) => item.id !== pack.id)]
    }));

    return {
      persisted: true,
      usedMockStorage: true
    };
  }

  let workspaceId = resolved.workspaceId;

  if (!workspaceId) {
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (workspaceError || !workspace?.id) {
      throw workspaceError ?? new Error("No workspace available for content pack persistence");
    }

    workspaceId = workspace.id;
  }

  const packRow = {
    id: pack.id,
    workspace_id: workspaceId,
    brand_id: pack.brandId,
    hotspot_id: pack.hotspotId,
    status: pack.status,
    why_now: pack.whyNow,
    why_us: pack.whyUs,
    review_owner: pack.reviewOwner,
    created_by: resolved.actorUserId ?? null
  };

  const { error: packError } = await supabase
    .from("hotspot_packs")
    .upsert(packRow, { onConflict: "id" });

  if (packError) {
    throw packError;
  }

  const { error: deleteError } = await supabase
    .from("content_variants")
    .delete()
    .eq("pack_id", pack.id);

  if (deleteError) {
    throw deleteError;
  }

  const variantRows = pack.variants.map((variant) => ({
    id: variant.id,
    pack_id: pack.id,
    track: variant.track,
    title: variant.title,
    angle: variant.angle,
    format: variant.format,
    body: variant.body,
    cover_hook: variant.coverHook,
    publish_window: variant.publishWindow,
    platforms: variant.platforms
  }));

  const { error: insertError } = await supabase
    .from("content_variants")
    .insert(variantRows);

  if (insertError) {
    throw insertError;
  }

  return {
    persisted: true,
    usedMockStorage: false
  };
}

export async function generateContentPackForEntities(
  brand: BrandStrategyPack,
  hotspot: HotspotSignal,
  context?: GenerationContext
): Promise<GeneratedPackResult> {
  const blueprints = resolveVariantBlueprints(hotspot);
  const fallbackVariants = createTemplateVariants(brand, hotspot, blueprints);
  const modelGenerated = await tryModelGeneration(brand, hotspot, blueprints);
  const merged = mergeModelVariants(brand, hotspot, blueprints, fallbackVariants, modelGenerated.payload);
  const pack: HotspotPack = {
    id: deterministicId(`${brand.id}:${hotspot.id}:pack`),
    workspaceId: context?.workspaceId,
    brandId: brand.id,
    hotspotId: hotspot.id,
    status: "pending",
    whyNow: merged.whyNow,
    whyUs: merged.whyUs,
    reviewOwner: "品牌市场负责人",
    variants: merged.variants
  };

  const storage = await persistGeneratedPack(pack, context);

  return {
    pack,
    persisted: storage.persisted,
    usedMockStorage: storage.usedMockStorage,
    modelOutput: modelGenerated.output
  };
}

export async function generateContentPackForHotspot(
  hotspotId: string,
  context?: GenerationContext
): Promise<GeneratedPackResult> {
  const [brand, hotspots] = await Promise.all([getBrandStrategyPack(), getHotspotSignals()]);
  const hotspot = hotspots.find((item) => item.id === hotspotId);

  if (!hotspot) {
    throw new Error(`Unknown hotspot: ${hotspotId}`);
  }

  return generateContentPackForEntities(brand, hotspot, context);
}
