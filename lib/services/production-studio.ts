import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBrandStrategyPack, getHotspotPack, queuePublishJobs } from "@/lib/data";
import type { ContentVariant, HotspotPack } from "@/lib/domain/types";

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

export interface ProductionJobRecord {
  id: string;
  packId: string;
  status: ProductionJobStatus;
  mode: "preview-pipeline";
  runCount: number;
  createdAt: string;
  updatedAt: string;
  stages: ProductionStage[];
  outputs: ProductionOutputs;
}

interface ProductionStore {
  jobs: ProductionJobRecord[];
}

const stageBlueprint: Array<Pick<ProductionStage, "key" | "label" | "provider" | "model">> = [
  {
    key: "script",
    label: "脚本生成",
    provider: "Gemini",
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-pro"
  },
  {
    key: "image",
    label: "图片生成",
    provider: "OpenAI Images",
    model: "gpt-image-1"
  },
  {
    key: "video",
    label: "视频生成",
    provider: "OpenAI Sora",
    model: "sora-2"
  },
  {
    key: "voice",
    label: "口播合成",
    provider: "OpenAI TTS",
    model: "gpt-4o-mini-tts"
  },
  {
    key: "subtitle",
    label: "字幕生成",
    provider: "OpenAI STT",
    model: "gpt-4o-transcribe"
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

function normalizeStore(raw: Partial<ProductionStore> | null | undefined): ProductionStore {
  return {
    jobs: Array.isArray(raw?.jobs) ? clone(raw.jobs) : []
  };
}

async function ensureStoreFile(): Promise<void> {
  await mkdir(storeDirectory, { recursive: true });

  try {
    await readFile(storeFile, "utf8");
  } catch {
    await writeFile(storeFile, JSON.stringify(buildInitialStore(), null, 2), "utf8");
  }
}

async function readStore(): Promise<ProductionStore> {
  await ensureStoreFile();

  try {
    const content = await readFile(storeFile, "utf8");
    const parsed = JSON.parse(content) as Partial<ProductionStore>;
    return normalizeStore(parsed);
  } catch {
    const initial = buildInitialStore();
    await writeFile(storeFile, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
}

async function writeStore(store: ProductionStore): Promise<ProductionStore> {
  const normalized = normalizeStore(store);
  await ensureStoreFile();
  await writeFile(tempStoreFile, JSON.stringify(normalized, null, 2), "utf8");
  await rename(tempStoreFile, storeFile);
  return normalized;
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

function buildCompletedStages(now: string): ProductionStage[] {
  return stageBlueprint.map((stage) => ({
    ...stage,
    status: "done",
    note:
      stage.key === "image" || stage.key === "video" || stage.key === "voice" || stage.key === "subtitle"
        ? "当前为可演示流程，已产出可编辑草稿与预览占位资源。"
        : "已完成。",
    updatedAt: now
  }));
}

export async function listProductionJobs(): Promise<ProductionJobRecord[]> {
  const store = await readStore();

  return [...store.jobs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getLatestProductionJobForPack(packId: string): Promise<ProductionJobRecord | null> {
  const jobs = await listProductionJobs();
  return jobs.find((job) => job.packId === packId) ?? null;
}

export async function runOneClickProduction(packId: string): Promise<ProductionJobRecord> {
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
  const outputs = buildOutputs(pack);

  const job: ProductionJobRecord = {
    id: jobId,
    packId: pack.id,
    status: "completed",
    mode: "preview-pipeline",
    runCount,
    createdAt: now,
    updatedAt: now,
    stages: buildCompletedStages(now),
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
