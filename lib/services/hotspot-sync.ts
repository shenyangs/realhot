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
  pageUrl?: string;
  buildUrl?: (brand: BrandStrategyPack) => string;
  fetchItems?: (brand: BrandStrategyPack) => Promise<FeedItem[]>;
}

interface SyncedHotspot extends HotspotSignal {
  id: string;
  url: string;
  providerId: string;
  priorityScore: number;
}

interface ProviderPageObservation {
  checked: boolean;
  reachable: boolean;
  matchedTitles: number;
  gated: boolean;
  note: string;
}

export interface HotspotSyncResult {
  providers: Array<{
    id: string;
    label: string;
    fetched: number;
    persisted: number;
    pageChecked?: boolean;
    pageReachable?: boolean;
    pageMatchedTitles?: number;
    pageGated?: boolean;
    pageNote?: string;
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

interface EntobitRankConfig {
  kind: HotspotKind;
  label: string;
  rankType: string;
}

interface JsonHotspotProviderConfig {
  id: string;
  label: string;
  kind: HotspotKind;
  source: string;
  market: "china" | "global";
  pageUrl?: string;
  url: string;
  isEnabled: () => boolean;
  mapItems: (payload: unknown) => FeedItem[];
}

const baseProviderConfigs: HotspotProvider[] = [
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

const entobitRankConfigs: Record<string, EntobitRankConfig> = {
  realTimeHotSearchList: {
    kind: "mass",
    label: "微博热搜榜",
    rankType: "realTimeHotSearchList"
  },
  douyin: {
    kind: "mass",
    label: "抖音热点榜",
    rankType: "douyin"
  },
  baidu: {
    kind: "mass",
    label: "百度热搜榜",
    rankType: "baidu"
  },
  xiaohongshu: {
    kind: "mass",
    label: "小红书热点榜",
    rankType: "xiaohongshu"
  }
};

const entobitDefaultRankTypes = ["realTimeHotSearchList", "douyin", "baidu", "xiaohongshu"];

const auxiliaryJsonProviderConfigs: JsonHotspotProviderConfig[] = [
  {
    id: "aa1-baidu-hot",
    label: "AA1 / 百度热搜",
    kind: "mass",
    source: "AA1 Baidu Hot",
    market: "china",
    pageUrl: "https://top.baidu.com/board?tab=realtime",
    url: "https://zj.v.api.aa1.cn/api/baidu-rs/",
    isEnabled: () => (process.env.ENABLE_AA1_BAIDU_HOT_SEARCH ?? "true").toLowerCase() !== "false",
    mapItems: mapAa1BaiduItems
  },
  {
    id: "aa1-weibo-hot",
    label: "AA1 / 微博热搜",
    kind: "mass",
    source: "AA1 Weibo Hot",
    market: "china",
    pageUrl: "https://s.weibo.com/top/summary",
    url: "https://zj.v.api.aa1.cn/api/weibo-rs/",
    isEnabled: () => (process.env.ENABLE_AA1_WEIBO_HOT_SEARCH ?? "true").toLowerCase() !== "false",
    mapItems: mapAa1WeiboItems
  },
  {
    id: "zhihu-hot-list",
    label: "Zhihu / Hot List",
    kind: "mass",
    source: "Zhihu Hot API",
    market: "china",
    pageUrl: "https://www.zhihu.com/hot",
    url: "https://api.zhihu.com/topstory/hot-list?limit=10&reverse_order=0",
    isEnabled: () => (process.env.ENABLE_ZHIHU_HOT_SEARCH ?? "true").toLowerCase() !== "false",
    mapItems: mapZhihuHotItems
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

function isEntobitEnabled(): boolean {
  return (process.env.ENABLE_ENTOBIT_HOT_SEARCH ?? "false").toLowerCase() === "true";
}

function getEntobitRankTypes(): string[] {
  const configured = (process.env.ENTOBIT_HOT_SEARCH_RANK_TYPES ?? entobitDefaultRankTypes.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return configured.filter((rankType, index) => configured.indexOf(rankType) === index);
}

function isAuxiliaryJsonSourcesEnabled(): boolean {
  return (process.env.ENABLE_AUXILIARY_HOT_SOURCES ?? "true").toLowerCase() !== "false";
}

function getProviderConfigs(): HotspotProvider[] {
  const providers = [...baseProviderConfigs];

  if (isAuxiliaryJsonSourcesEnabled()) {
    providers.push(
      ...auxiliaryJsonProviderConfigs
        .filter((config) => config.isEnabled())
        .map(
          (config) =>
            ({
              id: config.id,
              label: config.label,
              kind: config.kind,
              source: config.source,
              market: config.market,
              pageUrl: config.pageUrl,
              fetchItems: () => fetchJsonProviderItems(config)
            }) satisfies HotspotProvider
        )
    );
  }

  if (isEntobitEnabled()) {
    providers.push(
      ...getEntobitRankTypes().reduce<HotspotProvider[]>((items, rankType) => {
        const config = entobitRankConfigs[rankType];

        if (!config) {
          return items;
        }

        items.push({
          id: `entobit-${rankType}`,
          label: `Entobit / ${config.label}`,
          kind: config.kind,
          source: "Entobit Hot Search",
          market: "china",
          pageUrl: "https://www.entobit.cn/hot-search/desktop",
          fetchItems: () => fetchEntobitItems(config)
        });

        return items;
      }, [])
    );
  }

  return providers;
}

function createDeterministicId(value: string): string {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function buildEntobitItemUrl(rankType: string, keyword: string): string {
  const search = new URLSearchParams({
    rankType,
    keyword
  });

  return `https://www.entobit.cn/hot-search/desktop?${search.toString()}`;
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

function parseLooseJson(text: string): unknown {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  const firstBrace = trimmed.search(/[\[{]/);

  if (firstBrace === -1) {
    return null;
  }

  const candidate = trimmed.slice(firstBrace);

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeTimestamp(value: number | string | null | undefined): string {
  if (typeof value === "number") {
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);

    if (!Number.isNaN(numeric)) {
      return normalizeTimestamp(numeric);
    }

    const parsed = Date.parse(value);

    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

function readArrayPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;

  for (const key of ["data", "list", "rows", "result"]) {
    const value = objectPayload[key];

    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
    }
  }

  return [];
}

function readRecordPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
}

function stringifyMetricLabel(label: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return `${label}: ${String(value)}`;
}

function trimText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapAa1BaiduItems(payload: unknown): FeedItem[] {
  const record = readRecordPayload(payload);
  const items = readArrayPayload(record);

  return items
    .map((item) => {
      const title = trimText(item.title);
      const url = trimText(item.url) ?? trimText(item.mobilUrl);

      if (!title || !url) {
        return null;
      }

      const summaryParts = [
        trimText(item.desc),
        stringifyMetricLabel("平台", "百度热搜"),
        stringifyMetricLabel("热度", item.hot),
        stringifyMetricLabel("排名", item.index)
      ].filter((value): value is string => Boolean(value));

      return {
        title,
        summary: summaryParts.join(" | ") || "百度热搜聚合词",
        url,
        publishedAt: new Date().toISOString()
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => item !== null);
}

function mapAa1WeiboItems(payload: unknown): FeedItem[] {
  const record = readRecordPayload(payload);
  const items = readArrayPayload(record);

  return items
    .map((item) => {
      const title = trimText(item.title) ?? trimText(item.keyword);
      const url = trimText(item.url) ?? (title ? buildEntobitItemUrl("realTimeHotSearchList", title) : null);

      if (!title || !url) {
        return null;
      }

      const summaryParts = [
        trimText(item.desc),
        stringifyMetricLabel("平台", "微博热搜"),
        stringifyMetricLabel("热度", item.hot ?? item.num),
        stringifyMetricLabel("排名", item.index)
      ].filter((value): value is string => Boolean(value));

      return {
        title,
        summary: summaryParts.join(" | ") || "微博热搜聚合词",
        url,
        publishedAt: new Date().toISOString()
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => item !== null);
}

function mapZhihuHotItems(payload: unknown): FeedItem[] {
  const record = readRecordPayload(payload);
  const items = readArrayPayload(record?.data);

  return items
    .map((item) => {
      const target = readRecordPayload(item.target);
      const title = trimText(target?.title);
      const url = trimText(target?.url);

      if (!title || !url) {
        return null;
      }

      const summaryParts = [
        trimText(target?.excerpt),
        stringifyMetricLabel("平台", "知乎热榜"),
        stringifyMetricLabel("热度", item.detail_text),
        stringifyMetricLabel("回答数", target?.answer_count)
      ].filter((value): value is string => Boolean(value));

      return {
        title,
        summary: summaryParts.join(" | ") || "知乎热榜问题",
        url,
        publishedAt: normalizeTimestamp(target?.created as number | string | undefined)
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => item !== null);
}

function mapEntobitItem(item: Record<string, unknown>, config: EntobitRankConfig): FeedItem | null {
  const title = [item.keywords, item.keyword, item.title].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  if (!title) {
    return null;
  }

  const summaryParts = [
    typeof item.lead === "string" && item.lead.trim() ? item.lead.trim() : null,
    stringifyMetricLabel("榜单", config.label),
    stringifyMetricLabel("热度", item.searchNums ?? item.hotValue ?? item.heat),
    stringifyMetricLabel("在榜时长", item.durationToday ?? item.duration)
  ].filter((value): value is string => Boolean(value));

  return {
    title: title.trim(),
    summary: summaryParts.join(" | ") || `${config.label} 聚合热搜词`,
    url:
      (typeof item.url === "string" && item.url.trim()) ||
      buildEntobitItemUrl(config.rankType, title.trim()),
    publishedAt: normalizeTimestamp(
      (item.updateTime as number | string | undefined) ?? (item.timestamp as number | string | undefined)
    )
  };
}

async function fetchEntobitItems(config: EntobitRankConfig): Promise<FeedItem[]> {
  const body = new URLSearchParams({
    type: config.rankType,
    accessToken: ""
  });

  const maxItems = Number.parseInt(process.env.ENTOBIT_HOT_SEARCH_MAX_ITEMS ?? "10", 10);
  const limit = Number.isNaN(maxItems) ? 10 : maxItems;
  let apiItems: FeedItem[] = [];

  try {
    const response = await fetch("https://www.entobit.cn/trending/hsa/getHotSearchKeywords.do", {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Origin: "https://www.entobit.cn",
        Referer: "https://www.entobit.cn/hot-search/desktop",
        "User-Agent": "BrandHotspotStudio/0.1",
        "X-Requested-With": "XMLHttpRequest",
        type: "restful"
      },
      body: body.toString(),
      next: {
        revalidate: 0
      }
    });

    if (!response.ok) {
      throw new Error(`Entobit ${config.rankType} responded with ${response.status}`);
    }

    const text = (await response.text()).trim();

    if (text) {
      const payload = parseLooseJson(text);

      if (payload !== null) {
        apiItems = readArrayPayload(payload)
          .map((item) => mapEntobitItem(item, config))
          .filter((item): item is FeedItem => item !== null)
          .slice(0, limit);
      }
    }
  } catch (error) {
    throw error;
  }

  return apiItems;
}

async function fetchJsonProviderItems(config: JsonHotspotProviderConfig): Promise<FeedItem[]> {
  const response = await fetch(config.url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "BrandHotspotStudio/0.1"
    },
    next: {
      revalidate: 0
    }
  });

  if (!response.ok) {
    throw new Error(`${config.id} responded with ${response.status}`);
  }

  const payload = parseLooseJson(await response.text());

  if (payload === null) {
    return [];
  }

  const items = config.mapItems(payload);
  const maxItems = Number.parseInt(process.env.AUXILIARY_HOT_SOURCE_MAX_ITEMS ?? "10", 10);
  const limit = Number.isNaN(maxItems) ? 10 : maxItems;

  return items.slice(0, limit);
}

function normalizeHotspotTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/[：:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function observeProviderPage(provider: HotspotProvider, items: FeedItem[]): Promise<ProviderPageObservation | null> {
  if (!provider.pageUrl) {
    return null;
  }

  try {
    const response = await fetch(provider.pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      next: {
        revalidate: 0
      }
    });

    if (!response.ok) {
      return {
        checked: true,
        reachable: false,
        matchedTitles: 0,
        gated: false,
        note: `网页返回 ${response.status}`
      };
    }

    const html = await response.text();
    const candidateTitles = items.slice(0, 5).map((item) => normalizeHotspotTitle(item.title));
    const normalizedHtml = normalizeHotspotTitle(stripHtml(html));
    const matchedTitles = candidateTitles.filter((title) => title && normalizedHtml.includes(title)).length;
    const gated = /sina visitor system|请登录|安全验证|访问受限/i.test(html);

    const note = gated
      ? "网页可达，但被门禁/访客系统拦截"
      : matchedTitles > 0
        ? `网页命中 ${matchedTitles} 个标题`
        : "网页可达，但未在静态 HTML 中命中标题";

    return {
      checked: true,
      reachable: true,
      matchedTitles,
      gated,
      note
    };
  } catch (error) {
    return {
      checked: true,
      reachable: false,
      matchedTitles: 0,
      gated: false,
      note: error instanceof Error ? error.message : "网页校验失败"
    };
  }
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
  if (provider.fetchItems) {
    return provider.fetchItems(brand);
  }

  if (!provider.buildUrl) {
    throw new Error(`Provider ${provider.id} is missing buildUrl`);
  }

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

function mergeHotspotsByTitle(hotspots: SyncedHotspot[]): SyncedHotspot[] {
  const merged = new Map<string, SyncedHotspot>();

  for (const hotspot of hotspots) {
    const key = `${hotspot.kind}:${normalizeHotspotTitle(hotspot.title)}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, hotspot);
      continue;
    }

    const mergedSources = Array.from(
      new Set(
        `${existing.source}|${hotspot.source}`
          .split("|")
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
    const mergedProviderIds = Array.from(
      new Set(
        `${existing.providerId},${hotspot.providerId}`
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
    const evidenceCount = mergedProviderIds.length;
    const mergedReasons = Array.from(
      new Set([
        ...existing.reasons,
        ...hotspot.reasons,
        evidenceCount > 1 ? `多源交叉命中 ${evidenceCount} 个信源` : null
      ].filter((item): item is string => Boolean(item)))
    );

    const preferred = hotspot.priorityScore > existing.priorityScore ? hotspot : existing;
    const mergedPriorityScore = Math.min(99, Math.max(existing.priorityScore, hotspot.priorityScore) + (evidenceCount > 1 ? 4 : 0));
    const mergedRiskScore = Math.min(existing.riskScore, hotspot.riskScore);
    const mergedRecommendedAction =
      mergedPriorityScore >= 75 && mergedRiskScore < 55
        ? "ship-now"
        : mergedPriorityScore >= 58
          ? "watch"
          : "discard";

    merged.set(key, {
      ...preferred,
      id: createDeterministicId(`merged:${key}`),
      providerId: mergedProviderIds.join(","),
      source: mergedSources.join(" | "),
      summary: preferred.summary.length >= existing.summary.length ? preferred.summary : existing.summary,
      detectedAt: new Date(
        Math.max(Date.parse(existing.detectedAt) || 0, Date.parse(hotspot.detectedAt) || 0, Date.now())
      ).toISOString(),
      reasons: mergedReasons,
      priorityScore: mergedPriorityScore,
      relevanceScore: Math.max(existing.relevanceScore, hotspot.relevanceScore),
      industryScore: Math.max(existing.industryScore, hotspot.industryScore),
      velocityScore: Math.max(existing.velocityScore, hotspot.velocityScore),
      riskScore: mergedRiskScore,
      recommendedAction: mergedRecommendedAction
    });
  }

  return Array.from(merged.values()).sort((left, right) => right.priorityScore - left.priorityScore);
}

export async function syncHotspots(): Promise<HotspotSyncResult> {
  const brand = await getBrandStrategyPack();
  const providerResults = await Promise.all(
    getProviderConfigs().map(async (provider) => {
      try {
        const items = await fetchProviderItems(provider, brand);
        const pageObservation = await observeProviderPage(provider, items);

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
          hotspots,
          pageObservation
        };
      } catch (error) {
        return {
          provider,
          hotspots: [],
          pageObservation: {
            checked: false,
            reachable: false,
            matchedTitles: 0,
            gated: false,
            note: `抓取失败: ${error instanceof Error ? error.message : "未知错误"}`
          } satisfies ProviderPageObservation
        };
      }
    })
  );

  const deduped = mergeHotspotsByTitle(providerResults.flatMap((result) => result.hotspots));

  const storage = await persistHotspots(brand, deduped);
  const generatedPacks = await autoGeneratePacks(brand, deduped);

  return {
    providers: providerResults.map((result) => ({
      id: result.provider.id,
      label: result.provider.label,
      fetched: result.hotspots.length,
      persisted: storage.persisted ? result.hotspots.length : 0,
      pageChecked: result.pageObservation?.checked,
      pageReachable: result.pageObservation?.reachable,
      pageMatchedTitles: result.pageObservation?.matchedTitles,
      pageGated: result.pageObservation?.gated,
      pageNote: result.pageObservation?.note
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
