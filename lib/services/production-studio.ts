import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBrandStrategyPack, getHotspotPack, getHotspotSignals, queuePublishJobs } from "@/lib/data";
import type { AiProvider } from "@/lib/domain/ai-routing";
import type { ContentVariant, HotspotPack } from "@/lib/domain/types";
import type { ModelRouteDecision } from "@/lib/domain/types";
import { generateOpenAiProductionImage } from "@/lib/services/providers/image/openai-image";
import { generateOpenAiProductionVideo } from "@/lib/services/providers/video/openai-sora";
import { decideModelRoute, runResolvedModelTask } from "@/lib/services/model-router";

export type ProductionJobStatus = "queued" | "running" | "completed" | "failed";
export type ProductionStageStatus = "pending" | "processing" | "done" | "failed";
export type ProductionStageKey = "script" | "image" | "video" | "voice" | "subtitle" | "finalize";

export interface ProductionStage {
  key: ProductionStageKey;
  label: string;
  status: ProductionStageStatus;
  provider: string;
  model: string;
  note: string;
  updatedAt: string;
}

export interface ProductionOutputs {
  articleTitle: string;
  articleBody: string;
  videoHook: string;
  videoScript: string;
  storyboard: string;
  imagePrompt: string;
  videoPrompt: string;
  subtitleSrt: string;
  voiceoverText: string;
  imagePreviewUrl: string;
  videoPreviewUrl: string;
  audioPreviewUrl: string;
}

export interface ProductionRouteInfo {
  requestedProvider: AiProvider | null;
  requestedModel: string | null;
  effectiveProvider: string;
  effectiveModel: string;
  reason: string;
}

export interface ProductionJobRecord {
  id: string;
  packId: string;
  status: ProductionJobStatus;
  mode: "preview-pipeline";
  runCount: number;
  createdAt: string;
  updatedAt: string;
  route: ProductionRouteInfo;
  stages: ProductionStage[];
  outputs: ProductionOutputs;
}

interface ProductionStore {
  jobs: ProductionJobRecord[];
}

const assetStageBlueprint: Array<Pick<ProductionStage, "key" | "label" | "provider" | "model">> = [
  {
    key: "image",
    label: "图片生成",
    provider: "OpenAI Images",
    model: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1.5"
  },
  {
    key: "video",
    label: "视频生成",
    provider: "OpenAI Sora",
    model: process.env.OPENAI_VIDEO_MODEL?.trim() || "sora-2"
  },
  {
    key: "voice",
    label: "口播合成",
    provider: "独立制作模块",
    model: "preview-voice-pipeline"
  },
  {
    key: "subtitle",
    label: "字幕生成",
    provider: "独立制作模块",
    model: "preview-subtitle-pipeline"
  },
  {
    key: "finalize",
    label: "成片打包",
    provider: "FFmpeg",
    model: "local-render"
  }
];

const storeDirectory = path.join(process.cwd(), ".runtime");
const storeFile = path.join(storeDirectory, "production-studio.json");
const tempStoreFile = path.join(storeDirectory, "production-studio.tmp.json");

let storeUpdateQueue: Promise<void> = Promise.resolve();
let memoryStore: ProductionStore | null = null;
let fileStoreAvailable: boolean | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deterministicId(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function buildInitialStore(): ProductionStore {
  return {
    jobs: []
  };
}

function normalizeStoredProvider(value: unknown): AiProvider | null {
  return value === "gemini" || value === "minimax" ? value : null;
}

function normalizeStore(raw: Partial<ProductionStore> | null | undefined): ProductionStore {
  return {
    jobs: Array.isArray(raw?.jobs)
      ? clone(raw.jobs).map((job) => ({
          ...job,
          route: {
            requestedProvider: normalizeStoredProvider(job?.route?.requestedProvider),
            requestedModel:
              typeof job?.route?.requestedModel === "string" && job.route.requestedModel.trim()
                ? job.route.requestedModel.trim()
                : null,
            effectiveProvider:
              typeof job?.route?.effectiveProvider === "string" && job.route.effectiveProvider.trim()
                ? job.route.effectiveProvider.trim()
                : "mock",
            effectiveModel:
              typeof job?.route?.effectiveModel === "string" && job.route.effectiveModel.trim()
                ? job.route.effectiveModel.trim()
                : "template-engine",
            reason:
              typeof job?.route?.reason === "string" && job.route.reason.trim()
                ? job.route.reason.trim()
                : "历史记录未保存模型路由，已按兼容模式补齐。"
          }
        }))
      : []
  };
}

async function ensureStoreFile(): Promise<void> {
  try {
    await mkdir(storeDirectory, { recursive: true });

    try {
      await readFile(storeFile, "utf8");
    } catch {
      await writeFile(storeFile, JSON.stringify(buildInitialStore(), null, 2), "utf8");
    }

    fileStoreAvailable = true;
  } catch (error) {
    fileStoreAvailable = false;
    console.warn("[production-studio] Falling back to in-memory store", error);
  }
}

async function readStore(): Promise<ProductionStore> {
  await ensureStoreFile();

  if (fileStoreAvailable === false) {
    if (!memoryStore) {
      memoryStore = buildInitialStore();
    }

    return clone(memoryStore);
  }

  try {
    const content = await readFile(storeFile, "utf8");
    const parsed = JSON.parse(content) as Partial<ProductionStore>;
    return normalizeStore(parsed);
  } catch {
    const initial = buildInitialStore();

    try {
      await writeFile(storeFile, JSON.stringify(initial, null, 2), "utf8");
      fileStoreAvailable = true;
      return initial;
    } catch (error) {
      fileStoreAvailable = false;
      memoryStore = initial;
      console.warn("[production-studio] Failed to rebuild store file, using memory store", error);
      return clone(initial);
    }
  }
}

async function writeStore(store: ProductionStore): Promise<ProductionStore> {
  const normalized = normalizeStore(store);
  await ensureStoreFile();

  if (fileStoreAvailable === false) {
    memoryStore = clone(normalized);
    return clone(normalized);
  }

  try {
    await writeFile(tempStoreFile, JSON.stringify(normalized, null, 2), "utf8");
    await rename(tempStoreFile, storeFile);
    fileStoreAvailable = true;
    return normalized;
  } catch (error) {
    fileStoreAvailable = false;
    memoryStore = clone(normalized);
    console.warn("[production-studio] Failed to persist store file, using memory store", error);
    return clone(normalized);
  }
}

async function updateStore(updater: (store: ProductionStore) => ProductionStore | Promise<ProductionStore>) {
  let resolveQueue: (() => void) | undefined;
  const previous = storeUpdateQueue;

  storeUpdateQueue = new Promise<void>((resolve) => {
    resolveQueue = resolve;
  });

  await previous;

  try {
    const current = await readStore();
    const next = await updater(current);
    return await writeStore(next);
  } finally {
    resolveQueue?.();
  }
}

function pickVariant(pack: HotspotPack, matcher: (variant: ContentVariant) => boolean): ContentVariant {
  return (
    pack.variants.find(matcher) ??
    pack.variants[0] ?? {
      id: "fallback",
      track: "rapid-response",
      title: pack.whyNow,
      angle: "品牌视角快反",
      platforms: ["xiaohongshu"],
      format: "post",
      body: `${pack.whyNow}\n\n${pack.whyUs}`,
      coverHook: pack.whyNow,
      publishWindow: "尽快"
    }
  );
}

function toSrtTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${seconds},000`;
}

function buildSubtitleSrt(script: string): string {
  const lines = script
    .split(/\n+/)
    .map((line) => line.replace(/^【[^】]+】\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 12);

  if (lines.length === 0) {
    return "1\n00:00:00,000 --> 00:00:04,000\n本段字幕待补充。";
  }

  return lines
    .map((line, index) => {
      const start = index * 4;
      const end = start + 4;
      return `${index + 1}\n${toSrtTime(start)} --> ${toSrtTime(end)}\n${line}`;
    })
    .join("\n\n");
}

function buildStoryboard(videoScript: string): string {
  const beats = videoScript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (beats.length === 0) {
    return "镜头 1：品牌 logo 开场\n镜头 2：问题背景\n镜头 3：核心判断\n镜头 4：行动建议";
  }

  return beats
    .map((beat, index) => `镜头 ${index + 1}（4s）：${beat}`)
    .join("\n");
}

interface ProductionDraftPayload {
  articleTitle?: string;
  articleBody?: string;
  videoHook?: string;
  videoScript?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  voiceoverText?: string;
}

export interface ProductionGenerationSelection {
  provider?: AiProvider;
  model?: string;
  imageProvider?: AiProvider;
  imageModel?: string;
  videoProvider?: AiProvider;
  videoModel?: string;
}

interface ProductionDraftGenerationResult {
  route: ModelRouteDecision;
  payload: ProductionDraftPayload | null;
  note: string;
}

interface ProductionPromptPlanningResult {
  route: ModelRouteDecision;
  prompt: string;
  note: string;
}

interface ProductionStageExecutionResult {
  status: ProductionStageStatus;
  provider: string;
  model: string;
  note: string;
}

interface ProductionAssetExecutionResult extends ProductionStageExecutionResult {
  previewUrl?: string;
  audioPreviewUrl?: string;
}

function getProviderLabel(provider: string): string {
  if (provider === "minimax") {
    return "MiniMax";
  }

  if (provider === "gemini") {
    return "Gemini";
  }

  if (provider === "mock") {
    return "本地模板";
  }

  return provider;
}

function normalizeGeneratedText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizePromptText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/^(提示词|prompt|image prompt|video prompt)\s*[:：]\s*/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseJsonCandidate(input: string): Record<string, unknown> | null {
  const candidates = [
    input.trim(),
    input.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim(),
    input.match(/```\s*([\s\S]*?)```/i)?.[1]?.trim()
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function parseProductionDraftPayload(input: string): ProductionDraftPayload | null {
  const parsed = parseJsonCandidate(input);

  if (!parsed) {
    return null;
  }

  return {
    articleTitle: normalizeGeneratedText(parsed.articleTitle),
    articleBody: normalizeGeneratedText(parsed.articleBody),
    videoHook: normalizeGeneratedText(parsed.videoHook),
    videoScript: normalizeGeneratedText(parsed.videoScript),
    imagePrompt: normalizeGeneratedText(parsed.imagePrompt),
    videoPrompt: normalizeGeneratedText(parsed.videoPrompt),
    voiceoverText: normalizeGeneratedText(parsed.voiceoverText)
  };
}

function buildOutputs(pack: HotspotPack): ProductionOutputs {
  const articleVariant = pickVariant(pack, (variant) => variant.format === "article" || variant.platforms.includes("wechat"));
  const videoVariant = pickVariant(
    pack,
    (variant) =>
      variant.format === "video-script" || variant.platforms.includes("video-channel") || variant.platforms.includes("douyin")
  );

  const videoScript = videoVariant.body.trim() || `${pack.whyNow}\n\n${pack.whyUs}`;
  const subtitleSrt = buildSubtitleSrt(videoScript);
  const storyboard = buildStoryboard(videoScript);

  return {
    articleTitle: articleVariant.title,
    articleBody: articleVariant.body,
    videoHook: videoVariant.coverHook,
    videoScript,
    storyboard,
    imagePrompt: `${videoVariant.title}，品牌视角，新闻感封面，中文标题可读，适合小红书与公众号封面。`,
    videoPrompt: `${videoVariant.angle}，9:16 竖版，新闻快反风格，节奏清晰，突出品牌判断与行动建议。`,
    subtitleSrt,
    voiceoverText: videoScript,
    imagePreviewUrl: `https://picsum.photos/seed/${encodeURIComponent(`${pack.id}-cover`)}/1080/1920`,
    videoPreviewUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    audioPreviewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
  };
}

function mergeOutputs(base: ProductionOutputs, generated: ProductionDraftPayload | null): ProductionOutputs {
  const videoScript = generated?.videoScript ?? base.videoScript;
  const voiceoverText = generated?.voiceoverText ?? videoScript;

  return {
    ...base,
    articleTitle: generated?.articleTitle ?? base.articleTitle,
    articleBody: generated?.articleBody ?? base.articleBody,
    videoHook: generated?.videoHook ?? base.videoHook,
    videoScript,
    storyboard: buildStoryboard(videoScript),
    imagePrompt: generated?.imagePrompt ?? base.imagePrompt,
    videoPrompt: generated?.videoPrompt ?? base.videoPrompt,
    subtitleSrt: buildSubtitleSrt(videoScript),
    voiceoverText
  };
}

function buildProductionPrompt(input: {
  brandName: string;
  pack: HotspotPack;
  hotspotTitle?: string;
  hotspotSummary?: string;
  base: ProductionOutputs;
}) {
  const articleVariant = pickVariant(input.pack, (variant) => variant.format === "article" || variant.platforms.includes("wechat"));
  const videoVariant = pickVariant(
    input.pack,
    (variant) =>
      variant.format === "video-script" ||
      variant.platforms.includes("video-channel") ||
      variant.platforms.includes("douyin")
  );

  return [
    "你是中国内容操盘手，要为品牌热点一键制作首版图文与短视频脚本。",
    "请只返回 JSON，不要解释，不要 markdown。",
    'JSON 字段固定为: articleTitle, articleBody, videoHook, videoScript, imagePrompt, videoPrompt, voiceoverText。',
    "要求：",
    "- 全部使用简体中文。",
    "- 图文正文要像可直接发布的首版草稿，不要写成提纲。",
    "- 视频脚本要适合 45-60 秒竖版短视频，有钩子、判断、动作建议。",
    "- voiceoverText 要可直接给 TTS 使用，尽量与 videoScript 一致但更口语。",
    "- imagePrompt 要适合封面/配图生成，突出中文标题可读性。",
    "- videoPrompt 要适合视频生成或镜头规划，明确风格、画幅、节奏。",
    `品牌: ${input.brandName}`,
    `热点标题: ${input.hotspotTitle ?? input.pack.whyNow}`,
    `热点摘要: ${input.hotspotSummary ?? input.pack.whyNow}`,
    `为什么现在做: ${input.pack.whyNow}`,
    `为什么品牌适合做: ${input.pack.whyUs}`,
    `图文角度: ${articleVariant.angle}`,
    `视频角度: ${videoVariant.angle}`,
    `当前图文标题参考: ${input.base.articleTitle}`,
    "当前图文正文参考:",
    input.base.articleBody,
    "当前视频脚本参考:",
    input.base.videoScript
  ].join("\n");
}

async function generateDraftWithAi(
  pack: HotspotPack,
  baseOutputs: ProductionOutputs,
  brandName: string,
  selection?: ProductionGenerationSelection
): Promise<ProductionDraftGenerationResult> {
  const signals = await getHotspotSignals();
  const hotspot = signals.find((item) => item.id === pack.hotspotId);
  const route = await decideModelRoute("content-generation", {
    feature: "production-generation",
    desiredProvider: selection?.provider,
    modelOverride: selection?.model
  });

  if (route.provider === "mock") {
    return {
      route,
      payload: null,
      note: "未检测到可用 AI 密钥，已回退为本地模板首版。"
    };
  }

  try {
    const output = await runResolvedModelTask(
      route,
      buildProductionPrompt({
        brandName,
        pack,
        hotspotTitle: hotspot?.title,
        hotspotSummary: hotspot?.summary,
        base: baseOutputs
      })
    );
    const payload = parseProductionDraftPayload(output);

    return {
      route,
      payload,
      note: payload
        ? "已完成首版图文与视频脚本生成。"
        : "AI 返回结构不完整，已自动回退到模板草稿。"
    };
  } catch (error) {
    return {
      route,
      payload: null,
      note: `AI 调用失败，已回退到模板草稿。${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}

function buildAssetPlanningPrompt(input: {
  kind: "image" | "video";
  brandName: string;
  pack: HotspotPack;
  hotspotTitle?: string;
  basePrompt: string;
}) {
  const kindLabel = input.kind === "image" ? "图片" : "视频";
  const extraRule =
    input.kind === "image"
      ? "输出 1 条可直接给图片模型使用的中文提示词，强调主体、构图、风格、文字可读性，不要解释。"
      : "输出 1 条可直接给视频模型使用的中文提示词，强调主体、动作、镜头、画幅、节奏，不要解释。";

  return [
    `你是短内容制作团队里的${kindLabel}提示词策划。`,
    extraRule,
    "只返回提示词正文，不要 markdown，不要序号，不要补充说明。",
    `品牌: ${input.brandName}`,
    `热点标题: ${input.hotspotTitle ?? input.pack.whyNow}`,
    `为什么现在做: ${input.pack.whyNow}`,
    `为什么品牌适合做: ${input.pack.whyUs}`,
    `当前基础提示词: ${input.basePrompt}`
  ].join("\n");
}

async function planAssetPrompt(input: {
  kind: "image" | "video";
  brandName: string;
  pack: HotspotPack;
  hotspotTitle?: string;
  basePrompt: string;
  selection?: {
    provider?: AiProvider;
    model?: string;
  };
}): Promise<ProductionPromptPlanningResult> {
  const route = await decideModelRoute("content-generation", {
    feature: "production-generation",
    desiredProvider: input.selection?.provider ?? "minimax",
    modelOverride: input.selection?.model
  });

  if (route.provider === "mock") {
    return {
      route,
      prompt: input.basePrompt,
      note: `未检测到可用策划模型，已直接使用基础${input.kind === "image" ? "图片" : "视频"}提示词。`
    };
  }

  try {
    const output = await runResolvedModelTask(
      route,
      buildAssetPlanningPrompt({
        kind: input.kind,
        brandName: input.brandName,
        pack: input.pack,
        hotspotTitle: input.hotspotTitle,
        basePrompt: input.basePrompt
      })
    );
    const prompt = normalizePromptText(output) || input.basePrompt;

    return {
      route,
      prompt,
      note: `已使用 ${getProviderLabel(route.provider)} · ${route.model} 规划${input.kind === "image" ? "图片" : "视频"}提示词。`
    };
  } catch (error) {
    return {
      route,
      prompt: input.basePrompt,
      note: `调用 ${getProviderLabel(route.provider)} · ${route.model} 规划${input.kind === "image" ? "图片" : "视频"}提示词失败，已回退基础提示词。${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}

async function generateImageAsset(
  packId: string,
  jobId: string,
  prompt: string
): Promise<ProductionAssetExecutionResult> {
  const result = await generateOpenAiProductionImage({
    packId,
    jobId,
    prompt
  });

  return {
    status: result.status,
    provider: result.provider,
    model: result.model,
    note:
      result.status === "done"
        ? result.note
        : `图片阶段失败，当前仍保留占位图预览。${result.note ? ` ${result.note}` : ""}`.trim(),
    previewUrl: result.previewUrl
  };
}

async function generateVideoAsset(
  packId: string,
  jobId: string,
  prompt: string
): Promise<ProductionAssetExecutionResult> {
  const result = await generateOpenAiProductionVideo({
    packId,
    jobId,
    prompt
  });

  return {
    status: result.status,
    provider: result.provider,
    model: result.model,
    note:
      result.status === "done"
        ? result.note
        : `视频阶段失败，当前仍保留示例视频预览。${result.note ? ` ${result.note}` : ""}`.trim(),
    previewUrl: result.previewUrl,
    audioPreviewUrl: result.audioPreviewUrl
  };
}

function buildStages(
  now: string,
  generated: ProductionDraftGenerationResult,
  imagePlanning: ProductionPromptPlanningResult,
  videoPlanning: ProductionPromptPlanningResult,
  imageResult: ProductionAssetExecutionResult,
  videoResult: ProductionAssetExecutionResult
): ProductionStage[] {
  return [
    {
      key: "script",
      label: "脚本生成",
      provider: getProviderLabel(generated.route.provider),
      model: generated.route.model,
      status: "done",
      note: generated.note,
      updatedAt: now
    },
    {
      key: "image",
      label: "图片生成",
      provider: imageResult.provider,
      model: imageResult.model,
      status: imageResult.status,
      note: `${imagePlanning.note} ${imageResult.note}`.trim(),
      updatedAt: now
    },
    {
      key: "video",
      label: "视频生成",
      provider: videoResult.provider,
      model: videoResult.model,
      status: videoResult.status,
      note: `${videoPlanning.note} ${videoResult.note}`.trim(),
      updatedAt: now
    },
    {
      key: "voice",
      label: "口播合成",
      provider: videoResult.status === "done" ? videoResult.provider : assetStageBlueprint.find((stage) => stage.key === "voice")!.provider,
      model: videoResult.status === "done" ? videoResult.model : assetStageBlueprint.find((stage) => stage.key === "voice")!.model,
      status: videoResult.status === "done" ? "done" : "pending",
      note:
        videoResult.status === "done"
          ? "当前优先复用生成视频中的同步音轨作为预览口播。"
          : "待接独立 TTS 模块；当前未产出真实口播音轨。",
      updatedAt: now
    },
    {
      key: "subtitle",
      label: "字幕生成",
      provider: assetStageBlueprint.find((stage) => stage.key === "subtitle")!.provider,
      model: assetStageBlueprint.find((stage) => stage.key === "subtitle")!.model,
      status: "done",
      note: "已根据视频脚本生成可编辑 SRT 草稿。",
      updatedAt: now
    },
    {
      key: "finalize",
      label: "成片打包",
      provider: assetStageBlueprint.find((stage) => stage.key === "finalize")!.provider,
      model: assetStageBlueprint.find((stage) => stage.key === "finalize")!.model,
      status: imageResult.status === "done" && videoResult.status === "done" ? "done" : "pending",
      note:
        imageResult.status === "done" && videoResult.status === "done"
          ? "已完成真实素材预览包整理，可继续人工微调后推入发布队列。"
          : "真实多媒体素材未全部完成，当前先保留可编辑草稿。",
      updatedAt: now
    }
  ];
}

export async function listProductionJobs(): Promise<ProductionJobRecord[]> {
  const store = await readStore();

  return [...store.jobs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getLatestProductionJobForPack(packId: string): Promise<ProductionJobRecord | null> {
  const jobs = await listProductionJobs();
  return jobs.find((job) => job.packId === packId) ?? null;
}

export async function runOneClickProduction(
  packId: string,
  selection?: ProductionGenerationSelection
): Promise<ProductionJobRecord> {
  const pack = await getHotspotPack(packId);

  if (!pack) {
    throw new Error("未找到对应选题");
  }

  if (pack.status !== "approved") {
    throw new Error("只有审核通过的选题才能一键制作");
  }

  const brand = await getBrandStrategyPack();
  const now = new Date().toISOString();
  const previous = await getLatestProductionJobForPack(pack.id);
  const runCount = (previous?.runCount ?? 0) + 1;
  const jobId = deterministicId(`${pack.id}:run:${runCount}`);
  const baseOutputs = buildOutputs(pack);
  const generated = await generateDraftWithAi(pack, baseOutputs, brand.name, selection);
  let outputs = mergeOutputs(baseOutputs, generated.payload);
  const signals = await getHotspotSignals();
  const hotspot = signals.find((item) => item.id === pack.hotspotId);
  const [imagePlanning, videoPlanning] = await Promise.all([
    planAssetPrompt({
      kind: "image",
      brandName: brand.name,
      pack,
      hotspotTitle: hotspot?.title,
      basePrompt: outputs.imagePrompt,
      selection: {
        provider: selection?.imageProvider,
        model: selection?.imageModel
      }
    }),
    planAssetPrompt({
      kind: "video",
      brandName: brand.name,
      pack,
      hotspotTitle: hotspot?.title,
      basePrompt: outputs.videoPrompt,
      selection: {
        provider: selection?.videoProvider,
        model: selection?.videoModel
      }
    })
  ]);
  const [imageResult, videoResult] = await Promise.all([
    generateImageAsset(pack.id, jobId, imagePlanning.prompt),
    generateVideoAsset(pack.id, jobId, videoPlanning.prompt)
  ]);

  outputs = {
    ...outputs,
    imagePrompt: imagePlanning.prompt,
    videoPrompt: videoPlanning.prompt,
    imagePreviewUrl: imageResult.previewUrl ?? outputs.imagePreviewUrl,
    videoPreviewUrl: videoResult.previewUrl ?? outputs.videoPreviewUrl,
    audioPreviewUrl: videoResult.audioPreviewUrl ?? outputs.audioPreviewUrl
  };
  const jobStatus: ProductionJobStatus =
    imageResult.status === "done" && videoResult.status === "done" ? "completed" : "failed";

  const job: ProductionJobRecord = {
    id: jobId,
    packId: pack.id,
    status: jobStatus,
    mode: "preview-pipeline",
    runCount,
    createdAt: now,
    updatedAt: now,
    route: {
      requestedProvider: selection?.provider ?? null,
      requestedModel: selection?.model?.trim() || null,
      effectiveProvider: generated.route.provider,
      effectiveModel: generated.route.model,
      reason: generated.route.reason
    },
    stages: buildStages(now, generated, imagePlanning, videoPlanning, imageResult, videoResult),
    outputs: {
      ...outputs,
      articleBody: `【品牌：${brand.name}】\n\n${outputs.articleBody}`
    }
  };

  await updateStore((store) => ({
    ...store,
    jobs: [job, ...store.jobs.filter((item) => item.id !== job.id)].slice(0, 80)
  }));

  return job;
}

export async function updateProductionDraft(
  packId: string,
  input: Partial<Pick<ProductionOutputs, "articleTitle" | "articleBody" | "videoScript" | "voiceoverText" | "subtitleSrt">>
): Promise<ProductionJobRecord | null> {
  let updated: ProductionJobRecord | null = null;

  await updateStore((store) => {
    const jobs = [...store.jobs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const latest = jobs.find((job) => job.packId === packId);

    if (!latest) {
      return store;
    }

    const merged: ProductionJobRecord = {
      ...latest,
      updatedAt: new Date().toISOString(),
      outputs: {
        ...latest.outputs,
        articleTitle: input.articleTitle ?? latest.outputs.articleTitle,
        articleBody: input.articleBody ?? latest.outputs.articleBody,
        videoScript: input.videoScript ?? latest.outputs.videoScript,
        voiceoverText: input.voiceoverText ?? latest.outputs.voiceoverText,
        subtitleSrt: input.subtitleSrt ?? latest.outputs.subtitleSrt
      }
    };

    const finalVideoScript = merged.outputs.videoScript;
    const finalVoiceoverText = input.voiceoverText ?? merged.outputs.voiceoverText;
    const finalSubtitleSrt = input.subtitleSrt ?? buildSubtitleSrt(finalVideoScript);

    merged.outputs = {
      ...merged.outputs,
      videoScript: finalVideoScript,
      voiceoverText: finalVoiceoverText,
      subtitleSrt: finalSubtitleSrt,
      storyboard: buildStoryboard(finalVideoScript)
    };

    updated = merged;

    return {
      ...store,
      jobs: [merged, ...store.jobs.filter((item) => item.id !== latest.id)]
    };
  });

  return updated;
}

export async function pushProductionBundleToPublish(packId: string): Promise<{
  queuedCount: number;
  jobId: string | null;
}> {
  const latest = await getLatestProductionJobForPack(packId);

  if (!latest) {
    throw new Error("请先执行一键制作，再推入发布队列");
  }

  const result = await queuePublishJobs(packId, {
    queueSource: "auto"
  });

  return {
    queuedCount: result.jobs.length,
    jobId: latest.id
  };
}
