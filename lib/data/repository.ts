import { createHash } from "node:crypto";
import {
  brandStrategyPack as mockBrandStrategyPack,
  dashboardMetrics as mockDashboardMetrics,
  hotspotPacks as mockHotspotPacks,
  hotspotSignals as mockHotspotSignals
} from "@/lib/data/mock";
import {
  BrandSource,
  BrandStrategyPack,
  ContentVariant,
  DashboardMetric,
  HotspotPack,
  HotspotSignal,
  Platform,
  PublishJob
} from "@/lib/domain/types";
import { prioritizeHotspots } from "@/lib/services/hotspot-engine";
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
  title: string;
  summary: string;
  kind: HotspotSignal["kind"];
  source: string;
  detected_at: string;
  relevance_score: number;
  industry_score: number;
  velocity_score: number;
  risk_score: number;
  recommended_action: HotspotSignal["recommendedAction"];
  reasons: string[];
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

export interface QueuePublishJobsResult {
  jobs: PublishJob[];
  persisted: boolean;
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
    name: row.name,
    slogan: row.slogan,
    sector: row.sector,
    audiences: row.audiences,
    positioning: row.positioning,
    topics: row.topics,
    tone: row.tone,
    redLines: row.red_lines,
    competitors: row.competitors,
    recentMoves: row.recent_moves,
    sources
  };
}

function mapHotspot(row: HotspotRow): HotspotSignal {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    kind: row.kind,
    source: row.source,
    detectedAt: row.detected_at,
    relevanceScore: row.relevance_score,
    industryScore: row.industry_score,
    velocityScore: row.velocity_score,
    riskScore: row.risk_score,
    recommendedAction: row.recommended_action,
    reasons: row.reasons
  };
}

function mapPack(row: HotspotPackRow): HotspotPack {
  return {
    id: row.id,
    brandId: row.brand_id,
    hotspotId: row.hotspot_id,
    status: row.status,
    whyNow: row.why_now,
    whyUs: row.why_us,
    reviewOwner: row.review_owner,
    reviewNote: row.review_note ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    variants: (row.content_variants ?? []).map((variant) => ({
      id: variant.id,
      track: variant.track,
      title: variant.title,
      angle: variant.angle,
      platforms: variant.platforms,
      format: variant.format,
      body: variant.body,
      coverHook: variant.cover_hook,
      publishWindow: variant.publish_window
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

export async function getBrandStrategyPack(): Promise<BrandStrategyPack> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return mockBrandStrategyPack;
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

export async function getHotspotSignals(): Promise<HotspotSignal[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return mockHotspotSignals;
  }

  const { data, error } = await supabase
    .from("hotspots")
    .select("*")
    .order("detected_at", { ascending: false })
    .returns<HotspotRow[]>();

  if (error || !data || data.length === 0) {
    return mockHotspotSignals;
  }

  return data.map(mapHotspot);
}

export async function getReviewQueue(): Promise<HotspotPack[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return mockHotspotPacks;
  }

  const { data, error } = await supabase
    .from("hotspot_packs")
    .select(
      "id, brand_id, hotspot_id, status, why_now, why_us, review_owner, review_note, reviewed_by, reviewed_at, content_variants (id, track, title, angle, format, body, cover_hook, publish_window, platforms)"
    )
    .order("created_at", { ascending: false })
    .returns<HotspotPackRow[]>();

  if (error || !data || data.length === 0) {
    return mockHotspotPacks;
  }

  return data.map(mapPack);
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

export async function updateHotspotPackReview(
  packId: string,
  input: {
    status: HotspotPack["status"];
    note?: string;
    reviewer?: string;
  }
): Promise<HotspotPack | null> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const payload = {
    status: input.status,
    review_note: input.note?.trim() ? input.note.trim() : null,
    reviewed_by: input.reviewer?.trim() ? input.reviewer.trim() : null,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("hotspot_packs")
    .update(payload)
    .eq("id", packId);

  if (error) {
    throw error;
  }

  return (await getHotspotPack(packId)) ?? null;
}

export async function getPublishJobsForPack(packId: string): Promise<PublishJob[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
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

  if (!supabase) {
    const now = new Date().toISOString();
    const jobs = pack.variants.flatMap((variant) =>
      variant.platforms.map((platform) => ({
        id: deterministicId(`${pack.id}:${variant.id}:${platform}:mock`),
        packId: pack.id,
        variantId: variant.id,
        platform,
        status: "queued" as const,
        queueSource,
        scheduledAt: scheduledAt ?? undefined,
        createdAt: now,
        updatedAt: now
      }))
    );

    return {
      jobs,
      persisted: false,
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

  if (!supabase) {
    return [];
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

  if (!supabase) {
    return null;
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
