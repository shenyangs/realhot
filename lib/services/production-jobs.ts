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
import { assessProductionBundleQuality } from "@/lib/services/production-quality";
import { synthesizeVoiceTrack, transcribeVoiceTrack } from "@/lib/services/audio-pipeline";
import { generateImageAssets, generateVideoAssets } from "@/lib/services/multimodal-pipeline";
import { decideModelRoute, runModelTask } from "@/lib/services/model-router";
import { getSupabaseServerClient } from "@/lib/supabase/client";

const stageOrder: ProductionJobStage[] = ["script", "image", "video", "voice", "subtitle", "finalize"];

interface ProductionJobRow {
  id: string;
  workspace_id: string;
  pack_id: string;
  status: ProductionJobStatus;
  stage: ProductionJobStage;
  created_by: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

interface ProductionAssetRow {
  id: string;
  workspace_id: string;
  pack_id: string;
  job_id: string;
  kind: ProductionAsset["kind"];
  name: string;
  status: ProductionAsset["status"];
  provider: string;
  model: string;
  preview_url: string | null;
  text_content: string | null;
  json_content: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductionDraftRow {
  id: string;
  workspace_id: string;
  pack_id: string;
  title: string;
  body: string;
  subtitles: string;
  cover_asset_id: string | null;
  video_asset_id: string | null;
  voice_asset_id: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

const stageRank = new Map(stageOrder.map((stage, index) => [stage, index]));

function mapProductionJobRow(row: ProductionJobRow): ProductionJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    packId: row.pack_id,
    status: row.status,
    stage: row.stage,
    createdBy: row.created_by ?? undefined,
    errorMessage: row.error_message ?? undefined,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapProductionAssetRow(row: ProductionAssetRow): ProductionAsset {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    packId: row.pack_id,
    jobId: row.job_id,
    kind: row.kind,
    name: row.name,
    status: row.status,
    provider: row.provider,
    model: row.model,
    previewUrl: row.preview_url ?? undefined,
    textContent: row.text_content ?? undefined,
    jsonContent: row.json_content ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapProductionDraftRow(row: ProductionDraftRow): ProductionDraft {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    packId: row.pack_id,
    title: row.title,
    body: row.body,
    subtitles: row.subtitles,
    coverAssetId: row.cover_asset_id ?? undefined,
    videoAssetId: row.video_asset_id ?? undefined,
    voiceAssetId: row.voice_asset_id ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

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
  const supabase = getSupabaseServerClient();
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

  if (supabase) {
    const { data, error } = await supabase
      .from("production_jobs")
      .insert({
        id: job.id,
        workspace_id: job.workspaceId,
        pack_id: job.packId,
        status: job.status,
        stage: job.stage,
        created_by: job.createdBy ?? null,
        error_message: job.errorMessage ?? null,
        retry_count: job.retryCount,
        created_at: job.createdAt,
        updated_at: job.updatedAt
      })
      .select("*")
      .maybeSingle<ProductionJobRow>();

    if (error || !data) {
      throw error ?? new Error("production_job_create_failed");
    }

    return mapProductionJobRow(data);
  }

  await updateLocalDataStore((store) => ({
    ...store,
    productionJobs: [job, ...store.productionJobs]
  }));

  return job;
}

export async function getProductionJobById(jobId: string): Promise<ProductionJob | null> {
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("production_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle<ProductionJobRow>();

    if (error || !data) {
      return null;
    }

    return mapProductionJobRow(data);
  }

  const store = await readLocalDataStore();
  return store.productionJobs.find((job) => job.id === jobId) ?? null;
}

export async function listProductionJobsByPack(packId: string): Promise<ProductionJob[]> {
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("production_jobs")
      .select("*")
      .eq("pack_id", packId)
      .order("created_at", { ascending: false })
      .returns<ProductionJobRow[]>();

    if (error || !data) {
      return [];
    }

    return data.map(mapProductionJobRow);
  }

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
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const payload = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.stage ? { stage: input.stage } : {}),
      ...(input.errorMessage !== undefined ? { error_message: input.errorMessage || null } : {}),
      ...(input.retryCount !== undefined ? { retry_count: input.retryCount } : {}),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from("production_jobs")
      .update(payload)
      .eq("id", jobId)
      .select("*")
      .maybeSingle<ProductionJobRow>();

    if (error || !data) {
      return null;
    }

    return mapProductionJobRow(data);
  }

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
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("production_assets")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .returns<ProductionAssetRow[]>();

    if (error || !data) {
      return [];
    }

    return data.map(mapProductionAssetRow);
  }

  const store = await readLocalDataStore();
  return store.productionAssets
    .filter((asset) => asset.jobId === jobId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listProductionAssetsByPack(packId: string): Promise<ProductionAsset[]> {
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("production_assets")
      .select("*")
      .eq("pack_id", packId)
      .order("created_at", { ascending: false })
      .returns<ProductionAssetRow[]>();

    if (error || !data) {
      return [];
    }

    return data.map(mapProductionAssetRow);
  }

  const store = await readLocalDataStore();
  return store.productionAssets
    .filter((asset) => asset.packId === packId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getProductionAssetById(assetId: string): Promise<ProductionAsset | null> {
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("production_assets")
      .select("*")
      .eq("id", assetId)
      .maybeSingle<ProductionAssetRow>();

    if (error || !data) {
      return null;
    }

    return mapProductionAssetRow(data);
  }

  const store = await readLocalDataStore();
  return store.productionAssets.find((asset) => asset.id === assetId) ?? null;
}

export async function updateProductionAsset(
  assetId: string,
  input: {
    name?: string;
    status?: ProductionAsset["status"];
    previewUrl?: string;
    textContent?: string;
    jsonContent?: string;
    errorMessage?: string;
    provider?: string;
    model?: string;
  }
): Promise<ProductionAsset | null> {
  const supabase = getSupabaseServerClient();
  const now = new Date().toISOString();
  const before = await getProductionAssetById(assetId);

  if (supabase) {
    const payload = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.previewUrl !== undefined ? { preview_url: input.previewUrl || null } : {}),
      ...(input.textContent !== undefined ? { text_content: input.textContent || null } : {}),
      ...(input.jsonContent !== undefined ? { json_content: input.jsonContent || null } : {}),
      ...(input.errorMessage !== undefined ? { error_message: input.errorMessage || null } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      updated_at: now
    };
    const { data, error } = await supabase
      .from("production_assets")
      .update(payload)
      .eq("id", assetId)
      .select("*")
      .maybeSingle<ProductionAssetRow>();

    if (error || !data) {
      return null;
    }

    const updated = mapProductionAssetRow(data);

    if (before) {
      await supabase.from("production_asset_versions").insert({
        workspace_id: updated.workspaceId,
        pack_id: updated.packId,
        job_id: updated.jobId,
        asset_id: updated.id,
        before_state: JSON.parse(JSON.stringify(before)),
        after_state: JSON.parse(JSON.stringify(updated)),
        change_reason: "asset_update"
      });
    }

    return updated;
  }

  let updated: ProductionAsset | null = null;

  await updateLocalDataStore((store) => ({
    ...store,
    productionAssets: store.productionAssets.map((asset) => {
      if (asset.id !== assetId) {
        return asset;
      }

      updated = {
        ...asset,
        name: input.name ?? asset.name,
        status: input.status ?? asset.status,
        previewUrl: input.previewUrl ?? asset.previewUrl,
        textContent: input.textContent ?? asset.textContent,
        jsonContent: input.jsonContent ?? asset.jsonContent,
        errorMessage: input.errorMessage ?? asset.errorMessage,
        provider: input.provider ?? asset.provider,
        model: input.model ?? asset.model,
        updatedAt: now
      };

      return updated;
    })
  }));

  if (before && updated) {
    const updatedSnapshot = updated as ProductionAsset;
    await updateLocalDataStore((store) => ({
      ...store,
      productionAssetVersions: [
        {
          id: randomUUID(),
          workspaceId: updatedSnapshot.workspaceId,
          packId: updatedSnapshot.packId,
          jobId: updatedSnapshot.jobId,
          assetId: updatedSnapshot.id,
          beforeState: JSON.stringify(before),
          afterState: JSON.stringify(updatedSnapshot),
          changeReason: "asset_update",
          createdAt: now
        },
        ...store.productionAssetVersions
      ]
    }));
  }

  return updated;
}

export async function getProductionDraftByPack(packId: string, workspaceId: string): Promise<ProductionDraft | null> {
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("production_drafts")
      .select("*")
      .eq("pack_id", packId)
      .eq("workspace_id", workspaceId)
      .maybeSingle<ProductionDraftRow>();

    if (error || !data) {
      return null;
    }

    return mapProductionDraftRow(data);
  }

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
  const supabase = getSupabaseServerClient();
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

  if (supabase) {
    const { data, error } = await supabase
      .from("production_drafts")
      .upsert(
        {
          id: draft.id,
          workspace_id: draft.workspaceId,
          pack_id: draft.packId,
          title: draft.title,
          body: draft.body,
          subtitles: draft.subtitles,
          cover_asset_id: draft.coverAssetId ?? null,
          video_asset_id: draft.videoAssetId ?? null,
          voice_asset_id: draft.voiceAssetId ?? null,
          updated_by: draft.updatedBy ?? null,
          created_at: draft.createdAt,
          updated_at: draft.updatedAt
        },
        {
          onConflict: "workspace_id,pack_id"
        }
      )
      .select("*")
      .maybeSingle<ProductionDraftRow>();

    if (error || !data) {
      throw error ?? new Error("production_draft_upsert_failed");
    }

    return mapProductionDraftRow(data);
  }

  await updateLocalDataStore((store) => ({
    ...store,
    productionDrafts: [draft, ...store.productionDrafts.filter((item) => item.id !== draft.id)]
  }));

  return draft;
}

function mapAssetKindToStage(kind: ProductionAssetKind): ProductionJobStage {
  if (kind === "bundle") {
    return "finalize";
  }

  if (kind === "subtitle") {
    return "subtitle";
  }

  if (kind === "voice") {
    return "voice";
  }

  if (kind === "video") {
    return "video";
  }

  if (kind === "image") {
    return "image";
  }

  return "script";
}

export async function appendProductionJobEvent(input: {
  workspaceId: string;
  packId: string;
  jobId: string;
  stage?: ProductionJobStage;
  level: "info" | "warning" | "error";
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    const now = new Date().toISOString();

    if (supabase) {
      await supabase.from("production_job_events").insert({
        workspace_id: input.workspaceId,
        pack_id: input.packId,
        job_id: input.jobId,
        stage: input.stage ?? null,
        level: input.level,
        message: input.message,
        payload: input.payload ?? {},
        created_at: now
      });
      return;
    }

    await updateLocalDataStore((store) => ({
      ...store,
      productionJobEvents: [
        {
          id: randomUUID(),
          workspaceId: input.workspaceId,
          packId: input.packId,
          jobId: input.jobId,
          stage: input.stage,
          level: input.level,
          message: input.message,
          payload: input.payload ? JSON.stringify(input.payload) : undefined,
          createdAt: now
        },
        ...store.productionJobEvents
      ]
    }));
  } catch {
    // Ignore event log failures; should never block primary content production.
  }
}

export async function listQueuedProductionJobs(input?: {
  workspaceId?: string;
  jobId?: string;
  limit?: number;
}): Promise<ProductionJob[]> {
  const supabase = getSupabaseServerClient();
  const limit = input?.limit && input.limit > 0 ? input.limit : 20;

  if (supabase) {
    let query = supabase
      .from("production_jobs")
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (input?.workspaceId) {
      query = query.eq("workspace_id", input.workspaceId);
    }

    if (input?.jobId) {
      query = query.eq("id", input.jobId);
    }

    const { data, error } = await query.returns<ProductionJobRow[]>();

    if (error || !data) {
      return [];
    }

    return data.map(mapProductionJobRow);
  }

  const store = await readLocalDataStore();
  return store.productionJobs
    .filter((job) => job.status === "queued")
    .filter((job) => (input?.workspaceId ? job.workspaceId === input.workspaceId : true))
    .filter((job) => (input?.jobId ? job.id === input.jobId : true))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(0, limit);
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
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data: existing, error: existingError } = await supabase
      .from("production_assets")
      .select("*")
      .eq("job_id", jobId)
      .returns<ProductionAssetRow[]>();

    if (existingError) {
      throw existingError;
    }

    const preserved = removeRegeneratedKinds((existing ?? []).map(mapProductionAssetRow), fromStage);
    const affectedKinds = new Set(
      (existing ?? [])
        .filter((row) => !preserved.some((item) => item.id === row.id))
        .map((row) => row.kind)
    );

    if (affectedKinds.size > 0) {
      const { error: deleteError } = await supabase
        .from("production_assets")
        .delete()
        .eq("job_id", jobId)
        .in("kind", Array.from(affectedKinds));

      if (deleteError) {
        throw deleteError;
      }
    }

    if (nextAssets.length > 0) {
      const { error: insertError } = await supabase.from("production_assets").insert(
        nextAssets.map((asset) => ({
          id: asset.id,
          workspace_id: asset.workspaceId,
          pack_id: asset.packId,
          job_id: asset.jobId,
          kind: asset.kind,
          name: asset.name,
          status: asset.status,
          provider: asset.provider,
          model: asset.model,
          preview_url: asset.previewUrl ?? null,
          text_content: asset.textContent ?? null,
          json_content: asset.jsonContent ?? null,
          error_message: asset.errorMessage ?? null,
          created_at: asset.createdAt,
          updated_at: asset.updatedAt
        }))
      );

      if (insertError) {
        throw insertError;
      }
    }

    return;
  }

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

export async function regenerateProductionAsset(input: {
  assetId: string;
  requestedBy?: string;
}): Promise<{
  asset: ProductionAsset;
  job: ProductionJob;
  draft: ProductionDraft | null;
}> {
  const currentAsset = await getProductionAssetById(input.assetId);

  if (!currentAsset) {
    throw new Error("asset_not_found");
  }

  const job = await getProductionJobById(currentAsset.jobId);

  if (!job) {
    throw new Error("job_not_found");
  }

  const pack = await getHotspotPack(job.packId);

  if (!pack) {
    throw new Error("pack_not_found");
  }

  const [brand, hotspots, assetsForJob] = await Promise.all([
    getBrandStrategyPack(),
    getHotspotSignals(),
    listProductionAssetsByJob(job.id)
  ]);
  const hotspot = hotspots.find((item) => item.id === pack.hotspotId);
  const baseTitle = pack.variants[0]?.title ?? pack.whyNow;
  const baseBody = pack.variants[0]?.body ?? pack.whyUs;

  let scriptText = assetsForJob.find((asset) => asset.kind === "script")?.textContent ?? "";

  if (!scriptText) {
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
  }

  let nextName = currentAsset.name;
  let nextStatus: ProductionAsset["status"] = "ready";
  let nextProvider = currentAsset.provider;
  let nextModel = currentAsset.model;
  let nextPreviewUrl = currentAsset.previewUrl;
  let nextText = currentAsset.textContent;
  let nextJson = currentAsset.jsonContent;
  let nextError = "";
  let producedVoiceScript: string | undefined;
  let producedSubtitles: string | undefined;

  if (currentAsset.kind === "script") {
    const route = decideModelRoute("strategy-planning");
    nextProvider = route.provider;
    nextModel = route.model;
    nextText = await runModelTask(
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
  } else if (currentAsset.kind === "image") {
    const imagePrompt = composeImagePrompt({
      brandName: brand.name,
      title: baseTitle,
      summary: hotspot?.summary ?? pack.whyNow,
      script: scriptText || baseBody
    });
    const imageResult = await generateImageAssets({
      prompt: imagePrompt,
      desiredCount: 1
    }).catch((error) => ({
      provider: "pipeline",
      model: "preview-image-v1",
      assets: [],
      warning: `生图接口调用失败：${error instanceof Error ? error.message : "unknown_error"}`
    }));

    nextProvider = imageResult.provider;
    nextModel = imageResult.model;
    nextName = imageResult.assets[0]?.name ?? currentAsset.name;
    nextPreviewUrl =
      imageResult.assets[0]?.previewUrl ??
      buildSvgDataUrl({
        title: baseTitle,
        subtitle: brand.name,
        tint: "#0f172a"
      });
    nextText = imageResult.assets[0]?.prompt ? `提示词：${imageResult.assets[0].prompt}` : currentAsset.textContent;
    nextError = imageResult.warning ?? "";
  } else if (currentAsset.kind === "video") {
    const videoPrompt = composeVideoPrompt({
      brandName: brand.name,
      title: baseTitle,
      summary: hotspot?.summary ?? pack.whyNow,
      script: scriptText || baseBody
    });
    const videoResult = await generateVideoAssets({
      prompt: videoPrompt,
      script: scriptText || baseBody,
      desiredCount: 1,
      durationSeconds: 45
    }).catch((error) => ({
      provider: "pipeline",
      model: "storyboard-video-v1",
      assets: [],
      voiceScript: undefined,
      subtitles: undefined,
      warning: `视频接口调用失败：${error instanceof Error ? error.message : "unknown_error"}`
    }));

    nextProvider = videoResult.provider;
    nextModel = videoResult.model;
    nextName = videoResult.assets[0]?.name ?? currentAsset.name;
    nextPreviewUrl =
      videoResult.assets[0]?.previewUrl ??
      buildSvgDataUrl({
        title: "9:16 视频草片",
        subtitle: "重生后预览",
        tint: "#1f2937"
      });
    nextText = [videoResult.assets[0]?.narrative, videoResult.assets[0]?.videoUrl ? `视频地址：${videoResult.assets[0].videoUrl}` : ""]
      .filter(Boolean)
      .join("\n");
    producedVoiceScript = videoResult.voiceScript;
    producedSubtitles = videoResult.subtitles;
    nextError = videoResult.warning ?? "";
  } else if (currentAsset.kind === "voice") {
    nextProvider = "pipeline";
    nextModel = "voice-script-v1";
    nextText = [`标题：${baseTitle}`, scriptText.slice(0, 1200) || baseBody].join("\n\n");
  } else if (currentAsset.kind === "subtitle") {
    nextProvider = "pipeline";
    nextModel = "subtitle-align-v1";
    nextText = buildSubtitleFromScript(scriptText || baseBody);
  } else if (currentAsset.kind === "bundle") {
    nextProvider = "pipeline";
    nextModel = "bundle-v1";
    const bundle = await buildProductionPublishBundle({
      packId: pack.id,
      workspaceId: job.workspaceId
    });
    nextJson = JSON.stringify(bundle.bundle, null, 2);
  }

  const updatedAsset = await updateProductionAsset(currentAsset.id, {
    name: nextName,
    status: nextStatus,
    previewUrl: nextPreviewUrl,
    textContent: nextText,
    jsonContent: nextJson,
    errorMessage: nextError,
    provider: nextProvider,
    model: nextModel
  });

  if (!updatedAsset) {
    throw new Error("asset_update_failed");
  }

  if (currentAsset.kind === "video" && producedVoiceScript) {
    const voiceAsset = assetsForJob.find((asset) => asset.kind === "voice");

    if (voiceAsset) {
      await updateProductionAsset(voiceAsset.id, {
        textContent: [`标题：${baseTitle}`, producedVoiceScript].join("\n\n"),
        provider: updatedAsset.provider,
        model: updatedAsset.model,
        errorMessage: ""
      });
    }
  }

  if ((currentAsset.kind === "video" && producedSubtitles) || currentAsset.kind === "subtitle") {
    const subtitleAsset = assetsForJob.find((asset) => asset.kind === "subtitle");
    const subtitleText = currentAsset.kind === "subtitle" ? nextText ?? "" : producedSubtitles ?? "";

    if (subtitleAsset && subtitleText) {
      await updateProductionAsset(subtitleAsset.id, {
        textContent: subtitleText,
        provider: "pipeline",
        model: "subtitle-align-v1",
        errorMessage: ""
      });
    }
  }

  const currentDraft = await getProductionDraftByPack(pack.id, job.workspaceId);
  let draft: ProductionDraft | null = currentDraft;

  if (currentDraft) {
    draft = await saveProductionDraft({
      workspaceId: currentDraft.workspaceId,
      packId: currentDraft.packId,
      title: currentDraft.title,
      body: currentDraft.body,
      subtitles:
        currentAsset.kind === "subtitle"
          ? nextText ?? currentDraft.subtitles
          : currentAsset.kind === "video" && producedSubtitles
            ? producedSubtitles
            : currentDraft.subtitles,
      coverAssetId: currentDraft.coverAssetId ?? (currentAsset.kind === "image" ? currentAsset.id : undefined),
      videoAssetId: currentDraft.videoAssetId ?? (currentAsset.kind === "video" ? currentAsset.id : undefined),
      voiceAssetId: currentDraft.voiceAssetId ?? (currentAsset.kind === "voice" ? currentAsset.id : undefined),
      updatedBy: input.requestedBy ?? job.createdBy
    });
  }

  const refreshedJob = await updateProductionJob(job.id, {
    status: "needs-review",
    stage: mapAssetKindToStage(currentAsset.kind),
    errorMessage: nextError
  });

  if (!refreshedJob) {
    throw new Error("job_update_failed");
  }

  const refreshedAsset = await getProductionAssetById(currentAsset.id);

  if (!refreshedAsset) {
    throw new Error("asset_refresh_failed");
  }

  return {
    asset: refreshedAsset,
    job: refreshedJob,
    draft
  };
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
  await appendProductionJobEvent({
    workspaceId: currentJob.workspaceId,
    packId: currentJob.packId,
    jobId: currentJob.id,
    stage: fromStage,
    level: "info",
    message: "production_job_started"
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
    await appendProductionJobEvent({
      workspaceId: currentJob.workspaceId,
      packId: pack.id,
      jobId: currentJob.id,
      stage: "script",
      level: "info",
      message: "script_generated"
    });

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
      await appendProductionJobEvent({
        workspaceId: currentJob.workspaceId,
        packId: pack.id,
        jobId: currentJob.id,
        stage: "image",
        level: "warning",
        message: imageResult.warning
      });
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
      voiceScript: undefined,
      subtitles: undefined,
      warning: `视频接口调用失败，已回退本地预览：${error instanceof Error ? error.message : "unknown_error"}`
    }));

    if (videoResult.warning) {
      warnings.push(videoResult.warning);
      await appendProductionJobEvent({
        workspaceId: currentJob.workspaceId,
        packId: pack.id,
        jobId: currentJob.id,
        stage: "video",
        level: "warning",
        message: videoResult.warning
      });
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
    const voiceScriptText = [
      `标题：${baseTitle}`,
      generatedVoiceScript || scriptText.slice(0, 1200) || baseBody
    ].join("\n\n");
    const voiceSynthesis = await synthesizeVoiceTrack({
      script: voiceScriptText
    }).catch((error) => ({
      provider: "pipeline",
      model: "voice-script-v1",
      script: voiceScriptText,
      audioUrl: undefined,
      warning: error instanceof Error ? error.message : "voice_synthesis_failed"
    }));
    generatedVoiceScript = voiceSynthesis.script;

    if (voiceSynthesis.warning) {
      warnings.push(voiceSynthesis.warning);
      await appendProductionJobEvent({
        workspaceId: currentJob.workspaceId,
        packId: pack.id,
        jobId: currentJob.id,
        stage: "voice",
        level: "warning",
        message: voiceSynthesis.warning
      });
    }

    createdAssets.push(
      makeAsset({
        workspaceId: currentJob.workspaceId,
        packId: pack.id,
        jobId: currentJob.id,
        kind: "voice",
        name: "口播稿",
        provider: voiceSynthesis.provider,
        model: voiceSynthesis.model,
        previewUrl: voiceSynthesis.audioUrl,
        textContent: voiceSynthesis.script
      })
    );

    await updateProductionJob(currentJob.id, {
      status: "running",
      stage: "subtitle"
    });
  }

  if (stageGte(fromStage, "subtitle")) {
    const voiceAssetForSubtitle = [...createdAssets, ...existingAssets].find((asset) => asset.kind === "voice");
    const transcription = await transcribeVoiceTrack({
      audioUrl: voiceAssetForSubtitle?.previewUrl,
      fallbackText: generatedVoiceScript || scriptText || baseBody
    }).catch((error) => ({
      provider: "pipeline",
      model: "subtitle-align-v1",
      transcript: generatedVoiceScript || scriptText || baseBody,
      subtitles: undefined,
      warning: error instanceof Error ? error.message : "subtitle_transcribe_failed"
    }));

    subtitleText =
      generatedSubtitleFromVideo ||
      transcription.subtitles ||
      subtitleText ||
      buildSubtitleFromScript(transcription.transcript || scriptText || baseBody);

    if (transcription.warning) {
      warnings.push(transcription.warning);
      await appendProductionJobEvent({
        workspaceId: currentJob.workspaceId,
        packId: pack.id,
        jobId: currentJob.id,
        stage: "subtitle",
        level: "warning",
        message: transcription.warning
      });
    }

    createdAssets.push(
      makeAsset({
        workspaceId: currentJob.workspaceId,
        packId: pack.id,
        jobId: currentJob.id,
        kind: "subtitle",
        name: "字幕草稿",
        provider: transcription.provider,
        model: transcription.model,
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
  await appendProductionJobEvent({
    workspaceId: currentJob.workspaceId,
    packId: pack.id,
    jobId: currentJob.id,
    stage: "finalize",
    level: "info",
    message: "production_job_completed",
    payload: {
      assetCount: assets.length
    }
  });

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
  qualityReport: ReturnType<typeof assessProductionBundleQuality>;
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
  const qualityReport = assessProductionBundleQuality({
    title: draft?.title ?? "",
    body: draft?.body ?? "",
    subtitles: draft?.subtitles ?? "",
    hasCover: Boolean(cover?.previewUrl),
    hasVideo: Boolean(video?.previewUrl),
    hasVoiceScript: Boolean(voice?.textContent || voice?.previewUrl)
  });

  return {
    bundle,
    draft,
    assets: scopedAssets,
    qualityReport
  };
}
