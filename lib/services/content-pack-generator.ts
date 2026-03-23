import { createHash } from "node:crypto";
import { updateLocalDataStore } from "@/lib/data/local-store";
import { getBrandStrategyPack, getHotspotSignals } from "@/lib/data";
import { AiProvider } from "@/lib/domain/ai-routing";
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

interface PlannedVariantBrief {
  slot?: string;
  audience?: string;
  contentMission?: string;
  openingMove?: string;
  titleStrategy?: string;
  coverHookStrategy?: string;
  structure?: string[];
  mustInclude?: string[];
  mustAvoid?: string[];
  qualityChecklist?: string[];
  tone?: string;
}

interface PlannedBriefPayload {
  whyNow?: string;
  whyUs?: string;
  variants?: PlannedVariantBrief[];
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
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
      angleHint: "小红书快反判断帖",
      minChars: 380,
      targetRange: "380-650 字",
      structureHint: "前三行先抛判断与场景，中段拆 3 个影响点，结尾给一个今天能执行的动作。"
    },
    {
      slot: "rapid-2",
      track: "rapid-response",
      index: 1,
      format: resolveFormat("rapid-response", 1),
      platforms: resolvePlatforms("rapid-response", hotspot),
      publishWindow: resolvePublishWindow("rapid-response", 1),
      angleHint: "视频号口播快反",
      minChars: 650,
      targetRange: "650-1100 字",
      structureHint: "按口播节奏拆 6-8 段，含开场钩子、背景、两层影响、动作建议与结尾金句。"
    },
    {
      slot: "pov-1",
      track: "point-of-view",
      index: 0,
      format: resolveFormat("point-of-view", 0),
      platforms: resolvePlatforms("point-of-view", hotspot),
      publishWindow: resolvePublishWindow("point-of-view", 0),
      angleHint: "公众号深度观点",
      minChars: 1300,
      targetRange: "1300-2200 字",
      structureHint: "深度观点文结构，含现象定性、误区、三层影响、品牌方法与行动清单。"
    },
    {
      slot: "pov-2",
      track: "point-of-view",
      index: 1,
      format: resolveFormat("point-of-view", 1),
      platforms: resolvePlatforms("point-of-view", hotspot),
      publishWindow: resolvePublishWindow("point-of-view", 1),
      angleHint: "结构化观点拆解",
      minChars: 720,
      targetRange: "720-1100 字",
      structureHint: "先给核心结论，再给三点变化、三步动作和一句品牌态度，像可传播的观点笔记。"
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

function getPrimaryPlatform(blueprint: VariantBlueprint): Platform {
  return blueprint.platforms[0] ?? "xiaohongshu";
}

function formatPlatformList(platforms: Platform[]): string {
  return platforms.map((platform) => platformLabels[platform]).join(" / ");
}

function countParagraphs(value: string): number {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function countSentences(value: string): number {
  return value
    .split(/[。！？!?]/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanSingleLine(typeof item === "string" ? item : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function buildDerivedBrief(
  brand: BrandStrategyPack,
  hotspot: HotspotSignal,
  blueprint: VariantBlueprint
): PlannedVariantBrief {
  const primaryPlatform = getPrimaryPlatform(blueprint);
  const audience = brand.audiences[0] || "品牌内容负责人";
  const reasons = hotspot.reasons.slice(0, 2).join("；") || "行业正在快速形成新共识";
  const topicText = brand.topics.slice(0, 2).join("、") || "品牌内容决策";

  if (blueprint.format === "video-script") {
    return {
      slot: blueprint.slot,
      audience,
      contentMission: `把「${hotspot.title}」讲成一段能让团队立刻形成判断的口播稿，不做资讯播报。`,
      openingMove: "前 3 秒先抛反常识判断或直接结论，不能先交代背景。",
      titleStrategy: "标题要像一条有态度的口播选题，16-24 字，不要报告标题。",
      coverHookStrategy: "封面大字 10-16 字，要让人一眼知道你反对什么或提醒什么。",
      structure: [
        "开场直接抛结论",
        "补一句为什么现在非讲不可",
        "拆两层真实业务影响",
        "给三步动作建议",
        "落回品牌方法和态度"
      ],
      mustInclude: [
        `引用这次热点的真实讨论窗口：${reasons}`,
        "至少一个具体工作场景，例如内容审核、销售沟通、团队协同",
        "结尾要有一句适合视频号收束的金句"
      ],
      mustAvoid: [
        "不要像新闻播报",
        "不要整段书面长句",
        "不要只讲概念不讲动作"
      ],
      qualityChecklist: [
        "全稿能直接口播",
        "句子要短，节奏清楚",
        `正文至少 ${blueprint.minChars} 字`
      ],
      tone: "像懂业务的人对团队说人话，克制但有力度"
    };
  }

  if (blueprint.format === "article") {
    return {
      slot: blueprint.slot,
      audience,
      contentMission: `把「${hotspot.title}」写成一篇公众号深度稿，核心是给 ${topicText} 相关决策一个清晰的方法判断。`,
      openingMove: "开头一段先定性：这件事真正值得讨论的不是表层新闻，而是背后的决策变化。",
      titleStrategy: "标题 20-30 字，像成熟公众号深度文章标题，要有判断但不过度夸张。",
      coverHookStrategy: "封面句更像一句总判断，10-18 字，适合卡片大字。",
      structure: [
        "先说结论",
        "解释为什么现在必须写",
        "指出行业常见误区",
        "拆三层影响",
        "落到品牌方法",
        "给今天就能执行的动作清单",
        "最后升维收束"
      ],
      mustInclude: [
        "至少三层影响分析",
        "至少三步可执行动作",
        `明确 ${brand.name} 为什么有资格讲这件事`
      ],
      mustAvoid: [
        "不要写成媒体快讯",
        "不要堆大词和空口号",
        "不要只有观点没有论证"
      ],
      qualityChecklist: [
        "段落完整，层次清楚",
        "每段都推进论证",
        `正文至少 ${blueprint.minChars} 字`
      ],
      tone: "像资深内容总监写给行业决策者的公众号长文"
    };
  }

  if (primaryPlatform === "xiaohongshu") {
    return {
      slot: blueprint.slot,
      audience,
      contentMission: `把「${hotspot.title}」写成一篇小红书判断型笔记，让人看完愿意收藏并拿去开会用。`,
      openingMove: "前三行先给判断，再补一个真实工作场景，不要先讲背景百科。",
      titleStrategy: "标题 18-28 字，像一句会被保存的判断，不要公文腔，不要引号套标题。",
      coverHookStrategy: "封面句 8-14 字，像封面大字，直接、好懂、有冲突。",
      structure: [
        "第一段先抛结论",
        "第二段补真实场景",
        "中间拆 3 个影响点",
        "结尾给今天能执行的动作"
      ],
      mustInclude: [
        "至少一个具体角色或场景",
        "至少三个清晰影响点或判断点",
        `点明和 ${brand.name} 的业务关系`
      ],
      mustAvoid: [
        "不要像会议纪要",
        "不要堆术语",
        "不要只有新闻转述没有个人判断"
      ],
      qualityChecklist: [
        "段落短，容易滑读",
        "能被收藏和转发",
        `正文至少 ${blueprint.minChars} 字`
      ],
      tone: "像一个懂业务的人在分享可执行判断，专业但有人味"
    };
  }

  return {
    slot: blueprint.slot,
    audience,
    contentMission: `把「${hotspot.title}」写成一篇结构化观点内容，既适合品牌传播，也适合内部快速对齐判断。`,
    openingMove: "第一段直接给结论，不要先写背景。",
    titleStrategy: "标题要像成熟内容选题，有明确观点，不要空泛。",
    coverHookStrategy: "封面句要像一句能单独成立的判断。",
    structure: [
      "开头给结论",
      "中段拆 3 个影响点",
      "后段给 3 步动作",
      "结尾收束品牌态度"
    ],
    mustInclude: [
      `结合热点原因：${reasons}`,
      "给到真实动作建议",
      `体现 ${brand.name} 的判断边界`
    ],
    mustAvoid: [
      "不要像信息摘要",
      "不要重复标题意思",
      "不要只有立场没有方法"
    ],
    qualityChecklist: [
      "结构清楚，立场鲜明",
      `正文至少 ${blueprint.minChars} 字`
    ],
    tone: "清晰、专业、可执行"
  };
}

function mergePlannedBrief(
  fallback: PlannedVariantBrief,
  planned: PlannedVariantBrief | undefined
): PlannedVariantBrief {
  return {
    slot: fallback.slot,
    audience: cleanSingleLine(planned?.audience ?? "") || fallback.audience,
    contentMission: cleanSingleLine(planned?.contentMission ?? "") || fallback.contentMission,
    openingMove: cleanSingleLine(planned?.openingMove ?? "") || fallback.openingMove,
    titleStrategy: cleanSingleLine(planned?.titleStrategy ?? "") || fallback.titleStrategy,
    coverHookStrategy: cleanSingleLine(planned?.coverHookStrategy ?? "") || fallback.coverHookStrategy,
    structure: normalizeStringList(planned?.structure).length
      ? normalizeStringList(planned?.structure)
      : fallback.structure,
    mustInclude: normalizeStringList(planned?.mustInclude).length
      ? normalizeStringList(planned?.mustInclude)
      : fallback.mustInclude,
    mustAvoid: normalizeStringList(planned?.mustAvoid).length
      ? normalizeStringList(planned?.mustAvoid)
      : fallback.mustAvoid,
    qualityChecklist: normalizeStringList(planned?.qualityChecklist).length
      ? normalizeStringList(planned?.qualityChecklist)
      : fallback.qualityChecklist,
    tone: cleanSingleLine(planned?.tone ?? "") || fallback.tone
  };
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
      title: `别把「${hotspot.title}」写成快讯，${brand.name} 这次先抢判断位`,
      angle: "小红书快反判断帖",
      coverHook: "先给判断，不做搬运",
      body: [
        `如果你今天也在看「${hotspot.title}」，先别急着转资料。真正重要的不是“消息出来了”，而是它会不会立刻影响你接下来怎么判断业务优先级。`,
        `我先给结论：这条热点值得跟，但绝对不能写成信息搬运。因为一旦你只是复述新闻，读者看到第三行就会滑走；但如果你能先给一个明确判断，再把影响拆到真实场景里，这条内容就会从“热点笔记”变成“能拿去开会的判断”。`,
        "我会先看 3 件事。第一，它先影响谁。是内容团队、销售团队，还是管理层判断？第二，旧做法哪里开始失效。第三，今天能不能立刻改一个动作，比如先统一审核口径、先补哪类素材、先调整谁的优先级。",
        `对 ${brand.name} 来说，这条内容最值得写的点，不是“我们也看到了”，而是要借这个节点说清楚：${topReason}。只有把判断和动作一起说出来，品牌才不会像在蹭流量，而像真的懂业务。`,
        `所以这条快反建议在 ${blueprint.publishWindow} 发。开头先给一句立场，中间拆三点影响，最后落到一个今天就能执行的动作。抢窗口不是目的，把认知位站住才是目的。`,
        "如果你最近也在做热点内容，记住一个很有用的判断标准：读者看完之后，能不能马上说出“那我下一步该怎么做”。能，就是好内容；不能，再热也只是热闹。"
      ].join("\n\n")
    };
  }

  if (blueprint.slot === "rapid-2") {
    return {
      title: `${hotspot.title}一出来，品牌团队最先该改的不是速度，是判断顺序`,
      angle: "视频号口播快反",
      coverHook: "别先开会，先给判断",
      body: [
        "【开场 0-5s】",
        `今天这个热点如果你还准备“先收资料、再慢慢讨论”，窗口基本已经过去一半了。${brand.name} 这次建议先做一件事：先给判断，不要先做信息整理。`,
        "",
        "【为什么现在必须讲 5-15s】",
        `因为「${hotspot.title}」已经不是单条新闻，它在改的是行业对这个问题的讨论顺序。用户和客户现在想听的，不是“发生了什么”，而是“接下来该怎么做”。`,
        "",
        "【第一层影响 15-28s】",
        `第一层影响在外部认知。${topReason}。如果你只是转述事件，别人只会觉得你跟得快；如果你能先给判断，别人会开始把你当成会做决策的人。`,
        "",
        "【第二层影响 28-42s】",
        `第二层影响在内部协同。${secondReason}。内容、销售、交付如果不在同一个判断框架里协作，前端发声越快，后端越容易接不住，最后透支的是品牌信任。`,
        "",
        "【动作建议 42-58s】",
        "所以今天就按三步走：先用一句话定性这次变化，再说两个受影响最大的业务环节，最后给一个当日可执行动作。比如先改审核口径、先补素材缺口、先明确谁负责二次放大。",
        "",
        "【品牌落点 58-72s】",
        `这件事对 ${brand.name} 来说，价值不在“也发了一条”，而在借这个窗口讲清楚自己的方法：先判断，再动作，最后把动作沉淀成可复用流程。`,
        "",
        "【结尾金句 72-80s】",
        "热点能带来注意力，判断才能带来信任。别只抢热度，先把判断顺序抢下来。"
      ].join("\n")
    };
  }

  if (blueprint.slot === "pov-1") {
    return {
      title: `${hotspot.title}之后，品牌内容团队真正要升级的，是把热点写成决策方法`,
      angle: "公众号深度观点",
      coverHook: "速度是门槛，判断才是壁垒",
      body: [
        `围绕「${hotspot.title}」的讨论最近非常密集。很多团队第一反应都是“赶紧出一版内容”，但从长期内容资产建设看，更重要的问题其实不是“发不发”，而是“我们能不能借这次热点，把自己的判断方法讲清楚”。`,
        `先说结论：这类热点最值得写的，不是事件表层，而是背后的决策逻辑正在重排。你今天如果只是转述新闻，内容生命周期可能只有几个小时；但如果你能说明变化来自哪里、会先影响谁、组织今天该怎么应对，这条内容就会从一次传播动作，变成长期可复用的认知资产。`,
        `为什么是现在？因为 ${createWhyNow(hotspot)}。窗口期内最怕的不是慢，而是慢半拍地说了一堆所有人都知道的话。真正有价值的表达，应该帮助团队更快形成判断，而不是更完整地补背景资料。`,
        `第一个值得展开的点，是行业讨论门槛在上移。过去品牌内容跟上热点就不算掉队，但现在仅仅跟上已经不够。用户和客户会越来越快地区分两种内容：一种只是“知道发生了什么”，另一种则能告诉他“接下来应该怎么做”。这两者的信任密度完全不一样。`,
        "第二个点，是平台语境在变化。中国平台尤其看重表达是否像人话、是否有真实场景、是否能立刻拿去用。公众号读者愿意为深度停留，但前提是文章每一段都在推进论证，而不是重复标题意思。没有结构、没有论证、没有动作的长文，只会显得冗长，不会显得深度。",
        "第三个点，是品牌内部协同链路被迫提速。内容团队、销售团队、交付团队和管理层，正在被迫共享同一套判断。如果前端内容说得漂亮，但后端没有承接动作，这条内容发得越好，反而越容易透支信任。所以品牌真正需要升级的，不是“产出更快”，而是“产出前先对齐判断”。",
        `回到 ${brand.name}。这类热点不是拿来“表态一次”就结束，而是拿来校准长期表达资产。品牌真正应该沉淀的，不是一堆零散热点稿，而是一套稳定框架：热点触发后先定性，再拆影响，再给动作，最后沉淀成下次可复用模板。这样你每次借热点发声，都在积累方法，而不是消耗素材。`,
        "如果今天就要执行，我建议先做三件事。第一，明确这次变化最先影响哪两个业务场景，避免泛谈行业。第二，把“我们建议怎么做”写成业务团队能直接拿去开的行动条目，而不是抽象态度。第三，为接下来一周预留二次表达位：先用短稿抢窗口，再用长稿沉淀方法，再用口播放大判断。",
        `总结一句：热点带来的真正机会，从来不是多一次曝光，而是多一次证明专业度的机会。${brand.name} 如果要把这条内容写到位，就不要只比别人快半步，而要比别人早一步把判断系统讲清楚。`
      ].join("\n\n")
    };
  }

  return {
    title: `别只跟「${hotspot.title}」热度，真正该抢的是这 3 个判断`,
    angle: "结构化观点拆解",
    coverHook: "三点判断，三步动作",
    body: [
      `先说核心结论：${hotspot.title} 这类热点的价值，不在“讨论热度有多高”，而在“它能不能倒逼团队升级决策质量”。`,
      "很多内容看起来反应很快，但一发完就失效，问题通常不在速度，而在没有把“判断、影响、动作”这三件事讲完整。用户看完知道你看到了，却不知道你到底怎么看、建议怎么做，自然也很难收藏和转发。",
      "我会先抓 3 个判断。第一，窗口变短了，今天看到内容的人只会为快速结论停留，不会为背景科普停留。第二，表达标准变高了，没有业务抓手的观点，转发率和留存都会掉。第三，组织协同比单条爆文更重要，没有后续动作承接，前端声量很快就会衰减。",
      "对应三步动作也可以立刻执行。第一步，先用一句话定性这次变化影响谁、影响到什么流程。第二步，把观点拆成“今天可执行”的任务，比如先补哪类内容、先对齐哪条审核口径。第三步，把这次输出沉淀成方法卡，保证下次类似热点不再从零开始。",
      `如果这条内容要发在 ${formatPlatformList(blueprint.platforms)}，开头一定要更直接，尽量在前三行就把判断和立场亮出来。别让读者先陪你读背景，再等你到后面才说重点。`,
      `对 ${brand.name} 来说，这条内容真正的价值不是“借了一次热点”，而是借这个节点把品牌的判断力和执行力同时展示出来。热点不是目的，把方法讲明白才是长期资产。`
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

function parseJsonPayload<T>(raw: string): T | null {
  const json = extractLikelyJson(raw);

  if (!json) {
    return null;
  }

  try {
    const parsed = JSON.parse(json) as T;
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

function buildBriefPlannerPrompt(
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
    minChars: blueprint.minChars,
    targetRange: blueprint.targetRange,
    structureHint: blueprint.structureHint
  }));

  return [
    "你是中国头部品牌内容团队的总编排期官，尤其擅长先把不同平台的写作任务书拆清楚，再交给写手执行。",
    "任务：先不要直接写稿，而是为 4 个槽位分别产出平台化写作 brief。",
    "你要解决的问题是：不同平台的内容不能再写成一种语气、一种结构、一种深度。",
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
    "槽位规格：",
    JSON.stringify(slotSpecs, null, 2),
    "",
    "输出要求：",
    "- whyNow: 80-140 字，讲清为什么现在必须做，而不是晚点再做。",
    "- whyUs: 90-160 字，讲清为什么这个品牌有资格讲，不要空泛。",
    "- 对每个槽位输出独立 brief，告诉下游写手该怎么写，而不是写成品。",
    "- brief 必须体现平台差异，尤其要把小红书、视频号、公众号的语气、结构、标题策略拆开。",
    "- 不要空话，不要抽象词堆砌，不要写成咨询报告。",
    "",
    "只输出 JSON，不要 Markdown，不要解释。JSON 结构如下：",
    "{",
    '  "whyNow": "...",',
    '  "whyUs": "...",',
    '  "variants": [',
    '    {',
    '      "slot": "rapid-1",',
    '      "audience": "...",',
    '      "contentMission": "...",',
    '      "openingMove": "...",',
    '      "titleStrategy": "...",',
    '      "coverHookStrategy": "...",',
    '      "structure": ["..."],',
    '      "mustInclude": ["..."],',
    '      "mustAvoid": ["..."],',
    '      "qualityChecklist": ["..."],',
    '      "tone": "..."',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}

function findPlannedBrief(
  payload: PlannedBriefPayload | null,
  blueprint: VariantBlueprint,
  fallbackIndex: number
): PlannedVariantBrief | undefined {
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

function resolvePlannedBriefs(
  brand: BrandStrategyPack,
  hotspot: HotspotSignal,
  blueprints: VariantBlueprint[],
  payload: PlannedBriefPayload | null
): {
  whyNow: string;
  whyUs: string;
  briefs: Record<VariantSlot, PlannedVariantBrief>;
} {
  const whyNow = cleanSingleLine(payload?.whyNow ?? "");
  const whyUs = cleanSingleLine(payload?.whyUs ?? "");
  const fallbackWhyNow = createWhyNow(hotspot);
  const fallbackWhyUs = createWhyUs(brand, hotspot);
  const briefs = blueprints.reduce(
    (accumulator, blueprint, index) => {
      const fallback = buildDerivedBrief(brand, hotspot, blueprint);
      const planned = findPlannedBrief(payload, blueprint, index);
      accumulator[blueprint.slot] = mergePlannedBrief(fallback, planned);
      return accumulator;
    },
    {} as Record<VariantSlot, PlannedVariantBrief>
  );

  return {
    whyNow: whyNow.length >= 30 ? whyNow : fallbackWhyNow,
    whyUs: whyUs.length >= 30 ? whyUs : fallbackWhyUs,
    briefs
  };
}

function buildSlotGenerationPrompt(
  brand: BrandStrategyPack,
  hotspot: HotspotSignal,
  blueprint: VariantBlueprint,
  brief: PlannedVariantBrief,
  whyNow: string,
  whyUs: string
): string {
  const primaryPlatform = getPrimaryPlatform(blueprint);
  const platformStyle =
    primaryPlatform === "xiaohongshu"
      ? "小红书判断型笔记"
      : primaryPlatform === "wechat"
        ? "公众号深度观点文"
        : "视频号口播稿";

  return [
    "你是中国头部品牌内容团队的一线平台主笔，现在只负责写 1 条成稿。",
    "先看清 brief，再动笔。你的任务不是泛泛生成内容，而是严格按平台要求交一条可直接进入审核的成稿。",
    "",
    "统一质量底线：",
    "- 不是提纲，是成稿。",
    "- 不是新闻复述，必须给出判断、影响和动作。",
    "- 一定像该平台，不要把公众号、小红书、视频号写成同一种腔调。",
    "- 只用输入信息归纳，不要编造数据、政策、采访、案例细节。",
    `- 正文至少 ${blueprint.minChars} 字，目标区间 ${blueprint.targetRange}。`,
    "",
    "品牌信息：",
    `- 品牌名称: ${brand.name}`,
    `- 核心受众: ${brand.audiences.join("、")}`,
    `- 品牌定位: ${brand.positioning.join("；")}`,
    `- 品牌语气: ${brand.tone.join("、")}`,
    `- 品牌禁区: ${brand.redLines.join("；")}`,
    "",
    "热点信息：",
    `- 标题: ${hotspot.title}`,
    `- 摘要: ${hotspot.summary}`,
    `- 来源: ${hotspot.source}`,
    `- 关键原因: ${hotspot.reasons.join("；") || "暂无补充原因"}`,
    "",
    "Pack 判断：",
    `- whyNow: ${whyNow}`,
    `- whyUs: ${whyUs}`,
    "",
    "本槽位规格：",
    `- slot: ${blueprint.slot}`,
    `- track: ${blueprint.track}`,
    `- format: ${blueprint.format}`,
    `- platforms: ${formatPlatformList(blueprint.platforms)}`,
    `- primary platform style: ${platformStyle}`,
    `- publishWindow: ${blueprint.publishWindow}`,
    `- angleHint: ${blueprint.angleHint}`,
    `- structureHint: ${blueprint.structureHint}`,
    "",
    "本槽位 brief：",
    `- audience: ${brief.audience}`,
    `- contentMission: ${brief.contentMission}`,
    `- openingMove: ${brief.openingMove}`,
    `- titleStrategy: ${brief.titleStrategy}`,
    `- coverHookStrategy: ${brief.coverHookStrategy}`,
    `- tone: ${brief.tone}`,
    `- structure: ${brief.structure?.join("；") || "未提供"}`,
    `- mustInclude: ${brief.mustInclude?.join("；") || "未提供"}`,
    `- mustAvoid: ${brief.mustAvoid?.join("；") || "未提供"}`,
    `- qualityChecklist: ${brief.qualityChecklist?.join("；") || "未提供"}`,
    "",
    primaryPlatform === "xiaohongshu"
      ? "小红书特别要求：标题不要像公文；前三行必须让人停下来；正文段落要短；像一个懂业务的人在分享可执行判断；可以有“我更建议”“如果你也在做”这种人话表达。"
      : null,
    primaryPlatform === "wechat"
      ? "公众号特别要求：文章必须有明显论证递进；至少拆出三层影响和三步动作；每段都要推动观点，不要重复标题意思；像成熟深度稿。"
      : null,
    blueprint.format === "video-script"
      ? "视频号特别要求：按口播节奏写，短句、分段、能直接念；开头 3 秒抛结论；中间拆影响；结尾给一句有记忆点的收束金句。"
      : null,
    "",
    "只输出 JSON，不要 Markdown，不要解释。结构如下：",
    "{",
    `  "slot": "${blueprint.slot}",`,
    '  "title": "...",',
    '  "angle": "...",',
    '  "coverHook": "...",',
    '  "body": "..."',
    "}"
  ]
    .filter(Boolean)
    .join("\n");
}

function isTitleUsable(value: string, blueprint: VariantBlueprint): boolean {
  const min = blueprint.format === "article" ? 16 : 12;
  return value.length >= min && value.length <= 38;
}

function isCoverHookUsable(value: string): boolean {
  return value.length >= 6 && value.length <= 24;
}

function isBodyQualityAcceptable(blueprint: VariantBlueprint, body: string): boolean {
  const charCount = body.replace(/\s+/g, "").length;
  const paragraphCount = countParagraphs(body);
  const sentenceCount = countSentences(body);
  const primaryPlatform = getPrimaryPlatform(blueprint);

  if (charCount < blueprint.minChars) {
    return false;
  }

  if (blueprint.format === "video-script") {
    return paragraphCount >= 8 && sentenceCount >= 8 && /【.+?】/.test(body);
  }

  if (blueprint.format === "article") {
    return paragraphCount >= 8 && sentenceCount >= 12;
  }

  if (primaryPlatform === "xiaohongshu") {
    return paragraphCount >= 6 && sentenceCount >= 7;
  }

  return paragraphCount >= 5 && sentenceCount >= 7;
}

function normalizeGeneratedVariant(
  blueprint: VariantBlueprint,
  fallback: ContentVariant,
  generated: ModelGeneratedVariant | undefined,
  whyNow: string,
  whyUs: string
): ContentVariant {
  const modelTitle = cleanSingleLine(generated?.title ?? "");
  const modelAngle = cleanSingleLine(generated?.angle ?? "");
  const modelHook = cleanSingleLine(generated?.coverHook ?? "");
  const modelBody = cleanParagraphText(generated?.body ?? "");
  const nextTitle = isTitleUsable(modelTitle, blueprint) ? modelTitle : fallback.title;
  const nextHook = isCoverHookUsable(modelHook) ? modelHook : fallback.coverHook;
  const minimumChars = resolveMinimumCharsForVariant({
    format: blueprint.format,
    track: blueprint.track,
    platforms: blueprint.platforms
  });
  const bodySeed = isBodyQualityAcceptable(blueprint, modelBody) ? modelBody : fallback.body;
  const nextBody = enforceBodyMinimumWithContext({
    body: bodySeed,
    title: nextTitle,
    angle: modelAngle || fallback.angle,
    whyNow,
    whyUs,
    minimumChars,
    formatHint: blueprint.format,
    trackHint: blueprint.track,
    platformHint: formatPlatformList(blueprint.platforms)
  }).body;

  return {
    ...fallback,
    title: nextTitle,
    angle: modelAngle || fallback.angle,
    coverHook: nextHook,
    body: isBodyQualityAcceptable(blueprint, nextBody) ? nextBody : fallback.body
  };
}

async function runContentGenerationWithProviderFallback(
  prompt: string,
  options: {
    primaryProvider: AiProvider;
    fallbackProvider: AiProvider;
  }
): Promise<{
  output: string;
  provider: AiProvider;
  fallbackReason?: string;
}> {
  try {
    const output = await runModelTask("content-generation", prompt, {
      feature: "content-generation",
      desiredProvider: options.primaryProvider
    });

    return {
      output,
      provider: options.primaryProvider
    };
  } catch (error) {
    const fallbackOutput = await runModelTask("content-generation", prompt, {
      feature: "content-generation",
      desiredProvider: options.fallbackProvider
    });

    return {
      output: fallbackOutput,
      provider: options.fallbackProvider,
      fallbackReason: error instanceof Error ? error.message : "unknown_provider_error"
    };
  }
}

async function tryModelGeneration(
  brand: BrandStrategyPack,
  hotspot: HotspotSignal,
  blueprints: VariantBlueprint[]
): Promise<{
  output?: string;
  whyNow: string;
  whyUs: string;
  variants: Partial<Record<VariantSlot, ModelGeneratedVariant>>;
}> {
  let plannerOutput: string | undefined;
  let plannerPayload: PlannedBriefPayload | null = null;
  let plannerFallbackReason: string | undefined;
  let plannerProvider: AiProvider = "gemini";

  try {
    const plannerResult = await runContentGenerationWithProviderFallback(
      buildBriefPlannerPrompt(brand, hotspot, blueprints),
      {
        primaryProvider: "gemini",
        fallbackProvider: "minimax"
      }
    );
    plannerOutput = plannerResult.output;
    plannerProvider = plannerResult.provider;
    plannerFallbackReason = plannerResult.fallbackReason;
    plannerPayload = parseJsonPayload<PlannedBriefPayload>(plannerOutput);
  } catch {
    plannerPayload = null;
  }

  const planned = resolvePlannedBriefs(brand, hotspot, blueprints, plannerPayload);
  const slotResults = await Promise.all(
    blueprints.map(async (blueprint) => {
      try {
        const slotPrompt = buildSlotGenerationPrompt(
          brand,
          hotspot,
          blueprint,
          planned.briefs[blueprint.slot],
          planned.whyNow,
          planned.whyUs
        );
        const generationResult = await runContentGenerationWithProviderFallback(slotPrompt, {
          primaryProvider: "gemini",
          fallbackProvider: "minimax"
        });

        return {
          slot: blueprint.slot,
          output: generationResult.output,
          provider: generationResult.provider,
          fallbackReason: generationResult.fallbackReason,
          payload: parseJsonPayload<ModelGeneratedVariant>(generationResult.output)
        };
      } catch {
        return {
          slot: blueprint.slot,
          payload: null
        };
      }
    })
  );

  return {
    output: [
      plannerOutput
        ? [
            `[planner:${plannerProvider}]`,
            plannerFallbackReason ? `[planner-fallback-from:gemini]\n${plannerFallbackReason}` : null,
            plannerOutput
          ]
            .filter(Boolean)
            .join("\n")
        : null,
      ...slotResults.map((result) =>
        result.output
          ? [
              `[${result.slot}:${result.provider ?? "unknown"}]`,
              result.fallbackReason ? `[${result.slot}-fallback-from:gemini]\n${result.fallbackReason}` : null,
              result.output
            ]
              .filter(Boolean)
              .join("\n")
          : null
      )
    ]
      .filter(Boolean)
      .join("\n\n---\n\n"),
    whyNow: planned.whyNow,
    whyUs: planned.whyUs,
    variants: slotResults.reduce(
      (accumulator, result) => {
        if (result.payload) {
          accumulator[result.slot] = result.payload;
        }
        return accumulator;
      },
      {} as Partial<Record<VariantSlot, ModelGeneratedVariant>>
    )
  };
}

function mergeModelVariants(
  blueprints: VariantBlueprint[],
  fallbackVariants: ContentVariant[],
  generated: {
    whyNow: string;
    whyUs: string;
    variants: Partial<Record<VariantSlot, ModelGeneratedVariant>>;
  }
): {
  variants: ContentVariant[];
  whyNow: string;
  whyUs: string;
} {
  const variants = blueprints.map((blueprint, index) =>
    normalizeGeneratedVariant(
      blueprint,
      fallbackVariants[index],
      generated.variants[blueprint.slot],
      generated.whyNow,
      generated.whyUs
    )
  );

  return {
    variants,
    whyNow: generated.whyNow,
    whyUs: generated.whyUs
  };
}

async function persistGeneratedPack(pack: HotspotPack): Promise<{
  persisted: boolean;
  usedMockStorage: boolean;
}> {
  const supabase = getSupabaseServerClient();

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

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (workspaceError || !workspace?.id) {
    throw workspaceError ?? new Error("No workspace available for content pack persistence");
  }

  let persistedBrandId = pack.brandId;

  // In Supabase mode we must persist a UUID foreign key.
  // When brand strategy falls back to local mock data (for example id = "brand-1"),
  // this resolver upgrades it to an existing UUID brand id in the same workspace.
  if (!isUuid(persistedBrandId)) {
    const { data: firstBrand, error: brandError } = await supabase
      .from("brands")
      .select("id")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (brandError || !firstBrand?.id) {
      throw brandError ?? new Error("未找到可用品牌记录，请先在品牌系统保存品牌信息后再转为选题。");
    }

    persistedBrandId = firstBrand.id;
  }

  const packRow = {
    id: pack.id,
    workspace_id: workspace.id,
    brand_id: persistedBrandId,
    hotspot_id: pack.hotspotId,
    status: pack.status,
    why_now: pack.whyNow,
    why_us: pack.whyUs,
    review_owner: pack.reviewOwner
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
  hotspot: HotspotSignal
): Promise<GeneratedPackResult> {
  const blueprints = resolveVariantBlueprints(hotspot);
  const fallbackVariants = createTemplateVariants(brand, hotspot, blueprints);
  const modelGenerated = await tryModelGeneration(brand, hotspot, blueprints);
  const merged = mergeModelVariants(blueprints, fallbackVariants, modelGenerated);
  const pack: HotspotPack = {
    id: deterministicId(`${brand.id}:${hotspot.id}:pack`),
    brandId: brand.id,
    hotspotId: hotspot.id,
    status: "pending",
    whyNow: merged.whyNow,
    whyUs: merged.whyUs,
    reviewOwner: "品牌市场负责人",
    variants: merged.variants
  };

  const storage = await persistGeneratedPack(pack);

  return {
    pack,
    persisted: storage.persisted,
    usedMockStorage: storage.usedMockStorage,
    modelOutput: modelGenerated.output
  };
}

export async function generateContentPackForHotspot(hotspotId: string): Promise<GeneratedPackResult> {
  const [brand, hotspots] = await Promise.all([getBrandStrategyPack(), getHotspotSignals()]);
  const hotspot = hotspots.find((item) => item.id === hotspotId);

  if (!hotspot) {
    throw new Error(`Unknown hotspot: ${hotspotId}`);
  }

  return generateContentPackForEntities(brand, hotspot);
}
