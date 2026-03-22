import { createHash } from "node:crypto";
import { updateLocalDataStore } from "@/lib/data/local-store";
import { getBrandStrategyPack, getHotspotSignals } from "@/lib/data";
import { ContentVariant, HotspotPack, HotspotSignal, Platform } from "@/lib/domain/types";
import { getChinaMarketPromptLines } from "@/lib/services/china-market";
import { runModelTask } from "@/lib/services/model-router";
import { getSupabaseServerClient } from "@/lib/supabase/client";

export interface GeneratedPackResult {
  pack: HotspotPack;
  persisted: boolean;
  usedMockStorage: boolean;
  modelOutput?: string;
}

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

function createWhyNow(hotspot: HotspotSignal): string {
  return `热点来自 ${hotspot.source}，当前建议动作是 ${hotspot.recommendedAction}，速度分 ${hotspot.velocityScore}，适合先抢时间窗口。`;
}

function createWhyUs(brandName: string, hotspot: HotspotSignal): string {
  return `${brandName} 可以围绕“${hotspot.title}”输出贴近中国企业传播场景的观点，不需要硬蹭，也能建立行业判断。`;
}

function buildRapidResponseVariant(
  brandName: string,
  hotspot: HotspotSignal,
  index: number
): ContentVariant {
  const formats = [
    {
      title: `${hotspot.title} 之下，${brandName} 现在最该抢的是表达窗口`,
      angle: "快评式抢占窗口",
      body: `今天这条热点真正值得中国企业品牌关注的，不只是事件本身，而是它会迅速改变行业讨论重心。对 ${brandName} 来说，最有效的动作不是长篇解释，而是先用一句明确判断占住心智：热点一来，传播链路必须比内容团队的人肉协同更快。`,
      coverHook: "热点来了，先抢表达窗口"
    },
    {
      title: `为什么这个热点一爆，${brandName} 这样的团队要先动起来`,
      angle: "中文口播快反",
      body: `开头直接点题：这不是一个只属于媒体的热点，它会影响中国企业怎么讨论 AI、SaaS 和品牌传播。第二段讲清楚影响点，最后一句收束到品牌动作：先给判断，再出系统化内容，别等热度过去才开始写稿。`,
      coverHook: "别等热度过了才开始写"
    }
  ] as const;

  const selected = formats[index];

  return {
    id: deterministicId(`${hotspot.id}:rapid:${index}`),
    track: "rapid-response",
    title: selected.title,
    angle: selected.angle,
    platforms: resolvePlatforms("rapid-response", hotspot),
    format: resolveFormat("rapid-response", index),
    body: selected.body,
    coverHook: selected.coverHook,
    publishWindow: resolvePublishWindow("rapid-response", index)
  };
}

function buildPointOfViewVariant(
  brandName: string,
  hotspot: HotspotSignal,
  index: number
): ContentVariant {
  const formats = [
    {
      title: `${hotspot.title} 之后，中国企业品牌团队真正该重做的是什么`,
      angle: "行业方法论解读",
      body: `如果只把这条热点当成一条新闻，价值很快就过去了。更值得写的是，它会如何影响中国企业的内容生产方式、品牌表达节奏和审核机制。对 ${brandName} 来说，这正好可以延展出一个观点：真正拉开差距的，不是追热点的速度，而是把热点沉淀进可复用传播系统的能力。`,
      coverHook: "热点过去后，真正留下什么"
    },
    {
      title: `别只讨论热点本身，${brandName} 更想提醒品牌团队这 3 个变化`,
      angle: "结构化观点输出",
      body: `第一，热点会加速行业对“快反”的期待，但快不等于乱。第二，中国平台环境更看重表达边界和内容语境，不能直接照搬海外营销语法。第三，品牌如果要长期建立专业度，就必须把快反内容和观点内容双轨运行，而不是只做一次性发声。`,
      coverHook: "这 3 个变化更值得写"
    }
  ] as const;

  const selected = formats[index];

  return {
    id: deterministicId(`${hotspot.id}:pov:${index}`),
    track: "point-of-view",
    title: selected.title,
    angle: selected.angle,
    platforms: resolvePlatforms("point-of-view", hotspot),
    format: resolveFormat("point-of-view", index),
    body: selected.body,
    coverHook: selected.coverHook,
    publishWindow: resolvePublishWindow("point-of-view", index)
  };
}

function createTemplateVariants(brandName: string, hotspot: HotspotSignal): ContentVariant[] {
  return [
    buildRapidResponseVariant(brandName, hotspot, 0),
    buildRapidResponseVariant(brandName, hotspot, 1),
    buildPointOfViewVariant(brandName, hotspot, 0),
    buildPointOfViewVariant(brandName, hotspot, 1)
  ];
}

async function tryModelPolish(
  brandName: string,
  hotspot: HotspotSignal,
  variants: ContentVariant[]
): Promise<string | undefined> {
  try {
    const prompt = [
      `品牌: ${brandName}`,
      `热点标题: ${hotspot.title}`,
      `热点摘要: ${hotspot.summary}`,
      "本土化要求:",
      ...getChinaMarketPromptLines().map((line) => `- ${line}`),
      "以下是已生成的 4 条候选内容，请做中文商业传播语境下的润色建议，不要重写为英文腔。",
      JSON.stringify(variants, null, 2)
    ].join("\n");

    return await runModelTask("copy-polish", prompt);
  } catch {
    return undefined;
  }
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

  const packRow = {
    id: pack.id,
    workspace_id: workspace.id,
    brand_id: pack.brandId,
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
  brand: Awaited<ReturnType<typeof getBrandStrategyPack>>,
  hotspot: HotspotSignal
): Promise<GeneratedPackResult> {
  const variants = createTemplateVariants(brand.name, hotspot);
  const pack: HotspotPack = {
    id: deterministicId(`${brand.id}:${hotspot.id}:pack`),
    brandId: brand.id,
    hotspotId: hotspot.id,
    status: "pending",
    whyNow: createWhyNow(hotspot),
    whyUs: createWhyUs(brand.name, hotspot),
    reviewOwner: "品牌市场负责人",
    variants
  };

  const modelOutput = await tryModelPolish(brand.name, hotspot, variants);
  const storage = await persistGeneratedPack(pack);

  return {
    pack,
    persisted: storage.persisted,
    usedMockStorage: storage.usedMockStorage,
    modelOutput
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
