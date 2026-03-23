import { randomUUID } from "node:crypto";
import { getBrandStrategyPack, getHotspotPack, getHotspotSignals } from "@/lib/data";
import { readLocalDataStore, updateLocalDataStore } from "@/lib/data/local-store";
import {
  ProductionAsset,
  ProductionAssetKind,
  ProductionDraft,
  ProductionJob,
  ProductionJobStage,
  ProductionJobStatus
} from "@/lib/domain/types";
import { generateImageAssets, generateVideoAssets } from "@/lib/services/multimodal-pipeline";
import { decideModelRoute, runModelTask } from "@/lib/services/model-router";

const stageOrder: ProductionJobStage[] = ["script", "image", "video", "voice", "subtitle", "finalize"];

const stageRank = new Map(stageOrder.map((stage, index) => [stage, index]));

function stageGte(left: ProductionJobStage, right: ProductionJobStage): boolean {
  return (stageRank.get(left) ?? 0) >= (stageRank.get(right) ?? 0);
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSvgDataUrl(input: { title: string; subtitle: string; tint?: string }): string {
  const tint = input.tint ?? "#101820";
  const title = escapeXml(input.title).slice(0, 88);
  const subtitle = escapeXml(input.subtitle).slice(0, 120);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${tint}" />
      <stop offset="100%" stop-color="#1f2937" />
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)" rx="36"/>
  <rect x="58" y="54" width="1084" height="567" fill="rgba(255,255,255,0.08)" rx="28"/>
  <text x="90" y="198" fill="#ffffff" font-family="PingFang SC, Arial, sans-serif" font-size="58" font-weight="700">${title}</text>
  <text x="90" y="278" fill="#dbe3ef" font-family="PingFang SC, Arial, sans-serif" font-size="34" font-weight="400">${subtitle}</text>
  <text x="90" y="612" fill="rgba(255,255,255,0.82)" font-family="PingFang SC, Arial, sans-serif" font-size="24">AI Production Preview</text>
</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function formatSrtTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = String(Math.floor(safe / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const seconds = String(safe % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds},000`;
}

function buildSubtitleFromScript(script: string): string {
  const chunks = script
    .split(/[。！？!?.\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (chunks.length === 0) {
    return [
      "1",
      "00:00:00,000 --> 00:00:03,000",
      "暂未生成字幕内容。"
    ].join("\n");
  }

  return chunks
    .map((line, index) => {
      const start = index * 3;
      const end = start + 3;
      return [String(index + 1), `${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}`, line].join("\n");
    })
    .join("\n\n");
}

function makeAsset(input: {
  workspaceId: string;
  packId: string;
  jobId: string;
  kind: ProductionAssetKind;
  name: string;
  provider: string;
  model: string;
  previewUrl?: string;
  textContent?: string;
  jsonContent?: string;
  status?: "ready" | "failed";
  errorMessage?: string;
}): ProductionAsset {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    packId: input.packId,
    jobId: input.jobId,
    kind: input.kind,
    name: input.name,
    status: input.status ?? "ready",
    provider: input.provider,
    model: input.model,
    previewUrl: input.previewUrl,
    textContent: input.textContent,
    jsonContent: input.jsonContent,
    errorMessage: input.errorMessage,
    createdAt: now,
    updatedAt: now
  };
}

export async function createProductionJob(input: {
  workspaceId: string;
  packId: string;
  createdBy?: string;
}): Promise<ProductionJob> {
  const now = new Date().toISOString();
  const job: ProductionJob = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    packId: input.packId,
    status: "queued",
    stage: "script",
    createdBy: input.createdBy,
    retryCount: 0,
    createdAt: now,
    updatedAt: now
  };

  await updateLocalDataStore((store) => ({
    ...store,
    productionJobs: [job, ...store.productionJobs]
  }));

  return job;
}

export async function getProductionJobById(jobId: string): Promise<ProductionJob | null> {
  const store = await readLocalDataStore();
  return store.productionJobs.find((job) => job.id === jobId) ?? null;
}

export async function listProductionJobsByPack(packId: string): Promise<ProductionJob[]> {
  const store = await readLocalDataStore();
  return store.productionJobs
    .filter((job) => job.packId === packId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function updateProductionJob(
  jobId: string,
  input: {
    status?: ProductionJobStatus;
    stage?: ProductionJobStage;
    errorMessage?: string;
    retryCount?: number;
  }
): Promise<ProductionJob | null> {
  let updated: ProductionJob | null = null;

  await updateLocalDataStore((store) => ({
    ...store,
    productionJobs: store.productionJobs.map((job) => {
      if (job.id !== jobId) {
        return job;
      }

      updated = {
        ...job,
        status: input.status ?? job.status,
        stage: input.stage ?? job.stage,
        errorMessage: input.errorMessage ?? job.errorMessage,
        retryCount: input.retryCount ?? job.retryCount,
        updatedAt: new Date().toISOString()
      };

      return updated;
    })
  }));

  return updated;
}

export async function listProductionAssetsByJob(jobId: string): Promise<ProductionAsset[]> {
  const store = await readLocalDataStore();
  return store.productionAssets
    .filter((asset) => asset.jobId === jobId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listProductionAssetsByPack(packId: string): Promise<ProductionAsset[]> {
  const store = await readLocalDataStore();
  return store.productionAssets
    .filter((asset) => asset.packId === packId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getProductionDraftByPack(packId: string, workspaceId: string): Promise<ProductionDraft | null> {
  const store = await readLocalDataStore();
  return store.productionDrafts.find((item) => item.packId === packId && item.workspaceId === workspaceId) ?? null;
}

export async function saveProductionDraft(input: {
  workspaceId: string;
  packId: string;
  title: string;
  body: string;
  subtitles: string;
  coverAssetId?: string;
  videoAssetId?: string;
  voiceAssetId?: string;
  updatedBy?: string;
}): Promise<ProductionDraft> {
  const now = new Date().toISOString();
  const current = await getProductionDraftByPack(input.packId, input.workspaceId);

  const draft: ProductionDraft = {
    id: current?.id ?? randomUUID(),
    workspaceId: input.workspaceId,
    packId: input.packId,
    title: input.title,
    body: input.body,
    subtitles: input.subtitles,
    coverAssetId: input.coverAssetId,
    videoAssetId: input.videoAssetId,
    voiceAssetId: input.voiceAssetId,
    updatedBy: input.updatedBy,
    createdAt: current?.createdAt ?? now,
    updatedAt: now
  };

  await updateLocalDataStore((store) => ({
    ...store,
    productionDrafts: [draft, ...store.productionDrafts.filter((item) => item.id !== draft.id)]
  }));

  return draft;
}

function removeRegeneratedKinds(existing: ProductionAsset[], fromStage: ProductionJobStage): ProductionAsset[] {
  const affectedKinds = new Set<ProductionAssetKind>();

  if (stageGte(fromStage, "script")) {
    affectedKinds.add("script");
  }

  if (stageGte(fromStage, "image")) {
    affectedKinds.add("image");
  }

  if (stageGte(fromStage, "video")) {
    affectedKinds.add("video");
  }

  if (stageGte(fromStage, "voice")) {
    affectedKinds.add("voice");
  }

  if (stageGte(fromStage, "subtitle")) {
    affectedKinds.add("subtitle");
  }

  if (stageGte(fromStage, "finalize")) {
    affectedKinds.add("bundle");
  }

  return existing.filter((asset) => !affectedKinds.has(asset.kind));
}

async function persistJobAssets(jobId: string, fromStage: ProductionJobStage, nextAssets: ProductionAsset[]): Promise<void> {
  await updateLocalDataStore((store) => {
    const preserved = removeRegeneratedKinds(
      store.productionAssets.filter((asset) => asset.jobId === jobId),
      fromStage
    );
    const unrelated = store.productionAssets.filter((asset) => asset.jobId !== jobId);

    return {
      ...store,
      productionAssets: [...unrelated, ...preserved, ...nextAssets]
    };
  });
}

function composeScriptPrompt(input: {
  brandName: string;
  topics: string[];
  tone: string[];
  hotspotTitle: string;
  hotspotSummary: string;
  targetTitle: string;
  targetBody: string;
}): string {
  return [
    `品牌：${input.brandName}`,
    `热点：${input.hotspotTitle}`,
    `热点摘要：${input.hotspotSummary}`,
    `品牌主题：${input.topics.join("、") || "未设置"}`,
    `品牌语气：${input.tone.join("、") || "专业"}`,
    `目标标题：${input.targetTitle}`,
    `目标正文：${input.targetBody.slice(0, 700)}`,
    "输出要求：",
    "1) 给出 45-60 秒口播分镜脚本；",
    "2) 给出封面文案和两条配图提示词；",
    "3) 给出字幕稿；",
    "4) 用中文输出，结构清晰。"
  ].join("\n");
}

function composeImagePrompt(input: {
  brandName: string;
  title: string;
  summary: string;
  script: string;
}): string {
  return [
    `品牌：${input.brandName}`,
    `标题：${input.title}`,
    `摘要：${input.summary}`,
    "任务：生成可用于品牌传播的封面图与配图。",
    "要求：商业视觉、中文可读标题、画面简洁有冲击力、适配社媒分发。",
    "脚本参考：",
    input.script.slice(0, 900)
  ].join("\n");
}

function composeVideoPrompt(input: {
  brandName: string;
  title: string;
  summary: string;
  script: string;
}): string {
  return [
    `品牌：${input.brandName}`,
    `标题：${input.title}`,
    `摘要：${input.summary}`,
    "任务：生成 9:16 传播短视频方案，自动配画面、自动口播、自动字幕。",
    "要求：节奏紧凑，首屏 3 秒钩子清晰，适合抖音/视频号传播。",
    "参考脚本：",
    input.script.slice(0, 1400)
  ].join("\n");
}

export async function runProductionJob(input: {
  jobId: string;
  fromStage?: ProductionJobStage;
}): Promise<{
  job: ProductionJob;
  assets: ProductionAsset[];
  draft: ProductionDraft;
}> {
  const currentJob = await getProductionJobById(input.jobId);

  if (!currentJob) {
    throw new Error("job_not_found");
  }

  const fromStage = input.fromStage ?? "script";

  await updateProductionJob(currentJob.id, {
    status: "running",
    stage: fromStage,
    errorMessage: ""
  });

  const pack = await getHotspotPack(currentJob.packId);

  if (!pack) {
    const failed = await updateProductionJob(currentJob.id, {
      status: "failed",
      stage: fromStage,
      errorMessage: "pack_not_found"
    });

    throw new Error(failed?.errorMessage ?? "pack_not_found");
  }

  const [brand, hotspots, existingAssets] = await Promise.all([
    getBrandStrategyPack(),
    getHotspotSignals(),
    listProductionAssetsByJob(currentJob.id)
  ]);
  const hotspot = hotspots.find((item) => item.id === pack.hotspotId);

  const baseTitle = pack.variants[0]?.title ?? pack.whyNow;
  const baseBody = pack.variants[0]?.body ?? pack.whyUs;

  let scriptText = existingAssets.find((asset) => asset.kind === "script")?.textContent ?? "";
  let subtitleText = existingAssets.find((asset) => asset.kind === "subtitle")?.textContent ?? "";
  let generatedVoiceScript = existingAssets.find((asset) => asset.kind === "voice")?.textContent ?? "";
  let generatedSubtitleFromVideo = "";
  const warnings: string[] = [];
  const createdAssets: ProductionAsset[] = [];

  if (stageGte(fromStage, "script")) {
    const route = decideModelRoute("strategy-planning");
    scriptText = await runModelTask(
      "strategy-planning",
      composeScriptPrompt({
        brandName: brand.name,
        topics: brand.topics,
        tone: brand.tone,
        hotspotTitle: hotspot?.title ?? baseTitle,
        hotspotSummary: hotspot?.summary ?? pack.whyNow,
        targetTitle: baseTitle,
        targetBody: baseBody
      })
    );

    createdAssets.push(
      makeAsset({
        workspaceId: currentJob.workspaceId,
        packId: pack.id,
        jobId: currentJob.id,
        kind: "script",
        name: "传播脚本",
        provider: route.provider,
        model: route.model,
        textContent: scriptText
      })
    );

    await updateProductionJob(currentJob.id, {
      status: "running",
      stage: "image"
    });
  }

  if (stageGte(fromStage, "image")) {
    const imagePrompt = composeImagePrompt({
      brandName: brand.name,
      title: baseTitle,
      summary: hotspot?.summary ?? pack.whyNow,
      script: scriptText || baseBody
    });
    const imageResult = await generateImageAssets({
      prompt: imagePrompt,
      desiredCount: 2
    }).catch((error) => ({
      provider: "pipeline",
      model: "preview-image-v1",
      assets: [],
      warning: `生图接口调用失败，已回退本地预览：${error instanceof Error ? error.message : "unknown_error"}`
    }));

    if (imageResult.warning) {
      warnings.push(imageResult.warning);
    }

    if (imageResult.assets.length > 0) {
      createdAssets.push(
        ...imageResult.assets.map((asset) =>
          makeAsset({
            workspaceId: currentJob.workspaceId,
            packId: pack.id,
            jobId: currentJob.id,
            kind: "image",
            name: asset.name,
            provider: asset.provider,
            model: asset.model,
            previewUrl: asset.previewUrl,
            textContent: `提示词：${asset.prompt}`
          })
        )
      );
    } else {
      createdAssets.push(
        makeAsset({
          workspaceId: currentJob.workspaceId,
          packId: pack.id,
          jobId: currentJob.id,
          kind: "image",
          name: "封面图",
          provider: "pipeline",
          model: "preview-image-v1",
          previewUrl: buildSvgDataUrl({
            title: baseTitle,
            subtitle: brand.name,
            tint: "#0f172a"
          }),
          textContent: `封面提示词：${baseTitle}`
        }),
        makeAsset({
          workspaceId: currentJob.workspaceId,
          packId: pack.id,
          jobId: currentJob.id,
          kind: "image",
          name: "配图图卡",
          provider: "pipeline",
          model: "preview-image-v1",
          previewUrl: buildSvgDataUrl({
            title: (hotspot?.title ?? baseTitle).slice(0, 24),
            subtitle: "传播辅助图卡",
            tint: "#111827"
          }),
          textContent: `配图提示词：${hotspot?.summary ?? pack.whyUs}`
        })
      );
    }

    await updateProductionJob(currentJob.id, {
      status: "running",
      stage: "video"
    });
  }

  if (stageGte(fromStage, "video")) {
    const videoPrompt = composeVideoPrompt({
      brandName: brand.name,
      title: baseTitle,
      summary: hotspot?.summary ?? pack.whyNow,
      script: scriptText || baseBody
    });
    const videoResult = await generateVideoAssets({
      prompt: videoPrompt,
      script: scriptText || baseBody,
      desiredCount: 2,
      durationSeconds: 45
    }).catch((error) => ({
      provider: "pipeline",
      model: "storyboard-video-v1",
      assets: [],
      warning: `视频接口调用失败，已回退本地预览：${error instanceof Error ? error.message : "unknown_error"}`
    }));

    if (videoResult.warning) {
      warnings.push(videoResult.warning);
    }

    generatedVoiceScript = videoResult.voiceScript ?? generatedVoiceScript;
    generatedSubtitleFromVideo = videoResult.subtitles ?? generatedSubtitleFromVideo;

    if (videoResult.assets.length > 0) {
      createdAssets.push(
        ...videoResult.assets.map((asset) =>
          makeAsset({
            workspaceId: currentJob.workspaceId,
            packId: pack.id,
            jobId: currentJob.id,
            kind: "video",
            name: asset.name,
            provider: asset.provider,
            model: asset.model,
            previewUrl: asset.previewUrl,
            textContent: [asset.narrative, asset.videoUrl ? `视频地址：${asset.videoUrl}` : ""]
              .filter(Boolean)
              .join("\n")
          })
        )
      );
    } else {
      createdAssets.push(
        makeAsset({
          workspaceId: currentJob.workspaceId,
          packId: pack.id,
          jobId: currentJob.id,
          kind: "video",
          name: "竖版短视频方案",
          provider: "pipeline",
          model: "storyboard-video-v1",
          previewUrl: buildSvgDataUrl({
            title: "9:16 视频草片",
            subtitle: "含口播与字幕位",
            tint: "#1f2937"
          }),
          textContent: `镜头说明：${scriptText.slice(0, 800)}`
        }),
        makeAsset({
          workspaceId: currentJob.workspaceId,
          packId: pack.id,
          jobId: currentJob.id,
          kind: "video",
          name: "横版短视频方案",
          provider: "pipeline",
          model: "storyboard-video-v1",
          previewUrl: buildSvgDataUrl({
            title: "16:9 视频草片",
            subtitle: "用于公众号/官网预览",
            tint: "#334155"
          }),
          textContent: `镜头说明：${scriptText.slice(0, 800)}`
        })
      );
    }

    await updateProductionJob(currentJob.id, {
      status: "running",
      stage: "voice"
    });
  }

  if (stageGte(fromStage, "voice")) {
    const voiceScript = [
      `标题：${baseTitle}`,
      generatedVoiceScript || scriptText.slice(0, 1200) || baseBody
    ].join("\n\n");
    generatedVoiceScript = voiceScript;

    createdAssets.push(
      makeAsset({
        workspaceId: currentJob.workspaceId,
        packId: pack.id,
        jobId: currentJob.id,
        kind: "voice",
        name: "口播稿",
        provider: "pipeline",
        model: "voice-script-v1",
        textContent: voiceScript
      })
    );

    await updateProductionJob(currentJob.id, {
      status: "running",
      stage: "subtitle"
    });
  }

  if (stageGte(fromStage, "subtitle")) {
    subtitleText = generatedSubtitleFromVideo || subtitleText || buildSubtitleFromScript(scriptText || baseBody);

    createdAssets.push(
      makeAsset({
        workspaceId: currentJob.workspaceId,
        packId: pack.id,
        jobId: currentJob.id,
        kind: "subtitle",
        name: "字幕草稿",
        provider: "pipeline",
        model: "subtitle-align-v1",
        textContent: subtitleText
      })
    );

    await updateProductionJob(currentJob.id, {
      status: "running",
      stage: "finalize"
    });
  }

  const imageAsset = [...createdAssets, ...existingAssets].find((asset) => asset.kind === "image");
  const videoAsset = [...createdAssets, ...existingAssets].find((asset) => asset.kind === "video");
  const voiceAsset = [...createdAssets, ...existingAssets].find((asset) => asset.kind === "voice");

  const draft = await saveProductionDraft({
    workspaceId: currentJob.workspaceId,
    packId: pack.id,
    title: baseTitle,
    body: baseBody,
    subtitles: subtitleText || buildSubtitleFromScript(baseBody),
    coverAssetId: imageAsset?.id,
    videoAssetId: videoAsset?.id,
    voiceAssetId: voiceAsset?.id,
    updatedBy: currentJob.createdBy
  });

  const bundlePayload = {
    packId: pack.id,
    workspaceId: currentJob.workspaceId,
    title: draft.title,
    body: draft.body,
    subtitles: draft.subtitles,
    coverAssetId: draft.coverAssetId,
    videoAssetId: draft.videoAssetId,
    voiceAssetId: draft.voiceAssetId,
    generatedAt: new Date().toISOString()
  };

  if (stageGte(fromStage, "finalize")) {
    createdAssets.push(
      makeAsset({
        workspaceId: currentJob.workspaceId,
        packId: pack.id,
        jobId: currentJob.id,
        kind: "bundle",
        name: "发布包",
        provider: "pipeline",
        model: "bundle-v1",
        jsonContent: JSON.stringify(bundlePayload, null, 2)
      })
    );
  }

  await persistJobAssets(currentJob.id, fromStage, createdAssets);
  const warningMessage = warnings.join(" | ");

  const job = await updateProductionJob(currentJob.id, {
    status: "completed",
    stage: "finalize",
    errorMessage: warningMessage
  });

  if (!job) {
    throw new Error("job_update_failed");
  }

  const assets = await listProductionAssetsByJob(currentJob.id);

  return {
    job,
    assets,
    draft
  };
}

export async function getProductionJobDetail(input: {
  jobId: string;
}): Promise<{
  job: ProductionJob;
  assets: ProductionAsset[];
  draft: ProductionDraft | null;
}> {
  const job = await getProductionJobById(input.jobId);

  if (!job) {
    throw new Error("job_not_found");
  }

  const [assets, draft] = await Promise.all([
    listProductionAssetsByJob(job.id),
    getProductionDraftByPack(job.packId, job.workspaceId)
  ]);

  return {
    job,
    assets,
    draft
  };
}

export async function buildProductionPublishBundle(input: {
  packId: string;
  workspaceId: string;
}): Promise<{
  bundle: Record<string, unknown>;
  draft: ProductionDraft | null;
  assets: ProductionAsset[];
}> {
  const [draft, assets] = await Promise.all([
    getProductionDraftByPack(input.packId, input.workspaceId),
    listProductionAssetsByPack(input.packId)
  ]);

  const scopedAssets = assets.filter((asset) => asset.workspaceId === input.workspaceId);
  const cover = scopedAssets.find((asset) => asset.id === draft?.coverAssetId) ?? scopedAssets.find((asset) => asset.kind === "image");
  const video = scopedAssets.find((asset) => asset.id === draft?.videoAssetId) ?? scopedAssets.find((asset) => asset.kind === "video");
  const voice = scopedAssets.find((asset) => asset.id === draft?.voiceAssetId) ?? scopedAssets.find((asset) => asset.kind === "voice");

  const bundle = {
    packId: input.packId,
    workspaceId: input.workspaceId,
    title: draft?.title ?? "",
    body: draft?.body ?? "",
    subtitles: draft?.subtitles ?? "",
    media: {
      coverImage: cover?.previewUrl ?? null,
      videoPreview: video?.previewUrl ?? null,
      voiceScript: voice?.textContent ?? null
    },
    generatedAt: new Date().toISOString()
  };

  return {
    bundle,
    draft,
    assets: scopedAssets
  };
}
