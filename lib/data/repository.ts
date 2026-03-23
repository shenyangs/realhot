import { createHash } from "node:crypto";
import {
  brandStrategyPack as mockBrandStrategyPack,
  dashboardMetrics as mockDashboardMetrics,
  hotspotPacks as mockHotspotPacks,
  hotspotSignals as mockHotspotSignals
} from "@/lib/data/mock";
import { readLocalDataStore, updateLocalDataStore } from "@/lib/data/local-store";
import {
  BrandSource,
  BrandStrategyPack,
  ContentTrack,
  ContentVariant,
  DashboardMetric,
  HotspotPack,
  HotspotSignal,
  HotspotSyncSnapshot,
  Platform,
  PublishJob
} from "@/lib/domain/types";
import { prioritizeHotspots } from "@/lib/services/hotspot-engine";
import { enforceBodyMinimumWithContext, resolveMinimumCharsForVariant } from "@/lib/services/content-quality";
import { getSupabaseServerClient } from "@/lib/supabase/client";

interface BrandRow {
  id: string;
  name: string;
  slogan: string;
  sector: string;
  audiences: string[];
  positioning: string[];
  topics: string[];
  tone: string[];
  red_lines: string[];
  competitors: string[];
  recent_moves: string[];
}

interface BrandSourceRow {
  label: string;
  type: BrandSource["type"];
  freshness: BrandSource["freshness"];
  value: string;
}

interface HotspotRow {
  id: string;
  title: string | null;
  summary: string | null;
  kind: HotspotSignal["kind"];
  source: string | null;
  source_url?: string | null;
  detected_at: string | null;
  relevance_score: number | null;
  industry_score: number | null;
  velocity_score: number | null;
  risk_score: number | null;
  recommended_action: string | null;
  reasons: string[] | null;
}

interface ContentVariantRow {
  id: string;
  track: "rapid-response" | "point-of-view";
  title: string;
  angle: string;
  format: "post" | "article" | "video-script";
  body: string;
  cover_hook: string;
  publish_window: string;
  platforms: Array<"xiaohongshu" | "wechat" | "video-channel" | "douyin">;
}

interface HotspotPackRow {
  id: string;
  brand_id: string;
  hotspot_id: string;
  status: "pending" | "approved" | "needs-edit";
  why_now: string;
  why_us: string;
  review_owner: string;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  content_variants: ContentVariantRow[] | null;
}

interface PublishJobRow {
  id: string;
  pack_id: string;
  variant_id: string;
  platform: Platform;
  status: PublishJob["status"];
  queue_source: PublishJob["queueSource"];
  scheduled_at: string | null;
  published_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  content_variants?: {
    title: string;
    body: string;
    format: ContentVariant["format"];
  } | null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function normalizePlatforms(value: unknown): Platform[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (platform): platform is Platform =>
      platform === "xiaohongshu" || platform === "wechat" || platform === "video-channel" || platform === "douyin"
  );
}

export interface QueuePublishJobsResult {
  jobs: PublishJob[];
  persisted: boolean;
  usedMockStorage: boolean;
}

export interface ClearPublishJobsResult {
  removedCount: number;
  usedMockStorage: boolean;
}

export interface QueuedPublishJob extends PublishJob {
  variantTitle: string;
  variantBody: string;
  variantFormat: ContentVariant["format"];
}

function mapBrand(row: BrandRow, sources: BrandSourceRow[]): BrandStrategyPack {
  return {
    id: row.id,
    name: row.name?.trim() || mockBrandStrategyPack.name,
    slogan: row.slogan?.trim() || mockBrandStrategyPack.slogan,
    sector: row.sector?.trim() || mockBrandStrategyPack.sector,
    audiences: normalizeStringArray(row.audiences),
    positioning: normalizeStringArray(row.positioning),
    topics: normalizeStringArray(row.topics),
    tone: normalizeStringArray(row.tone),
    redLines: normalizeStringArray(row.red_lines),
    competitors: normalizeStringArray(row.competitors),
    recentMoves: normalizeStringArray(row.recent_moves),
    sources
  };
}

function mapHotspot(row: HotspotRow): HotspotSignal {
  const recommendedAction =
    row.recommended_action === "ship-now" || row.recommended_action === "watch" || row.recommended_action === "discard"
      ? row.recommended_action
      : "watch";

  const reasons = Array.isArray(row.reasons)
    ? row.reasons.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];

  return {
    id: row.id,
    title: (row.title ?? "").trim() || "未命名热点",
    summary: (row.summary ?? "").trim() || "暂无摘要",
    kind: row.kind,
    source: (row.source ?? "").trim() || "未标注信源",
    sourceUrl: row.source_url ?? undefined,
    detectedAt: row.detected_at ?? new Date(0).toISOString(),
    relevanceScore: row.relevance_score ?? 0,
    industryScore: row.industry_score ?? 0,
    velocityScore: row.velocity_score ?? 0,
    riskScore: row.risk_score ?? 0,
    recommendedAction,
    reasons
  };
}

function mapPack(row: HotspotPackRow): HotspotPack {
  return {
    id: row.id,
    brandId: row.brand_id,
    hotspotId: row.hotspot_id,
    status: row.status,
    whyNow: row.why_now?.trim() || "暂无判断",
    whyUs: row.why_us?.trim() || "暂无品牌关联说明",
    reviewOwner: row.review_owner?.trim() || "待分配",
    reviewNote: row.review_note ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    variants: (row.content_variants ?? []).map((variant) => ({
      id: variant.id,
      track: variant.track,
      title: variant.title?.trim() || "未命名内容",
      angle: variant.angle?.trim() || "暂无角度说明",
      platforms: normalizePlatforms(variant.platforms),
      format: variant.format,
      body: variant.body ?? "",
      coverHook: variant.cover_hook ?? "",
      publishWindow: variant.publish_window?.trim() || "未设置"
    }))
  };
}

function mapPublishJob(row: PublishJobRow): PublishJob {
  return {
    id: row.id,
    packId: row.pack_id,
    variantId: row.variant_id,
    platform: row.platform,
    status: row.status,
    queueSource: row.queue_source,
    scheduledAt: row.scheduled_at ?? undefined,
    publishedAt: row.published_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapQueuedPublishJob(row: PublishJobRow): QueuedPublishJob {
  return {
    ...mapPublishJob(row),
    variantTitle: row.content_variants?.title ?? "",
    variantBody: row.content_variants?.body ?? "",
    variantFormat: row.content_variants?.format ?? "post"
  };
}

function deterministicId(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const platformLabels: Record<Platform, string> = {
  xiaohongshu: "小红书",
  wechat: "公众号",
  "video-channel": "视频号",
  douyin: "抖音"
};

function trackLabel(track: ContentTrack): string {
  return track === "point-of-view" ? "观点" : "快反";
}

function normalizePackBodies(pack: HotspotPack): HotspotPack {
  let changed = false;

  const variants = pack.variants.map((variant) => {
    const minimumChars = resolveMinimumCharsForVariant({
      format: variant.format,
      track: variant.track,
      platforms: variant.platforms
    });

    const normalized = enforceBodyMinimumWithContext({
      body: variant.body,
      title: variant.title,
      angle: variant.angle,
      whyNow: pack.whyNow,
      whyUs: pack.whyUs,
      minimumChars,
      formatHint: variant.format,
      trackHint: variant.track,
      platformHint: `${variant.platforms.map((platform) => platformLabels[platform]).join(" / ")} · ${trackLabel(variant.track)}`
    });

    if (!normalized.wasExpanded) {
      return variant;
    }

    changed = true;

    return {
      ...variant,
      body: normalized.body
    };
  });

  if (!changed) {
    return pack;
  }

  return {
    ...pack,
    variants
  };
}

function normalizeQueueBodies(packs: HotspotPack[]): HotspotPack[] {
  return packs.map(normalizePackBodies);
}

async function updateHotspotPackReviewInLocalStore(
  packId: string,
  input: {
    status: HotspotPack["status"];
    note?: string;
    reviewer?: string;
  }
): Promise<HotspotPack | null> {
  const note = input.note?.trim() ? input.note.trim() : undefined;
  const reviewer = input.reviewer?.trim() ? input.reviewer.trim() : undefined;
  const reviewedAt = new Date().toISOString();
  let updatedPack: HotspotPack | null = null;

  await updateLocalDataStore((store) => {
    const packs = store.packs.map((pack) => {
      if (pack.id !== packId) {
        return pack;
      }

      updatedPack = {
        ...pack,
        status: input.status,
        reviewNote: note,
        reviewedBy: reviewer,
        reviewedAt
      };

      return updatedPack;
    });

    return {
      ...store,
      packs
    };
  });

  return updatedPack;
}

export async function getBrandStrategyPack(): Promise<BrandStrategyPack> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    const store = await readLocalDataStore();
    return store.brand;
  }

  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<BrandRow>();

  if (brandError || !brand) {
    return mockBrandStrategyPack;
  }

  const { data: sources, error: sourceError } = await supabase
    .from("brand_sources")
    .select("label, type, freshness, value")
    .eq("brand_id", brand.id)
    .order("created_at", { ascending: true })
    .returns<BrandSourceRow[]>();

  if (sourceError) {
    return mockBrandStrategyPack;
  }

  return mapBrand(brand, sources ?? []);
}

export async function updateBrandStrategyPack(
  input: BrandStrategyPack,
  options: {
    workspaceId?: string | null;
  } = {}
): Promise<BrandStrategyPack> {
  const normalized: BrandStrategyPack = {
    ...input,
    name: input.name.trim(),
    slogan: input.slogan.trim(),
    sector: input.sector.trim(),
    audiences: input.audiences.map((item) => item.trim()).filter(Boolean),
    positioning: input.positioning.map((item) => item.trim()).filter(Boolean),
    topics: input.topics.map((item) => item.trim()).filter(Boolean),
    tone: input.tone.map((item) => item.trim()).filter(Boolean),
    redLines: input.redLines.map((item) => item.trim()).filter(Boolean),
    competitors: input.competitors.map((item) => item.trim()).filter(Boolean),
    recentMoves: input.recentMoves.map((item) => item.trim()).filter(Boolean),
    sources: input.sources
      .map((source) => ({
        label: source.label.trim(),
        type: source.type,
        freshness: source.freshness,
        value: source.value.trim()
      }))
      .filter((source) => source.label && source.value)
  };

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    const store = await updateLocalDataStore((current) => ({
      ...current,
      brand: normalized
    }));

    return store.brand;
  }

  const now = new Date().toISOString();
  const workspaceId = options.workspaceId?.trim() || undefined;
  const existingBrandQuery = supabase
    .from("brands")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  const { data: existingBrand, error: existingBrandError } = await (workspaceId
    ? existingBrandQuery.eq("workspace_id", workspaceId)
    : existingBrandQuery
  ).maybeSingle<{ id: string }>();

  if (existingBrandError) {
    throw existingBrandError;
  }

  let brandId: string;

  if (!existingBrand) {
    let targetWorkspaceId = workspaceId;

    if (!targetWorkspaceId) {
      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (workspaceError || !workspace) {
        throw workspaceError ?? new Error("未找到可写入的工作区");
      }

      targetWorkspaceId = workspace.id;
    }

    const { data: insertedBrand, error: insertBrandError } = await supabase
      .from("brands")
      .insert({
        workspace_id: targetWorkspaceId,
        name: normalized.name,
        slogan: normalized.slogan,
        sector: normalized.sector,
        audiences: normalized.audiences,
        positioning: normalized.positioning,
        topics: normalized.topics,
        tone: normalized.tone,
        red_lines: normalized.redLines,
        competitors: normalized.competitors,
        recent_moves: normalized.recentMoves,
        updated_at: now
      })
      .select("id")
      .single<{ id: string }>();

    if (insertBrandError || !insertedBrand) {
      throw insertBrandError ?? new Error("创建品牌记录失败");
    }

    brandId = insertedBrand.id;
  } else {
    brandId = existingBrand.id;

    const { error: updateError } = await supabase
      .from("brands")
      .update({
        name: normalized.name,
        slogan: normalized.slogan,
        sector: normalized.sector,
        audiences: normalized.audiences,
        positioning: normalized.positioning,
        topics: normalized.topics,
        tone: normalized.tone,
        red_lines: normalized.redLines,
        competitors: normalized.competitors,
        recent_moves: normalized.recentMoves,
        updated_at: now
      })
      .eq("id", brandId);

    if (updateError) {
      throw updateError;
    }

    const { error: deleteError } = await supabase
      .from("brand_sources")
      .delete()
      .eq("brand_id", brandId);

    if (deleteError) {
      throw deleteError;
    }
  }

  if (normalized.sources.length > 0) {
    const { error: insertError } = await supabase
      .from("brand_sources")
      .insert(
        normalized.sources.map((source) => ({
          brand_id: brandId,
          label: source.label,
          type: source.type,
          freshness: source.freshness,
          value: source.value,
          fetched_at: now
        }))
      );

    if (insertError) {
      throw insertError;
    }
  }

  return {
    ...(await getBrandStrategyPack()),
    id: brandId
  };
}

export async function getHotspotSignals(): Promise<HotspotSignal[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    const store = await readLocalDataStore();
    return store.hotspots;
  }

  const { data, error } = await supabase
    .from("hotspots")
    .select("*")
    .order("detected_at", { ascending: false })
    .returns<HotspotRow[]>();

  if (error || !data || data.length === 0) {
    const store = await readLocalDataStore();
    return store.hotspots;
  }

  return data.map(mapHotspot);
}

export async function getReviewQueue(): Promise<HotspotPack[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    const store = await readLocalDataStore();
    return normalizeQueueBodies(store.packs);
  }

  const { data, error } = await supabase
    .from("hotspot_packs")
    .select(
      "id, brand_id, hotspot_id, status, why_now, why_us, review_owner, review_note, reviewed_by, reviewed_at, content_variants (id, track, title, angle, format, body, cover_hook, publish_window, platforms)"
    )
    .order("created_at", { ascending: false })
    .returns<HotspotPackRow[]>();

  if (error || !data || data.length === 0) {
    const store = await readLocalDataStore();
    return normalizeQueueBodies(store.packs);
  }

  return normalizeQueueBodies(data.map(mapPack));
}

export async function getHotspotPack(id: string): Promise<HotspotPack | undefined> {
  const packs = await getReviewQueue();
  return packs.find((pack) => pack.id === id);
}

export async function getDashboardMetrics(): Promise<DashboardMetric[]> {
  const [signals, packs] = await Promise.all([getHotspotSignals(), getReviewQueue()]);

  if (signals === mockHotspotSignals && packs === mockHotspotPacks) {
    return mockDashboardMetrics;
  }

  const pendingPacks = packs.filter((pack) => pack.status === "pending");
  const opinionVariants = packs.flatMap((pack) => pack.variants).filter((variant) => variant.track === "point-of-view");
  const shipNowSignals = signals.filter((signal) => signal.recommendedAction === "ship-now");

  return [
    {
      label: "今日命中热点",
      value: String(signals.length),
      delta: `${shipNowSignals.length} 个建议立即跟进`,
      tone: "positive"
    },
    {
      label: "待审核热点包",
      value: String(pendingPacks.length),
      delta: `${pendingPacks.filter((pack) => pack.variants.length >= 4).length} 个完整内容包`,
      tone: pendingPacks.length > 0 ? "warning" : "neutral"
    },
    {
      label: "本周已产出内容",
      value: String(packs.reduce((count, pack) => count + pack.variants.length, 0)),
      delta: `${opinionVariants.length} 条观点向`,
      tone: "positive"
    },
    {
      label: "模型平均生成时长",
      value: "待接真实任务日志",
      delta: "当前使用配置驱动的预估值",
      tone: "neutral"
    }
  ];
}

export async function getPrioritizedHotspots() {
  const [brand, signals] = await Promise.all([getBrandStrategyPack(), getHotspotSignals()]);
  return prioritizeHotspots(brand, signals);
}

export async function getLatestHotspotSyncSnapshot(): Promise<HotspotSyncSnapshot | null> {
  const supabase = getSupabaseServerClient();

  // In deployed environments with Supabase enabled (for example Vercel),
  // local runtime files may be unavailable or read-only.
  if (supabase) {
    return null;
  }

  try {
    const store = await readLocalDataStore();
    return store.lastHotspotSync ?? null;
  } catch {
    return null;
  }
}

export async function updateHotspotPackReview(
  packId: string,
  input: {
    status: HotspotPack["status"];
    note?: string;
    reviewer?: string;
  }
): Promise<HotspotPack | null> {
  const supabase = getSupabaseServerClient();

  if (!supabase || !isUuid(packId)) {
    return updateHotspotPackReviewInLocalStore(packId, input);
  }

  const payload = {
    status: input.status,
    review_note: input.note?.trim() ? input.note.trim() : null,
    reviewed_by: input.reviewer?.trim() ? input.reviewer.trim() : null,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("hotspot_packs")
    .update(payload)
    .eq("id", packId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return (await getHotspotPack(packId)) ?? null;
}

export async function deleteHotspotPack(packId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();

  if (!supabase || !isUuid(packId)) {
    let removed = false;

    await updateLocalDataStore((store) => ({
      ...store,
      packs: store.packs.filter((pack) => {
        const shouldKeep = pack.id !== packId;

        if (!shouldKeep) {
          removed = true;
        }

        return shouldKeep;
      }),
      publishJobs: store.publishJobs.filter((job) => job.packId !== packId)
    }));

    return removed;
  }

  const { data, error } = await supabase
    .from("hotspot_packs")
    .delete()
    .eq("id", packId)
    .select("id")
    .returns<Array<{ id: string }>>();

  if (error) {
    throw error;
  }

  return (data?.length ?? 0) > 0;
}

export async function getPublishJobsForPack(packId: string): Promise<PublishJob[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase || !isUuid(packId)) {
    const store = await readLocalDataStore();
    return store.publishJobs
      .filter((job) => job.packId === packId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const { data, error } = await supabase
    .from("publish_jobs")
    .select("*")
    .eq("pack_id", packId)
    .order("created_at", { ascending: false })
    .returns<PublishJobRow[]>();

  if (error || !data) {
    return [];
  }

  return data.map(mapPublishJob);
}

export async function queuePublishJobs(
  packId: string,
  input?: {
    scheduledAt?: string;
    queueSource?: PublishJob["queueSource"];
  }
): Promise<QueuePublishJobsResult> {
  const queueSource = input?.queueSource ?? "manual";
  const scheduledAt = input?.scheduledAt?.trim() ? input.scheduledAt.trim() : null;
  const pack = await getHotspotPack(packId);

  if (!pack) {
    return {
      jobs: [],
      persisted: false,
      usedMockStorage: true
    };
  }

  const supabase = getSupabaseServerClient();

  if (!supabase || !isUuid(pack.id) || pack.variants.some((variant) => !isUuid(variant.id))) {
    const now = new Date().toISOString();
    const store = await updateLocalDataStore((current) => {
      const nextJobs = [...current.publishJobs];

      for (const variant of pack.variants) {
        for (const platform of variant.platforms) {
          const jobId = deterministicId(`${pack.id}:${variant.id}:${platform}`);
          const existingIndex = nextJobs.findIndex((job) => job.id === jobId);
          const existing = existingIndex >= 0 ? nextJobs[existingIndex] : undefined;
          const job: PublishJob = {
            id: jobId,
            packId: pack.id,
            variantId: variant.id,
            platform,
            status: "queued",
            queueSource,
            scheduledAt: scheduledAt ?? undefined,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now
          };

          if (existingIndex >= 0) {
            nextJobs[existingIndex] = job;
          } else {
            nextJobs.push(job);
          }
        }
      }

      return {
        ...current,
        publishJobs: nextJobs
      };
    });

    const jobs = store.publishJobs
      .filter((job) => job.packId === pack.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return {
      jobs,
      persisted: true,
      usedMockStorage: true
    };
  }

  const rows = pack.variants.flatMap((variant) =>
    variant.platforms.map((platform) => ({
      id: deterministicId(`${pack.id}:${variant.id}:${platform}`),
      pack_id: pack.id,
      variant_id: variant.id,
      platform,
      status: "queued",
      queue_source: queueSource,
      scheduled_at: scheduledAt,
      published_at: null,
      failure_reason: null,
      updated_at: new Date().toISOString()
    }))
  );

  if (rows.length === 0) {
    return {
      jobs: [],
      persisted: true,
      usedMockStorage: false
    };
  }

  const { error: upsertError } = await supabase
    .from("publish_jobs")
    .upsert(rows, { onConflict: "pack_id,variant_id,platform" });

  if (upsertError) {
    throw upsertError;
  }

  const jobs = await getPublishJobsForPack(pack.id);

  return {
    jobs,
    persisted: true,
    usedMockStorage: false
  };
}

export async function getQueuedPublishJobs(input?: {
  packId?: string;
  limit?: number;
}): Promise<QueuedPublishJob[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase || (input?.packId ? !isUuid(input.packId) : false)) {
    const store = await readLocalDataStore();
    const now = Date.now();
    const queued = store.publishJobs
      .filter((job) => job.status === "queued")
      .filter((job) => (input?.packId ? job.packId === input.packId : true))
      .filter((job) => {
        if (!job.scheduledAt) {
          return true;
        }

        const scheduled = Date.parse(job.scheduledAt);
        return Number.isNaN(scheduled) || scheduled <= now;
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    const limited =
      input?.limit && input.limit > 0 ? queued.slice(0, input.limit) : queued;

    return limited.flatMap((job) => {
      const pack = store.packs.find((item) => item.id === job.packId);
      const variant = pack?.variants.find((item) => item.id === job.variantId);

      if (!variant) {
        return [];
      }

      return [
        {
          ...job,
          variantTitle: variant.title,
          variantBody: variant.body,
          variantFormat: variant.format
        }
      ];
    });
  }

  const query = supabase
    .from("publish_jobs")
    .select("*, content_variants!inner(title, body, format)")
    .eq("status", "queued")
    .order("created_at", { ascending: true });

  if (input?.packId) {
    query.eq("pack_id", input.packId);
  }

  if (input?.limit && input.limit > 0) {
    query.limit(input.limit);
  }

  const { data, error } = await query.returns<PublishJobRow[]>();

  if (error || !data) {
    return [];
  }

  const now = Date.now();

  return data
    .filter((job) => {
      if (!job.scheduled_at) {
        return true;
      }

      const scheduled = Date.parse(job.scheduled_at);
      return Number.isNaN(scheduled) || scheduled <= now;
    })
    .map(mapQueuedPublishJob);
}

export async function updatePublishJobStatus(
  jobId: string,
  input: {
    status: PublishJob["status"];
    publishedAt?: string;
    failureReason?: string;
  }
): Promise<PublishJob | null> {
  const supabase = getSupabaseServerClient();

  const store = await readLocalDataStore();
  const localJobExists = store.publishJobs.some((job) => job.id === jobId);

  if (!supabase || localJobExists) {
    let updatedJob: PublishJob | null = null;

    await updateLocalDataStore((store) => {
      const publishJobs = store.publishJobs.map((job) => {
        if (job.id !== jobId) {
          return job;
        }

        updatedJob = {
          ...job,
          status: input.status,
          publishedAt: input.publishedAt,
          failureReason: input.failureReason,
          updatedAt: new Date().toISOString()
        };

        return updatedJob;
      });

      return {
        ...store,
        publishJobs
      };
    });

    return updatedJob;
  }

  const payload = {
    status: input.status,
    published_at: input.publishedAt ?? null,
    failure_reason: input.failureReason ?? null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("publish_jobs")
    .update(payload)
    .eq("id", jobId);

  if (error) {
    throw error;
  }

  const { data, error: fetchError } = await supabase
    .from("publish_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle<PublishJobRow>();

  if (fetchError || !data) {
    return null;
  }

  return mapPublishJob(data);
}

export async function deletePublishJob(jobId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();

  const store = await readLocalDataStore();
  const localJobExists = store.publishJobs.some((job) => job.id === jobId);

  if (!supabase || localJobExists) {
    let removed = false;

    await updateLocalDataStore((store) => ({
      ...store,
      publishJobs: store.publishJobs.filter((job) => {
        const shouldKeep = job.id !== jobId;

        if (!shouldKeep) {
          removed = true;
        }

        return shouldKeep;
      })
    }));

    return removed;
  }

  const { data, error } = await supabase
    .from("publish_jobs")
    .delete()
    .eq("id", jobId)
    .select("id")
    .returns<Array<{ id: string }>>();

  if (error) {
    throw error;
  }

  return (data?.length ?? 0) > 0;
}

export async function clearQueuedPublishJobs(input?: {
  packId?: string;
}): Promise<ClearPublishJobsResult> {
  const supabase = getSupabaseServerClient();

  if (!supabase || (input?.packId ? !isUuid(input.packId) : false)) {
    let removedCount = 0;

    await updateLocalDataStore((store) => ({
      ...store,
      publishJobs: store.publishJobs.filter((job) => {
        const shouldRemove = job.status === "queued" && (input?.packId ? job.packId === input.packId : true);

        if (shouldRemove) {
          removedCount += 1;
          return false;
        }

        return true;
      })
    }));

    return {
      removedCount,
      usedMockStorage: true
    };
  }

  let query = supabase.from("publish_jobs").delete().eq("status", "queued");

  if (input?.packId) {
    query = query.eq("pack_id", input.packId);
  }

  const { data, error } = await query.select("id").returns<Array<{ id: string }>>();

  if (error) {
    throw error;
  }

  return {
    removedCount: data?.length ?? 0,
    usedMockStorage: false
  };
}
