import { createHash } from "node:crypto";
import { getBrandStrategyPack } from "@/lib/data";
import { BrandStrategyPack, HotspotKind, HotspotSignal } from "@/lib/domain/types";
import { getChinaHotspotRules } from "@/lib/services/china-market";
import { GeneratedPackResult, generateContentPackForEntities } from "@/lib/services/content-pack-generator";
import { getSupabaseServerClient } from "@/lib/supabase/client";

interface FeedItem {
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
}

interface HotspotProvider {
  id: string;
  label: string;
  kind: HotspotKind;
  source: string;
  market: "china" | "global";
  buildUrl: (brand: BrandStrategyPack) => string;
}

interface SyncedHotspot extends HotspotSignal {
  id: string;
  url: string;
  providerId: string;
  priorityScore: number;
}

export interface HotspotSyncResult {
  providers: Array<{
    id: string;
    label: string;
    fetched: number;
    persisted: number;
  }>;
  hotspots: SyncedHotspot[];
  generatedPacks: Array<{
    hotspotId: string;
    packId: string;
    persisted: boolean;
    usedMockStorage: boolean;
  }>;
  persisted: boolean;
  usedMockStorage: boolean;
}

const providerConfigs: HotspotProvider[] = [
  {
    id: "rss-36kr",
    label: "36Kr / China Tech",
    kind: "industry",
    source: "36Kr RSS",
    market: "china",
    buildUrl: () => "https://36kr.com/feed"
  },
  {
    id: "rss-ithome",
    label: "IT之家 / China Tech",
    kind: "industry",
    source: "IT之家 RSS",
    market: "china",
    buildUrl: () => "https://www.ithome.com/rss/"
  },
  {
    id: "rss-cnbeta",
    label: "cnBeta / China Tech",
    kind: "industry",
    source: "cnBeta RSS",
    market: "china",
    buildUrl: () => "https://rss.cnbeta.com/"
  },
  {
    id: "google-news-china-platform",
    label: "Google News / China Platform Signals",
    kind: "mass",
    source: "Google News RSS",
    market: "china",
    buildUrl: () =>
      buildGoogleNewsUrl('("微信 视频号" OR "抖音" OR "小红书" OR "内容平台 算法" OR "创作者平台 规则")')
  },
  {
    id: "google-news-china-industry",
    label: "Google News / China AI SaaS",
    kind: "industry",
    source: "Google News RSS",
    market: "china",
    buildUrl: () =>
      buildGoogleNewsUrl('("AI" OR "大模型" OR "SaaS" OR "软件服务" OR "企业服务")')
  },
  {
    id: "google-news-brand-watch",
    label: "Google News / Brand & Competitors CN",
    kind: "brand",
    source: "Google News RSS",
    market: "china",
    buildUrl: (brand) => {
      const companyTerms = [brand.name, ...brand.competitors.slice(0, 3)]
        .filter(Boolean)
        .map((term) => `"${term}"`)
        .join(" OR ");

      return buildGoogleNewsUrl(`(${companyTerms})`);
    }
  },
  {
    id: "google-news-global-core",
    label: "Google News / Global Core Media",
    kind: "industry",
    source: "Google News RSS",
    market: "global",
    buildUrl: () =>
      buildGoogleNewsUrl('("OpenAI" OR "Anthropic" OR "Google DeepMind" OR "TechCrunch AI" OR "The Verge AI")', {
        locale: "en-US",
        region: "US",
        edition: "US:en"
      })
  }
];

function buildGoogleNewsUrl(
  query: string,
  options?: {
    locale?: string;
    region?: string;
    edition?: string;
  }
): string {
  const locale = options?.locale ?? process.env.HOTSPOT_RSS_LOCALE ?? "zh-CN";
  const region = options?.region ?? process.env.HOTSPOT_RSS_REGION ?? "CN";
  const edition = options?.edition ?? process.env.HOTSPOT_RSS_EDITION ?? "CN:zh-Hans";
  const search = new URLSearchParams({
    q: query,
    hl: locale,
    gl: region,
    ceid: edition
  });

  return `https://news.google.com/rss/search?${search.toString()}`;
}

function createDeterministicId(value: string): string {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function stripHtml(value: string): string {
  return decodeEntities(value.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(block: string, tag: string): string {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  return stripHtml(block.match(pattern)?.[1] ?? "");
}

function parseFeedItems(xml: string): FeedItem[] {
  const itemBlocks = [...xml.matchAll(/<(item|entry)>([\s\S]*?)<\/(item|entry)>/gi)];

  return itemBlocks
    .map((match) => {
      const block = match[2];
      const title = extractTag(block, "title");
      const summary =
        extractTag(block, "description") || extractTag(block, "summary") || extractTag(block, "content");
      const url =
        extractTag(block, "link") || (block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
      const publishedAt =
        extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");

      if (!title || !url) {
        return null;
      }

      return {
        title,
        summary,
        url,
        publishedAt
      };
    })
    .filter((item): item is FeedItem => item !== null);
}

function computeVelocityScore(publishedAt: string): number {
  const timestamp = Date.parse(publishedAt);

  if (Number.isNaN(timestamp)) {
    return 50;
  }

  const hoursSincePublish = Math.max(0, (Date.now() - timestamp) / 3_600_000);

  if (hoursSincePublish <= 6) {
    return 92;
  }

  if (hoursSincePublish <= 24) {
    return 82;
  }

  if (hoursSincePublish <= 72) {
    return 68;
  }

  return 54;
}

function scoreAgainstBrand(brand: BrandStrategyPack, item: FeedItem, kind: HotspotKind) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const topicMatches = brand.topics.filter((topic) => text.includes(topic.toLowerCase())).length;
  const competitorMatches = brand.competitors.filter((name) => text.includes(name.toLowerCase())).length;
  const brandMention = text.includes(brand.name.toLowerCase()) ? 1 : 0;
  const aiSignals = ["ai", "agent", "大模型", "模型", "automation", "saas", "b2b", "增长", "平台"].filter((term) =>
    text.includes(term.toLowerCase())
  ).length;

  const relevanceScore = Math.min(
    96,
    48 + topicMatches * 10 + competitorMatches * 6 + brandMention * 12 + aiSignals * 3
  );

  const industryBase = kind === "industry" ? 68 : kind === "mass" ? 56 : 52;
  const industryScore = Math.min(94, industryBase + topicMatches * 6 + aiSignals * 4);
  const velocityScore = computeVelocityScore(item.publishedAt);

  const riskHits = ["lawsuit", "layoff", "监管", "controversy", "裁员", "违规", "事故", "诉讼"].filter((term) =>
    text.includes(term.toLowerCase())
  ).length;
  const riskScore = Math.min(90, 22 + competitorMatches * 8 + riskHits * 14);
  const priorityScore = Math.round(
    relevanceScore * 0.35 + industryScore * 0.3 + velocityScore * 0.25 - riskScore * 0.1
  );

  const reasons = [
    topicMatches > 0 ? `命中 ${topicMatches} 个品牌传播主题` : "与品牌主题存在弱相关，需要人工复核",
    competitorMatches > 0 ? `涉及 ${competitorMatches} 个竞品或参照对象` : "更适合行业观点切入",
    velocityScore >= 80 ? "发布时间新，适合快反档" : "适合进入观察或观点档"
  ];

  const recommendedAction =
    priorityScore >= 75 && riskScore < 55 ? "ship-now" : priorityScore >= 58 ? "watch" : "discard";

  return {
    relevanceScore,
    industryScore,
    velocityScore,
    riskScore,
    priorityScore,
    reasons,
    recommendedAction
  } satisfies Pick<
    SyncedHotspot,
    "relevanceScore" | "industryScore" | "velocityScore" | "riskScore" | "priorityScore" | "reasons" | "recommendedAction"
  >;
}

async function fetchProviderItems(provider: HotspotProvider, brand: BrandStrategyPack): Promise<FeedItem[]> {
  const response = await fetch(provider.buildUrl(brand), {
    headers: {
      "User-Agent": "BrandHotspotStudio/0.1"
    },
    next: {
      revalidate: 0
    }
  });

  if (!response.ok) {
    throw new Error(`${provider.id} responded with ${response.status}`);
  }

  const xml = await response.text();
  return parseFeedItems(xml);
}

async function persistHotspots(brand: BrandStrategyPack, hotspots: SyncedHotspot[]) {
  const supabase = getSupabaseServerClient();

  if (!supabase || hotspots.length === 0) {
    return {
      persisted: false,
      usedMockStorage: true
    };
  }

  const hotspotRows = hotspots.map((hotspot) => ({
    id: hotspot.id,
    title: hotspot.title,
    summary: hotspot.summary,
    kind: hotspot.kind,
    source: `${hotspot.source} / ${hotspot.providerId}`,
    detected_at: hotspot.detectedAt,
    relevance_score: hotspot.relevanceScore,
    industry_score: hotspot.industryScore,
    velocity_score: hotspot.velocityScore,
    risk_score: hotspot.riskScore,
    recommended_action: hotspot.recommendedAction,
    reasons: hotspot.reasons
  }));

  const { error: hotspotError } = await supabase
    .from("hotspots")
    .upsert(hotspotRows, { onConflict: "id" });

  if (hotspotError) {
    throw hotspotError;
  }

  const scoreRows = hotspots.map((hotspot) => ({
    id: createDeterministicId(`${brand.id}:${hotspot.id}:score`),
    brand_id: brand.id,
    hotspot_id: hotspot.id,
    priority_score: hotspot.priorityScore,
    is_high_priority: hotspot.priorityScore >= 75
  }));

  const { error: scoreError } = await supabase
    .from("hotspot_scores")
    .upsert(scoreRows, { onConflict: "brand_id,hotspot_id" });

  if (scoreError) {
    throw scoreError;
  }

  return {
    persisted: true,
    usedMockStorage: false
  };
}

function shouldAutoGenerate(action: HotspotSignal["recommendedAction"]): boolean {
  const configuredActions = (process.env.AUTO_GENERATE_RECOMMENDED_ACTIONS ?? "ship-now")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return configuredActions.includes(action);
}

async function autoGeneratePacks(
  brand: BrandStrategyPack,
  hotspots: SyncedHotspot[]
): Promise<GeneratedPackResult[]> {
  const enabled = (process.env.AUTO_GENERATE_CONTENT_PACKS ?? "true").toLowerCase() !== "false";

  if (!enabled) {
    return [];
  }

  const maxPacks = Number.parseInt(process.env.AUTO_GENERATE_MAX_PACKS ?? "3", 10);
  const candidates = hotspots
    .filter((hotspot) => shouldAutoGenerate(hotspot.recommendedAction))
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, Number.isNaN(maxPacks) ? 3 : maxPacks);

  return Promise.all(candidates.map((hotspot) => generateContentPackForEntities(brand, hotspot)));
}

export async function syncHotspots(): Promise<HotspotSyncResult> {
  const brand = await getBrandStrategyPack();
  const providerResults = await Promise.all(
    providerConfigs.map(async (provider) => {
      const items = await fetchProviderItems(provider, brand);

      const hotspots = items.slice(0, 10).map((item) => {
        const scores = scoreAgainstBrand(brand, item, provider.kind);
        const localizedBoost = provider.market === "china" ? 6 : 0;
        const priorityScore = Math.min(98, scores.priorityScore + localizedBoost);
        const reasons = [...scores.reasons, ...getChinaHotspotRules().slice(0, 1)];
        const recommendedAction =
          priorityScore >= 75 && scores.riskScore < 55
            ? "ship-now"
            : priorityScore >= 58
              ? "watch"
              : "discard";

        return {
          id: createDeterministicId(`${provider.id}:${item.url}`),
          providerId: provider.id,
          url: item.url,
          title: item.title,
          summary: item.summary || item.title,
          kind: provider.kind,
          source: `${provider.source} / ${provider.market === "china" ? "CN-first" : "Global-core"}`,
          detectedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : new Date().toISOString(),
          ...scores,
          priorityScore,
          reasons,
          recommendedAction
        } satisfies SyncedHotspot;
      });

      return {
        provider,
        hotspots
      };
    })
  );

  const deduped = Array.from(
    new Map(
      providerResults
        .flatMap((result) => result.hotspots)
        .map((hotspot) => [hotspot.id, hotspot] as const)
    ).values()
  ).sort((left, right) => right.priorityScore - left.priorityScore);

  const storage = await persistHotspots(brand, deduped);
  const generatedPacks = await autoGeneratePacks(brand, deduped);

  return {
    providers: providerResults.map((result) => ({
      id: result.provider.id,
      label: result.provider.label,
      fetched: result.hotspots.length,
      persisted: storage.persisted ? result.hotspots.length : 0
    })),
    hotspots: deduped,
    generatedPacks: generatedPacks.map((result) => ({
      hotspotId: result.pack.hotspotId,
      packId: result.pack.id,
      persisted: result.persisted,
      usedMockStorage: result.usedMockStorage
    })),
    persisted: storage.persisted,
    usedMockStorage: storage.usedMockStorage
  };
}
