export type Platform = "xiaohongshu" | "wechat" | "video-channel" | "douyin";

export type HotspotKind = "industry" | "mass" | "brand";

export type ContentTrack = "rapid-response" | "point-of-view";

export type ReviewStatus = "pending" | "approved" | "needs-edit";

export type PublishStatus = "queued" | "published" | "failed" | "canceled";

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
  detectedAt: string;
  relevanceScore: number;
  industryScore: number;
  velocityScore: number;
  riskScore: number;
  recommendedAction: "ship-now" | "watch" | "discard";
  reasons: string[];
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
