export type Platform = "xiaohongshu" | "wechat" | "video-channel" | "douyin";

export type HotspotKind = "industry" | "mass" | "brand";

export type ContentTrack = "rapid-response" | "point-of-view";

export type ReviewStatus = "pending" | "approved" | "needs-edit";

export type PublishStatus = "queued" | "published" | "failed" | "canceled";
export type ProductionJobStatus = "queued" | "running" | "needs-review" | "completed" | "failed";
export type ProductionJobStage = "script" | "image" | "video" | "voice" | "subtitle" | "finalize";
export type ProductionAssetKind = "script" | "image" | "video" | "voice" | "subtitle" | "bundle";
export type ProductionAssetStatus = "ready" | "failed";
export type ProductionEventLevel = "info" | "warning" | "error";
export type HotspotFetchStatus = "ok" | "empty" | "failed";
export type HotspotSourceType = "direct" | "rss" | "aggregator";
export type HotspotProviderRole = "primary" | "fallback";

export type LlmTask =
  | "hotspot-analysis"
  | "strategy-planning"
  | "content-generation"
  | "copy-polish";

export type ModelPreference = "latency" | "quality" | "balanced";

export interface BrandSource {
  label: string;
  type: "website" | "knowledge-base" | "wechat-history" | "event" | "press";
  freshness: "stable" | "timely";
  value: string;
}

export interface BrandStrategyPack {
  id: string;
  name: string;
  slogan: string;
  sector: string;
  audiences: string[];
  positioning: string[];
  topics: string[];
  tone: string[];
  redLines: string[];
  competitors: string[];
  recentMoves: string[];
  sources: BrandSource[];
}

export interface HotspotSignal {
  id: string;
  title: string;
  summary: string;
  kind: HotspotKind;
  source: string;
  sourceUrl?: string;
  detectedAt: string;
  relevanceScore: number;
  industryScore: number;
  velocityScore: number;
  riskScore: number;
  recommendedAction: "ship-now" | "watch" | "discard";
  reasons: string[];
}

export interface HotspotProviderReport {
  id: string;
  label: string;
  sourceType?: HotspotSourceType;
  priorityRole?: HotspotProviderRole;
  fetched: number;
  persisted: number;
  fetchStatus?: HotspotFetchStatus;
  fetchNote?: string;
  pageChecked?: boolean;
  pageReachable?: boolean;
  pageMatchedTitles?: number;
  pageGated?: boolean;
  pageNote?: string;
}

export interface HotspotSyncSnapshot {
  executedAt: string;
  providerCount: number;
  hotspotCount: number;
  providers: HotspotProviderReport[];
}

export interface ContentVariant {
  id: string;
  track: ContentTrack;
  title: string;
  angle: string;
  platforms: Platform[];
  format: "post" | "article" | "video-script";
  body: string;
  coverHook: string;
  publishWindow: string;
}

export interface HotspotPack {
  id: string;
  workspaceId?: string;
  brandId: string;
  hotspotId: string;
  status: ReviewStatus;
  whyNow: string;
  whyUs: string;
  reviewOwner: string;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  variants: ContentVariant[];
}

export interface DashboardMetric {
  label: string;
  value: string;
  delta: string;
  tone: "positive" | "neutral" | "warning";
}

export interface ModelRouteDecision {
  task: LlmTask;
  provider: string;
  model: string;
  reason: string;
}

export interface PublishJob {
  id: string;
  workspaceId?: string;
  packId: string;
  variantId: string;
  platform: Platform;
  status: PublishStatus;
  queueSource: "manual" | "auto";
  scheduledAt?: string;
  publishedAt?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionJob {
  id: string;
  workspaceId: string;
  packId: string;
  status: ProductionJobStatus;
  stage: ProductionJobStage;
  createdBy?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionAsset {
  id: string;
  workspaceId: string;
  packId: string;
  jobId: string;
  kind: ProductionAssetKind;
  name: string;
  status: ProductionAssetStatus;
  provider: string;
  model: string;
  previewUrl?: string;
  textContent?: string;
  jsonContent?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionDraft {
  id: string;
  workspaceId: string;
  packId: string;
  title: string;
  body: string;
  subtitles: string;
  coverAssetId?: string;
  videoAssetId?: string;
  voiceAssetId?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionAssetVersion {
  id: string;
  workspaceId: string;
  packId: string;
  jobId: string;
  assetId: string;
  changedBy?: string;
  beforeState?: string;
  afterState?: string;
  changeReason?: string;
  createdAt: string;
}

export interface ProductionJobEvent {
  id: string;
  workspaceId: string;
  packId: string;
  jobId: string;
  stage?: ProductionJobStage;
  level: ProductionEventLevel;
  message: string;
  payload?: string;
  createdAt: string;
}

export interface ProductionQualityIssue {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
}

export interface ProductionQualityReport {
  score: number;
  passed: boolean;
  issues: ProductionQualityIssue[];
  generatedAt: string;
}
