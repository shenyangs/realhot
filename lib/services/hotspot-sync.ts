import { createDecipheriv, createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { updateLocalDataStore } from "@/lib/data/local-store";
import { getBrandStrategyPack } from "@/lib/data";
import {
  BrandStrategyPack,
  HotspotFetchStatus,
  HotspotKind,
  HotspotProviderReport,
  HotspotProviderRole,
  HotspotSignal,
  HotspotSourceType,
  HotspotSyncSnapshot
} from "@/lib/domain/types";
import { getChinaHotspotRules } from "@/lib/services/china-market";
import { GeneratedPackResult, generateContentPackForEntities } from "@/lib/services/content-pack-generator";
import { fetchSourceMaterial } from "@/lib/services/source-material-extractor";
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

interface TextRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  insecureTls?: boolean;
  maxRedirects?: number;
}

interface TextResponse {
  ok: boolean;
  status: number;
  text: string;
}

export interface HotspotSyncResult {
  providers: HotspotProviderReport[];
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

interface TrendRadarProviderConfig {
  id: string;
  label: string;
  kind: HotspotKind;
  source: string;
  market: "china" | "global";
  pageUrl?: string;
  trendRadarSourceId: string;
}

interface MarketingCalendarEventDefinition {
  id: string;
  title: string;
  description: string;
  searchTerms: string[];
  month: number;
  day: number;
  market?: "china" | "global";
  windowBeforeDays?: number;
  windowAfterDays?: number;
  years?: number[];
}

interface SuperIpProviderConfig {
  id: string;
  label: string;
  source: string;
  eventIds: string[];
  market?: "china" | "global";
}

const marketingCalendarProviderId = "ai-calendar-marketing";
const marketingCalendarSourceLabel = "AI Marketing Calendar";
const superIpProviderConfigs: SuperIpProviderConfig[] = [
  {
    id: "ai-super-ip-sports",
    label: "AI Search / 超级IP / 全民赛事型",
    source: "AI Super IP Sports",
    eventIds: ["world-cup", "nba-finals"],
    market: "global"
  },
  {
    id: "ai-super-ip-entertainment",
    label: "AI Search / 超级IP / 文娱盛典型",
    source: "AI Super IP Entertainment",
    eventIds: ["oscars", "spring-festival-gala"],
    market: "global"
  },
  {
    id: "ai-super-ip-tech-launch",
    label: "AI Search / 超级IP / 科技发布型",
    source: "AI Super IP Tech Launch",
    eventIds: ["apple-wwdc", "apple-fall-event"],
    market: "global"
  },
  {
    id: "ai-super-ip-platform-ecosystem",
    label: "AI Search / 超级IP / 平台生态型",
    source: "AI Super IP Platform Ecosystem",
    eventIds: ["wechat-open-class", "xiaohongshu-will"],
    market: "china"
  },
  {
    id: "ai-super-ip-national-culture",
    label: "AI Search / 超级IP / 国民文化型",
    source: "AI Super IP National Culture",
    eventIds: ["spring-festival-gala", "gaokao-season"],
    market: "china"
  }
];

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
    id: "rss-huxiu",
    label: "虎嗅 / China Tech",
    kind: "industry",
    source: "虎嗅 RSS",
    market: "china",
    buildUrl: () => "https://www.huxiu.com/rss/0.xml"
  },
  {
    id: "rss-ifanr",
    label: "爱范儿 / China Tech",
    kind: "industry",
    source: "爱范儿 RSS",
    market: "china",
    buildUrl: () => "https://www.ifanr.com/feed"
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
    buildUrl: (brand: BrandStrategyPack) => {
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
      buildGoogleNewsUrl('("Google Gemini" OR "Google DeepMind" OR "TechCrunch AI" OR "The Verge AI" OR "AI Agent")', {
        locale: "en-US",
        region: "US",
        edition: "US:en"
      })
  },
  {
    id: marketingCalendarProviderId,
    label: "AI Search / 营销日历",
    kind: "mass",
    source: marketingCalendarSourceLabel,
    market: "china",
    fetchItems: (brand: BrandStrategyPack) => Promise.resolve(buildMarketingCalendarItems(brand))
  },
  ...superIpProviderConfigs.map((config) => ({
    id: config.id,
    label: config.label,
    kind: "mass" as const,
    source: config.source,
    market: config.market ?? "global",
    fetchItems: (brand: BrandStrategyPack) => Promise.resolve(buildSuperIpItems(brand, config.eventIds))
  }))
];

const marketingCalendarDefinitions: MarketingCalendarEventDefinition[] = [
  {
    id: "spring-season",
    title: "春季焕新与出游季",
    description: "适合围绕春日消费、出行效率、上新焕新和组织活力做内容策划。",
    searchTerms: ["春季营销", "春日活动", "品牌案例"],
    month: 4,
    day: 1,
    windowBeforeDays: 21,
    windowAfterDays: 21
  },
  {
    id: "qingming",
    title: "清明假期窗口",
    description: "适合围绕短途出游、返乡情绪、节假日服务体验和品牌陪伴感策划内容。",
    searchTerms: ["清明 假期", "品牌营销", "传播案例"],
    month: 4,
    day: 4,
    windowBeforeDays: 14,
    windowAfterDays: 7
  },
  {
    id: "may-day",
    title: "五一黄金周",
    description: "适合围绕出行、消费、门店活动、劳动价值和生活方式切入。",
    searchTerms: ["五一 黄金周", "品牌营销", "活动案例"],
    month: 5,
    day: 1,
    windowBeforeDays: 28,
    windowAfterDays: 10
  },
  {
    id: "618",
    title: "618 大促窗口",
    description: "适合围绕消费决策、种草转化、平台玩法和品牌心智抢占做传播策划。",
    searchTerms: ["618", "品牌营销", "平台玩法"],
    month: 6,
    day: 18,
    windowBeforeDays: 40,
    windowAfterDays: 10
  },
  {
    id: "summer-season",
    title: "暑期消费季",
    description: "适合围绕旅行、亲子、线上娱乐、清凉需求和暑期活动做场景策划。",
    searchTerms: ["暑期 营销", "品牌案例", "场景传播"],
    month: 7,
    day: 10,
    windowBeforeDays: 35,
    windowAfterDays: 21
  },
  {
    id: "back-to-school",
    title: "开学季窗口",
    description: "适合围绕返校、效率工具、学习成长和新学期目标做品牌表达。",
    searchTerms: ["开学季", "品牌营销", "传播案例"],
    month: 9,
    day: 1,
    windowBeforeDays: 28,
    windowAfterDays: 14
  },
  {
    id: "national-holiday",
    title: "国庆黄金周",
    description: "适合围绕出游、人流消费、城市活动、节庆情绪和品牌陪伴做内容策划。",
    searchTerms: ["国庆 黄金周", "品牌营销", "案例"],
    month: 10,
    day: 1,
    windowBeforeDays: 30,
    windowAfterDays: 10
  },
  {
    id: "double-11",
    title: "双11 大促窗口",
    description: "适合围绕抢占心智、平台玩法、价格沟通和品牌复购做传播策划。",
    searchTerms: ["双11", "品牌营销", "平台活动"],
    month: 11,
    day: 11,
    windowBeforeDays: 45,
    windowAfterDays: 10
  },
  {
    id: "year-end",
    title: "年终总结与跨年节点",
    description: "适合围绕年度复盘、趋势判断、用户陪伴和来年计划做观点内容。",
    searchTerms: ["年终 总结", "跨年 营销", "品牌案例"],
    month: 12,
    day: 20,
    windowBeforeDays: 28,
    windowAfterDays: 14
  }
];

const superIpDefinitions: MarketingCalendarEventDefinition[] = [
  {
    id: "oscars",
    title: "奥斯卡颁奖季",
    description: "适合围绕审美、作品表达、年度话题和品牌态度做借势传播。",
    searchTerms: ["奥斯卡", "品牌营销", "借势案例"],
    month: 3,
    day: 10,
    market: "global",
    windowBeforeDays: 28,
    windowAfterDays: 21
  },
  {
    id: "nba-finals",
    title: "NBA 总决赛窗口",
    description: "适合围绕竞技情绪、冠军叙事、团队协作和高光时刻做品牌借势。",
    searchTerms: ["NBA 总决赛", "品牌营销", "借势案例"],
    month: 6,
    day: 5,
    market: "global",
    windowBeforeDays: 35,
    windowAfterDays: 14
  },
  {
    id: "apple-wwdc",
    title: "苹果 WWDC 窗口",
    description: "适合围绕技术发布、生态变化、开发者叙事和创新表达做传播规划。",
    searchTerms: ["Apple WWDC", "苹果 发布会", "品牌营销"],
    month: 6,
    day: 10,
    market: "global",
    windowBeforeDays: 45,
    windowAfterDays: 10
  },
  {
    id: "world-cup",
    title: "世界杯窗口",
    description: "适合围绕全民情绪、国家队话题、熬夜看球、竞猜互动和超级流量节点借势。",
    searchTerms: ["世界杯", "品牌营销", "借势案例"],
    month: 6,
    day: 15,
    market: "global",
    windowBeforeDays: 90,
    windowAfterDays: 35,
    years: [2026, 2030, 2034]
  },
  {
    id: "spring-festival-gala",
    title: "春晚窗口",
    description: "适合围绕国民记忆、家庭场景、节庆情绪和全民共识做品牌借势。",
    searchTerms: ["春晚", "品牌营销", "借势案例"],
    month: 2,
    day: 1,
    market: "china",
    windowBeforeDays: 30,
    windowAfterDays: 10
  },
  {
    id: "apple-fall-event",
    title: "苹果秋季发布会窗口",
    description: "适合围绕新品发布、消费关注度、设计语言和科技美学做借势传播。",
    searchTerms: ["苹果 秋季发布会", "新品 发布", "品牌营销"],
    month: 9,
    day: 10,
    market: "global",
    windowBeforeDays: 45,
    windowAfterDays: 14
  },
  {
    id: "wechat-open-class",
    title: "微信公开课窗口",
    description: "适合围绕平台规则、生态方向、创作者机会和商业化变化做观点传播。",
    searchTerms: ["微信公开课", "平台生态", "品牌营销"],
    month: 1,
    day: 10,
    market: "china",
    windowBeforeDays: 30,
    windowAfterDays: 14
  },
  {
    id: "xiaohongshu-will",
    title: "小红书商业生态大会窗口",
    description: "适合围绕种草机制、平台内容方法、品牌经营和生态趋势做借势表达。",
    searchTerms: ["小红书 商业大会", "平台生态", "品牌营销"],
    month: 9,
    day: 20,
    market: "china",
    windowBeforeDays: 30,
    windowAfterDays: 14
  },
  {
    id: "gaokao-season",
    title: "高考季窗口",
    description: "适合围绕代际情绪、成长叙事、城市公共话题和国民关注度做品牌表达。",
    searchTerms: ["高考", "品牌营销", "传播案例"],
    month: 6,
    day: 7,
    market: "china",
    windowBeforeDays: 21,
    windowAfterDays: 14
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
    id: "weibo-realtime-multi",
    label: "Weibo / Realtime Hot",
    kind: "mass",
    source: "Weibo Realtime Hot",
    market: "china",
    pageUrl: "https://s.weibo.com/top/summary?cate=realtimehot",
    url: "https://s.weibo.com/top/summary?cate=realtimehot",
    isEnabled: () => (process.env.ENABLE_WEIBO_REALTIME_MULTI_SEARCH ?? "true").toLowerCase() !== "false",
    mapItems: () => []
  },
  {
    id: "zhihu-hot-list",
    label: "Zhihu / Hot List",
    kind: "mass",
    source: "Zhihu Hot API",
    market: "china",
    pageUrl: "https://www.zhihu.com/hot",
    url: "https://api.zhihu.com/topstory/hot-list?limit=50&reverse_order=0",
    isEnabled: () => (process.env.ENABLE_ZHIHU_HOT_SEARCH ?? "true").toLowerCase() !== "false",
    mapItems: mapZhihuHotItems
  },
  {
    id: "bilibili-popular",
    label: "Bilibili / Popular",
    kind: "mass",
    source: "Bilibili Popular API",
    market: "china",
    pageUrl: "https://www.bilibili.com/v/popular/rank/all",
    url: "https://api.bilibili.com/x/web-interface/popular?pn=1&ps=50",
    isEnabled: () => (process.env.ENABLE_BILIBILI_POPULAR_HOT ?? "true").toLowerCase() !== "false",
    mapItems: mapBilibiliPopularItems
  },
  {
    id: "toutiao-hot-board",
    label: "Toutiao / Hot Board",
    kind: "mass",
    source: "Toutiao Hot Board",
    market: "china",
    pageUrl: "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
    url: "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
    isEnabled: () => (process.env.ENABLE_TOUTIAO_HOT_BOARD ?? "true").toLowerCase() !== "false",
    mapItems: mapToutiaoHotBoardItems
  }
];

const trendRadarProviderConfigs: TrendRadarProviderConfig[] = [
  {
    id: "trendradar-weibo",
    label: "微博热搜",
    kind: "mass",
    source: "Weibo Realtime Hot",
    market: "china",
    pageUrl: "https://s.weibo.com/top/summary?cate=realtimehot",
    trendRadarSourceId: "weibo"
  },
  {
    id: "trendradar-zhihu",
    label: "知乎热榜",
    kind: "mass",
    source: "Zhihu Hot API",
    market: "china",
    pageUrl: "https://www.zhihu.com/hot",
    trendRadarSourceId: "zhihu"
  },
  {
    id: "trendradar-baidu",
    label: "百度热搜",
    kind: "mass",
    source: "AA1 Baidu Hot",
    market: "china",
    pageUrl: "https://top.baidu.com/board?tab=realtime",
    trendRadarSourceId: "baidu"
  },
  {
    id: "trendradar-toutiao",
    label: "今日头条",
    kind: "mass",
    source: "Toutiao Hot Board",
    market: "china",
    pageUrl: "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
    trendRadarSourceId: "toutiao"
  },
  {
    id: "trendradar-douyin",
    label: "抖音热点",
    kind: "mass",
    source: "抖音",
    market: "china",
    pageUrl: "https://www.douyin.com/hot",
    trendRadarSourceId: "douyin"
  },
  {
    id: "trendradar-bilibili",
    label: "B站热搜",
    kind: "mass",
    source: "Bilibili Popular API",
    market: "china",
    pageUrl: "https://www.bilibili.com/v/popular/rank/all",
    trendRadarSourceId: "bilibili-hot-search"
  },
  {
    id: "trendradar-tieba",
    label: "百度贴吧",
    kind: "mass",
    source: "贴吧",
    market: "china",
    pageUrl: "https://tieba.baidu.com/hottopic/browse/topicList",
    trendRadarSourceId: "tieba"
  },
  {
    id: "trendradar-wallstreetcn",
    label: "华尔街见闻",
    kind: "industry",
    source: "华尔街见闻",
    market: "china",
    pageUrl: "https://wallstreetcn.com/hot-article",
    trendRadarSourceId: "wallstreetcn-hot"
  },
  {
    id: "trendradar-cls",
    label: "财联社",
    kind: "industry",
    source: "财联社",
    market: "china",
    pageUrl: "https://www.cls.cn",
    trendRadarSourceId: "cls-hot"
  },
  {
    id: "trendradar-thepaper",
    label: "澎湃新闻",
    kind: "industry",
    source: "澎湃新闻",
    market: "china",
    pageUrl: "https://www.thepaper.cn",
    trendRadarSourceId: "thepaper"
  },
  {
    id: "trendradar-ifeng",
    label: "凤凰网",
    kind: "industry",
    source: "凤凰网",
    market: "china",
    pageUrl: "https://news.ifeng.com",
    trendRadarSourceId: "ifeng"
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

function isTrendRadarSourcesEnabled(): boolean {
  return (process.env.ENABLE_TRENDRADAR_SOURCES ?? "false").toLowerCase() === "true";
}

function getTrendRadarBaseUrl(): string {
  return process.env.TRENDRADAR_BASE_URL ?? "https://newsnow.busiyi.world/api/s";
}

function isTrendRadarFallbackOnly(): boolean {
  return (process.env.TRENDRADAR_FALLBACK_ONLY ?? "true").toLowerCase() !== "false";
}

function getTrendRadarSourceLimit(): number {
  const maxItems = Number.parseInt(process.env.TRENDRADAR_SOURCE_MAX_ITEMS ?? "25", 10);
  return Number.isNaN(maxItems) ? 25 : maxItems;
}

function isBaseProviderEnabled(providerId: string): boolean {
  if (providerId === "rss-cnbeta") {
    return (process.env.ENABLE_RSS_CNBETA ?? "false").toLowerCase() === "true";
  }

  return true;
}

function isInsecureTlsAllowed(): boolean {
  return (process.env.HOTSPOT_ALLOW_INSECURE_TLS ?? "false").toLowerCase() === "true";
}

function formatRequestError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "未知错误";
  }

  const cause = error.cause;

  if (cause && typeof cause === "object") {
    const code = "code" in cause ? cause.code : null;
    const message = "message" in cause ? cause.message : null;
    const details = [code, message].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    if (details.length > 0) {
      return `${error.message} (${details.join(": ")})`;
    }
  }

  return error.message;
}

function isTlsCertificateError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = error.cause;
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : null;

  return (
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT"
  );
}

async function requestTextViaNode(url: string, options: TextRequestOptions = {}): Promise<TextResponse> {
  const { method = "GET", headers = {}, body, timeoutMs = 20_000, insecureTls = false, maxRedirects = 3 } = options;

  return new Promise((resolve, reject) => {
    const run = (targetUrl: string, redirectsLeft: number) => {
      const parsedUrl = new URL(targetUrl);
      const requestImpl = parsedUrl.protocol === "https:" ? httpsRequest : httpRequest;
      const request = requestImpl(
        parsedUrl,
        {
          method,
          headers,
          rejectUnauthorized: insecureTls ? false : undefined
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;

          if (location && status >= 300 && status < 400 && redirectsLeft > 0) {
            response.resume();
            run(new URL(location, targetUrl).toString(), redirectsLeft - 1);
            return;
          }

          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          response.on("end", () => {
            resolve({
              ok: status >= 200 && status < 300,
              status,
              text: Buffer.concat(chunks).toString("utf8")
            });
          });
        }
      );

      request.setTimeout(timeoutMs, () => {
        request.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
      });
      request.on("error", reject);

      if (body) {
        request.write(body);
      }

      request.end();
    };

    run(url, maxRedirects);
  });
}

async function fetchTextResponse(url: string, options: TextRequestOptions = {}): Promise<TextResponse> {
  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body
    });

    return {
      ok: response.ok,
      status: response.status,
      text: await response.text()
    };
  } catch (error) {
    if (isInsecureTlsAllowed() && isTlsCertificateError(error)) {
      return requestTextViaNode(url, {
        ...options,
        insecureTls: true
      });
    }

    throw new Error(formatRequestError(error));
  }
}

function getProviderConfigs(): HotspotProvider[] {
  const providers: HotspotProvider[] = [...baseProviderConfigs.filter((provider) => isBaseProviderEnabled(provider.id))];

  if (isTrendRadarSourcesEnabled()) {
    providers.push(
      ...trendRadarProviderConfigs.map(
        (config): HotspotProvider => ({
          id: config.id,
          label: config.label,
          kind: config.kind,
          source: config.source,
          market: config.market,
          pageUrl: config.pageUrl,
          fetchItems: () => fetchTrendRadarItems(config)
        })
      )
    );
  }

  if (isAuxiliaryJsonSourcesEnabled()) {
    providers.push(
      ...auxiliaryJsonProviderConfigs
        .filter((config) => config.isEnabled())
        .map((config): HotspotProvider => {
          const fetchItems =
            config.id === "weibo-realtime-multi"
              ? () => fetchWeiboRealtimeMultiChannelItems()
              : () => fetchJsonProviderItems(config);

          return {
            id: config.id,
            label: config.label,
            kind: config.kind,
            source: config.source,
            market: config.market,
            pageUrl: config.pageUrl,
            fetchItems
          };
        })
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
  const normalized = decodeEntities(value.replace(/<!\[CDATA\[|\]\]>/g, ""));
  const stripped = normalized.replace(/<[^>]+>/g, " ");

  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
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

function createDateAtNoon(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0));
}

function diffDaysFromReference(reference: Date, target: Date): number {
  return Math.round((startOfUtcDay(target).getTime() - startOfUtcDay(reference).getTime()) / 86_400_000);
}

function formatMonthDayLabel(date: Date): string {
  return `${date.getUTCMonth() + 1} 月 ${date.getUTCDate()} 日`;
}

function buildMarketingCalendarSearchUrl(title: string, searchTerms: string[], market: "china" | "global") {
  const query = encodeURIComponent([...searchTerms, title, "品牌营销", "传播案例"].join(" "));

  if (market === "global") {
    return `https://news.google.com/search?q=${query}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  }

  return `https://www.baidu.com/s?wd=${query}`;
}

function buildMarketingCalendarItems(brand: BrandStrategyPack): FeedItem[] {
  const now = new Date();

  return marketingCalendarDefinitions
    .flatMap((definition) => {
      const candidateYears = [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1];
      const datedCandidates = candidateYears
        .filter((year) => !definition.years || definition.years.includes(year))
        .map((year) => createDateAtNoon(year, definition.month, definition.day))
        .map((date) => ({
          date,
          diffDays: diffDaysFromReference(now, date)
        }))
        .filter(({ diffDays }) => {
          const beforeWindow = definition.windowBeforeDays ?? 30;
          const afterWindow = definition.windowAfterDays ?? 14;
          return diffDays >= -afterWindow && diffDays <= beforeWindow;
        })
        .sort((left, right) => Math.abs(left.diffDays) - Math.abs(right.diffDays));

      const candidate = datedCandidates[0];

      if (!candidate) {
        return [];
      }

      const timingLabel =
        candidate.diffDays > 0
          ? `${candidate.diffDays} 天后进入节点`
          : candidate.diffDays < 0
            ? `节点已过 ${Math.abs(candidate.diffDays)} 天，仍在讨论窗口`
            : "节点就在今天";
      const market = definition.market ?? "china";

      return [
        {
          title: definition.title,
          summary: [
            definition.description,
            `节点时间: ${formatMonthDayLabel(candidate.date)}`,
            `窗口判断: ${timingLabel}`,
            "策划价值: 这是品牌传播的公共议题源，适合作为全品牌可复用的最大公约数",
            "AI 搜索建议: 先检索用户情绪、平台热度、品牌借势案例和内容切入角度",
            `品牌适配: ${brand.name} 可以围绕行业趋势、用户场景和品牌态度提前策划`
          ].join(" | "),
          url: buildMarketingCalendarSearchUrl(definition.title, definition.searchTerms, market),
          publishedAt: candidate.date.toISOString()
        } satisfies FeedItem
      ];
    })
    .sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt))
    .slice(0, 12);
}

function buildSuperIpItems(brand: BrandStrategyPack, eventIds: string[]): FeedItem[] {
  const now = new Date();

  return superIpDefinitions
    .filter((definition) => eventIds.includes(definition.id))
    .flatMap((definition) => {
      const candidateYears = [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1];
      const datedCandidates = candidateYears
        .filter((year) => !definition.years || definition.years.includes(year))
        .map((year) => createDateAtNoon(year, definition.month, definition.day))
        .map((date) => ({
          date,
          diffDays: diffDaysFromReference(now, date)
        }))
        .filter(({ diffDays }) => {
          const beforeWindow = definition.windowBeforeDays ?? 45;
          const afterWindow = definition.windowAfterDays ?? 21;
          return diffDays >= -afterWindow && diffDays <= beforeWindow;
        })
        .sort((left, right) => Math.abs(left.diffDays) - Math.abs(right.diffDays));

      const candidate = datedCandidates[0];

      if (!candidate) {
        return [];
      }

      const timingLabel =
        candidate.diffDays > 0
          ? `${candidate.diffDays} 天后进入爆发窗口`
          : candidate.diffDays < 0
            ? `超级IP已过 ${Math.abs(candidate.diffDays)} 天，仍在余热窗口`
            : "超级IP就在今天";

      return [
        {
          title: definition.title,
          summary: [
            definition.description,
            `节点时间: ${formatMonthDayLabel(candidate.date)}`,
            `窗口判断: ${timingLabel}`,
            "策划价值: 这是全民共识度最高的传播议题，适合作为品牌借势传播的最大公约数",
            "AI 搜索建议: 重点补齐情绪走向、平台话题、用户讨论点和品牌借势案例",
            `品牌适配: ${brand.name} 可以提前准备观点、海报、短视频和互动选题`
          ].join(" | "),
          url: buildMarketingCalendarSearchUrl(definition.title, definition.searchTerms, "global"),
          publishedAt: candidate.date.toISOString()
        } satisfies FeedItem
      ];
    })
    .sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt))
    .slice(0, 8);
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

function normalizeWeiboTagTitle(title: string): string {
  return title.replace(/^#|#$/g, "").trim();
}

function buildWeiboSearchUrl(keyword: string): string {
  return `https://s.weibo.com/weibo?q=${encodeURIComponent(`#${keyword}#`)}`;
}

function parseWeiboSummaryItems(html: string): FeedItem[] {
  const rows = [...html.matchAll(/<td class="td-02">([\s\S]*?)<\/td>[\s\S]*?<td class="td-03">([\s\S]*?)<\/td>/g)];

  return rows
    .map((match) => {
      const infoBlock = match[1];
      const heatBlock = match[2];
      const anchorMatch = infoBlock.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      const title = normalizeWeiboTagTitle(stripHtml(anchorMatch?.[2] ?? ""));
      const relativeUrl = anchorMatch?.[1]?.trim();
      const heat = stripHtml(heatBlock).replace(/[^\d万亿.+]/g, "").trim();

      if (!title) {
        return null;
      }

      return {
        title,
        summary: [
          "平台: 微博热搜",
          heat ? `热度: ${heat}` : null,
          "采集方式: 实时榜页面"
        ]
          .filter((item): item is string => Boolean(item))
          .join(" | "),
        url: relativeUrl ? new URL(relativeUrl, "https://s.weibo.com").toString() : buildWeiboSearchUrl(title),
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

function mapBilibiliPopularItems(payload: unknown): FeedItem[] {
  const record = readRecordPayload(payload);
  const dataRecord = readRecordPayload(record?.data);
  const items = readArrayPayload(dataRecord);

  return items
    .map((item) => {
      const title = trimText(item.title);
      const bvid = trimText(item.bvid);
      const redirectUrl = trimText(item.redirect_url);
      const owner = readRecordPayload(item.owner);
      const stat = readRecordPayload(item.stat);
      const url = redirectUrl ?? (bvid ? `https://www.bilibili.com/video/${bvid}` : null);

      if (!title || !url) {
        return null;
      }

      const summaryParts = [
        trimText(item.desc),
        stringifyMetricLabel("平台", "B站热门"),
        stringifyMetricLabel("UP主", owner?.name),
        stringifyMetricLabel("播放", stat?.view ?? stat?.vv),
        stringifyMetricLabel("点赞", stat?.like),
        stringifyMetricLabel("历史最高", stat?.his_rank)
      ].filter((value): value is string => Boolean(value));

      return {
        title,
        summary: summaryParts.join(" | ") || "B站热门视频",
        url,
        publishedAt: normalizeTimestamp(
          (item.pubdate as number | string | undefined) ?? (item.ctime as number | string | undefined)
        )
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => item !== null);
}

function mapToutiaoHotBoardItems(payload: unknown): FeedItem[] {
  const record = readRecordPayload(payload);
  const items = readArrayPayload(record?.data);

  return items
    .map((item) => {
      const title = trimText(item.Title) ?? trimText(item.QueryWord);
      const url = trimText(item.Url);
      const interestCategories = Array.isArray(item.InterestCategory)
        ? item.InterestCategory.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];

      if (!title || !url) {
        return null;
      }

      const summaryParts = [
        trimText(item.LabelDesc),
        trimText(item.Label),
        stringifyMetricLabel("平台", "今日头条热榜"),
        stringifyMetricLabel("热度", item.HotValue),
        stringifyMetricLabel("分类", interestCategories.join("/")),
        stringifyMetricLabel("事件类型", item.ClusterType)
      ].filter((value): value is string => Boolean(value));

      return {
        title,
        summary: summaryParts.join(" | ") || "今日头条热榜事件",
        url,
        publishedAt: new Date().toISOString()
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => item !== null);
}

function mapTrendRadarItems(payload: unknown, config: TrendRadarProviderConfig): FeedItem[] {
  const record = readRecordPayload(payload);
  const status = trimText(record?.status);
  const items = readArrayPayload(record?.items);

  if (status && status !== "success" && status !== "cache") {
    return [];
  }

  return items
    .map((item, index) => {
      const title = trimText(item.title);
      const url = trimText(item.url) ?? trimText(item.mobileUrl) ?? trimText(item.mobile_url);

      if (!title || !url) {
        return null;
      }

      const summaryParts = [
        trimText(item.desc) ??
          trimText(item.digest) ??
          trimText(item.content) ??
          trimText(item.coverText) ??
          trimText(item.excerpt),
        stringifyMetricLabel("平台", config.label),
        stringifyMetricLabel("排名", item.rank ?? item.index ?? index + 1),
        stringifyMetricLabel("采集方式", status === "cache" ? "备用聚合缓存" : "备用聚合实时抓取")
      ].filter((value): value is string => Boolean(value));

      return {
        title,
        summary: summaryParts.join(" | ") || `${config.label} 聚合热点`,
        url,
        publishedAt: normalizeTimestamp(
          (item.publishTime as number | string | undefined) ??
            (item.timestamp as number | string | undefined) ??
            (item.createdAt as number | string | undefined) ??
            (item.created_at as number | string | undefined)
        )
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => item !== null);
}

async function fetchTrendRadarItems(config: TrendRadarProviderConfig): Promise<FeedItem[]> {
  const url = new URL(getTrendRadarBaseUrl());
  url.searchParams.set("id", config.trendRadarSourceId);
  url.searchParams.set("latest", "");

  const response = await fetchTextResponse(url.toString(), {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "BrandHotspotStudio/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`${config.id} responded with ${response.status}`);
  }

  if (/attention required|cloudflare|cf-browser-verification/i.test(response.text)) {
    throw new Error(`${config.id} returned a challenge page`);
  }

  const payload = parseLooseJson(response.text);

  if (payload === null) {
    throw new Error(`${config.id} returned non-JSON content`);
  }

  return mapTrendRadarItems(payload, config).slice(0, getTrendRadarSourceLimit());
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

  const response = await fetchTextResponse("https://www.entobit.cn/trending/hsa/getHotSearchKeywords.do", {
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
    body: body.toString()
  });

  if (!response.ok) {
    throw new Error(`Entobit ${config.rankType} responded with ${response.status}`);
  }

  const text = response.text.trim();

  if (text) {
    const payload = parseLooseJson(text);

    if (payload !== null) {
      apiItems = readArrayPayload(payload)
        .map((item) => mapEntobitItem(item, config))
        .filter((item): item is FeedItem => item !== null)
        .slice(0, limit);
    }
  }

  return apiItems;
}

async function fetchJsonProviderItems(config: JsonHotspotProviderConfig): Promise<FeedItem[]> {
  const response = await fetchTextResponse(config.url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "BrandHotspotStudio/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`${config.id} responded with ${response.status}`);
  }

  const payload = parseLooseJson(response.text);

  if (payload === null) {
    return [];
  }

  const items = config.mapItems(payload);
  const maxItems = Number.parseInt(process.env.AUXILIARY_HOT_SOURCE_MAX_ITEMS ?? "10", 10);
  const limit = Number.isNaN(maxItems) ? 10 : maxItems;

  return items.slice(0, limit);
}

async function fetchWeiboSummaryItems(): Promise<FeedItem[]> {
  const response = await fetchTextResponse("https://s.weibo.com/top/summary?cate=realtimehot", {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`weibo-summary responded with ${response.status}`);
  }

  if (/Sina Visitor System/i.test(response.text)) {
    return [];
  }

  const items = parseWeiboSummaryItems(response.text);
  const maxItems = Number.parseInt(process.env.WEIBO_HOT_MAX_ITEMS ?? "60", 10);
  const limit = Number.isNaN(maxItems) ? 60 : maxItems;

  return items.slice(0, limit);
}

async function fetchWeiboPublicItems(): Promise<FeedItem[]> {
  const response = await fetchTextResponse("https://weibo.cn/pub/", {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`weibo-public responded with ${response.status}`);
  }

  const matches = [...response.text.matchAll(/<div class="c"><a href="([^"]+)">([\s\S]*?)<\/a><\/div>/g)];
  const maxItems = Number.parseInt(process.env.AUXILIARY_HOT_SOURCE_MAX_ITEMS ?? "10", 10);
  const limit = Number.isNaN(maxItems) ? 10 : maxItems;

  return matches
    .map((match) => {
      const url = match[1]?.trim();
      const title = stripHtml(match[2] ?? "");

      if (!url || !title) {
        return null;
      }

      return {
        title,
        summary: "微博公开热词页",
        url,
        publishedAt: new Date().toISOString()
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => item !== null)
    .slice(0, limit);
}

function decryptZhaoyizheResponse(cipherText: string): string {
  const decipher = createDecipheriv(
    "aes-256-ecb",
    Buffer.from("cce1d5a8d58249048623eb26b8b0ea53", "utf8"),
    null
  );
  decipher.setAutoPadding(true);

  return `${decipher.update(cipherText.trim(), "base64", "utf8")}${decipher.final("utf8")}`;
}

async function fetchZhaoyizheWeiboItems(): Promise<FeedItem[]> {
  const today = new Date().toISOString().slice(0, 10);
  const url = new URL("https://hotengineapi.zhaoyizhe.com/hotEngineApi/data/list");
  url.searchParams.set("startDate", today);
  url.searchParams.set("endDate", today);
  url.searchParams.set("type", "");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("pageSize", process.env.WEIBO_HOT_MAX_ITEMS ?? "60");
  url.searchParams.set("keyword", "");
  url.searchParams.set("radioType", "1");

  const response = await fetchTextResponse(url.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`zhaoyizhe-weibo responded with ${response.status}`);
  }

  const decrypted = decryptZhaoyizheResponse(response.text);
  const payload = parseLooseJson(decrypted);
  const record = readRecordPayload(payload);

  if (!record || record.code !== 1) {
    return [];
  }

  const items = readArrayPayload(record.data);

  return items
    .map((item) => {
      const title = normalizeWeiboTagTitle(
        trimText(item.title) ?? trimText(item.topic) ?? trimText(item.word) ?? ""
      );

      if (!title) {
        return null;
      }

      return {
        title,
        summary: [
          "平台: 微博热搜",
          stringifyMetricLabel("热度", item.hot ?? item.num ?? item.hotValue),
          "采集方式: 热搜引擎备用源"
        ]
          .filter((part): part is string => Boolean(part))
          .join(" | "),
        url: buildWeiboSearchUrl(title),
        publishedAt: new Date().toISOString()
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => item !== null);
}

function dedupeFeedItemsByTitle(items: FeedItem[]): FeedItem[] {
  const merged = new Map<string, FeedItem>();

  for (const item of items) {
    const key = normalizeHotspotTitle(item.title);

    if (!key) {
      continue;
    }

    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, item);
      continue;
    }

    const summary = Array.from(new Set([existing.summary, item.summary].filter(Boolean))).join(" | ");

    merged.set(key, {
      ...existing,
      summary,
      url: existing.url || item.url,
      publishedAt: existing.publishedAt || item.publishedAt
    });
  }

  return Array.from(merged.values());
}

async function fetchWeiboRealtimeMultiChannelItems(): Promise<FeedItem[]> {
  const summaryItems = await fetchWeiboSummaryItems().catch(() => []);

  if (summaryItems.length >= 40) {
    return summaryItems;
  }

  const [publicItems, entobitItems, zhaoyizheItems, aa1Items] = await Promise.all([
    fetchWeiboPublicItems().catch(() => []),
    fetchEntobitItems(entobitRankConfigs.realTimeHotSearchList).catch(() => []),
    fetchZhaoyizheWeiboItems().catch(() => []),
    (async () => {
      const response = await fetchTextResponse("https://zj.v.api.aa1.cn/api/weibo-rs/", {
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": "BrandHotspotStudio/0.1"
        }
      });

      if (!response.ok) {
        return [];
      }

      const payload = parseLooseJson(response.text);
      return payload === null ? [] : mapAa1WeiboItems(payload);
    })().catch(() => [])
  ]);

  const maxItems = Number.parseInt(process.env.WEIBO_HOT_MAX_ITEMS ?? "60", 10);
  const limit = Number.isNaN(maxItems) ? 60 : maxItems;

  return dedupeFeedItemsByTitle([
    ...summaryItems,
    ...publicItems,
    ...entobitItems,
    ...zhaoyizheItems,
    ...aa1Items
  ]).slice(0, limit);
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
    const response = await fetchTextResponse(provider.pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0"
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

    const html = response.text;
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

function splitChineseKeywordHints(value: string): string[] {
  return value
    .split(/[\s/、，,|]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length >= 2);
}

function buildSemanticText(item: FeedItem): string {
  const ignoredPrefixes = [
    "平台:",
    "热度:",
    "排名:",
    "播放:",
    "点赞:",
    "历史最高:",
    "分类:",
    "事件类型:",
    "回答数:",
    "up主:",
    "榜单:",
    "在榜时长:",
    "榜单时间:",
    "当前排名:",
    "今日最高排名:",
    "采集方式:"
  ];
  const cleanedSummary = item.summary
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part && !ignoredPrefixes.some((prefix) => part.toLowerCase().startsWith(prefix)))
    .join(" ");

  return `${item.title} ${cleanedSummary}`.toLowerCase();
}

function countKeywordHits(text: string, keywords: string[]): number {
  return Array.from(new Set(keywords)).filter((keyword) => keyword && text.includes(keyword)).length;
}

function buildBrandKeywordHints(brand: BrandStrategyPack): string[] {
  const baseTerms = [...brand.topics, brand.name];
  const stopwords = new Set([
    "ai",
    "saas",
    "b2b",
    "团队",
    "市场",
    "品牌",
    "内容",
    "传播",
    "自动化",
    "发布",
    "工作台",
    "系统",
    "中国",
    "全球"
  ]);
  const expandedTerms = baseTerms
    .flatMap((term) => [term.trim().toLowerCase(), ...splitChineseKeywordHints(term)])
    .filter((term) => term.length >= 2 && !stopwords.has(term));
  const curatedTerms = [
    "品牌规模化传播",
    "热点快反",
    "b2b 内容系统",
    "ai 生产力",
    "审核工作台",
    "传播自动化",
    "企业服务"
  ];

  return Array.from(new Set([...expandedTerms, ...curatedTerms].filter((term) => term.length >= 2)));
}

function countMassNoiseHits(titleText: string): number {
  const noisyTerms = [
    "演唱会",
    "恋情",
    "离婚",
    "综艺",
    "电视剧",
    "男团",
    "女团",
    "明星",
    "塌房",
    "八卦",
    "虐泉",
    "对战",
    "零封",
    "夺冠",
    "比赛",
    "战胜",
    "半决赛",
    "总决赛",
    "直播间",
    "真漂亮",
    "烟花"
  ];

  return countKeywordHits(titleText, noisyTerms);
}

function getProviderPriorityBoost(provider: HotspotProvider): number {
  if (provider.id === marketingCalendarProviderId) {
    return 10;
  }

  if (provider.id.startsWith("ai-super-ip-")) {
    return 12;
  }

  if (provider.id.startsWith("trendradar-") && isTrendRadarFallbackOnly()) {
    return -5;
  }

  if (
    provider.id === "aa1-baidu-hot" ||
    provider.id === "aa1-weibo-hot" ||
    provider.id === "zhihu-hot-list" ||
    provider.id === "bilibili-popular" ||
    provider.id === "toutiao-hot-board" ||
    provider.id.startsWith("entobit-")
  ) {
    return 6;
  }

  return 0;
}

function getProviderSourceType(provider: HotspotProvider): HotspotSourceType {
  if (provider.id === marketingCalendarProviderId || provider.id.startsWith("ai-super-ip-")) {
    return "ai-search";
  }

  if (provider.id.startsWith("rss-")) {
    return "rss";
  }

  if (provider.id.startsWith("trendradar-") || provider.id.startsWith("entobit-") || provider.id.startsWith("aa1-")) {
    return "aggregator";
  }

  return "direct";
}

function getProviderPriorityRole(provider: HotspotProvider): HotspotProviderRole {
  if (provider.id.startsWith("trendradar-") && isTrendRadarFallbackOnly()) {
    return "fallback";
  }

  return "primary";
}

function buildHotspotSyncSnapshot(input: {
  executedAt: string;
  hotspotCount: number;
  providers: HotspotProviderReport[];
}): HotspotSyncSnapshot {
  return {
    executedAt: input.executedAt,
    providerCount: input.providers.length,
    hotspotCount: input.hotspotCount,
    providers: input.providers
  };
}

function getProviderPriorityAdjustment(
  provider: HotspotProvider,
  scores: Pick<SyncedHotspot, "relevanceScore" | "industryScore" | "velocityScore">
): number {
  let adjustment = getProviderPriorityBoost(provider);

  if (provider.id === marketingCalendarProviderId && scores.velocityScore >= 80) {
    adjustment += 6;
  }

  if (provider.id.startsWith("ai-super-ip-") && scores.velocityScore >= 80) {
    adjustment += 8;
  }

  if (
    (provider.id === "rss-36kr" || provider.id === "rss-ithome") &&
    scores.relevanceScore < 56 &&
    scores.industryScore < 66
  ) {
    adjustment -= 4;
  }

  if (provider.id.startsWith("google-news-") && scores.relevanceScore < 52) {
    adjustment -= 2;
  }

  return adjustment;
}

function scoreAgainstBrand(brand: BrandStrategyPack, item: FeedItem, kind: HotspotKind) {
  const semanticText = buildSemanticText(item);
  const titleText = item.title.toLowerCase();
  const topicMatches = brand.topics.filter((topic) => semanticText.includes(topic.toLowerCase())).length;
  const competitorMatches = brand.competitors.filter((name) => semanticText.includes(name.toLowerCase())).length;
  const brandMention = semanticText.includes(brand.name.toLowerCase()) ? 1 : 0;
  const aiSignals = countKeywordHits(semanticText, [
    "ai",
    "agent",
    "大模型",
    "模型",
    "智能体",
    "automation",
    "saas",
    "b2b",
    "gemini",
    "deepmind",
    "gpt",
    "deepseek",
    "kimi",
    "cursor"
  ]);
  const platformSignals = countKeywordHits(semanticText, [
    "微信",
    "视频号",
    "抖音",
    "小红书",
    "微博",
    "知乎",
    "百度",
    "算法",
    "创作者",
    "分发"
  ]);
  const strategySignals = countKeywordHits(semanticText, buildBrandKeywordHints(brand));
  const massNoiseHits = countMassNoiseHits(titleText);
  const strongIntentSignals = topicMatches + competitorMatches + brandMention + aiSignals + platformSignals;

  const relevanceScore = Math.min(
    96,
    (kind === "mass" ? 32 : 44) +
      topicMatches * 12 +
      competitorMatches * 6 +
      brandMention * 12 +
      aiSignals * 5 +
      platformSignals * 4 +
      strategySignals * 2
  );

  const industryBase = kind === "industry" ? 68 : kind === "mass" ? 44 : 52;
  const industryScore = Math.min(94, industryBase + topicMatches * 6 + aiSignals * 4 + platformSignals * 3);
  const velocityScore = computeVelocityScore(item.publishedAt);

  const riskHits = ["lawsuit", "layoff", "监管", "controversy", "裁员", "违规", "事故", "诉讼"].filter((term) =>
    semanticText.includes(term.toLowerCase())
  ).length;
  const riskScore = Math.min(90, 22 + competitorMatches * 8 + riskHits * 14);
  const weakMassPenalty =
    kind === "mass" && topicMatches === 0 && competitorMatches === 0 && brandMention === 0 && aiSignals === 0 && platformSignals === 0
      ? 12
      : 0;
  const massNoisePenalty =
    kind === "mass" && aiSignals === 0 && platformSignals === 0 && brandMention === 0
      ? Math.min(18, massNoiseHits * 6)
      : 0;
  const priorityScore = Math.round(
    relevanceScore * 0.4 + industryScore * 0.28 + velocityScore * 0.22 - riskScore * 0.1 - weakMassPenalty - massNoisePenalty
  );

  const reasons = [
    topicMatches > 0 || strategySignals > 0
      ? `品牌匹配信号：命中 ${topicMatches + strategySignals} 项（主题/策略）`
      : "品牌匹配信号：当前为弱相关，建议按“行业影响 + 品牌方法”框架复核",
    competitorMatches > 0
      ? `市场参照信号：涉及 ${competitorMatches} 个竞品/对标对象`
      : platformSignals > 0
        ? `分发信号：命中 ${platformSignals} 个平台热度来源，可支持短周期传播`
        : "切入建议：更适合从行业判断与方法论内容切入",
    weakMassPenalty > 0 || massNoisePenalty > 0
      ? "风险与时效：大众热榜热度高，但品牌相关度偏弱，建议谨慎立题"
      : velocityScore >= 80
        ? "风险与时效：时效性高，建议在 24 小时内完成快反判断"
        : "风险与时效：可进入观点储备池，待证据补强后再放大"
  ];

  const recommendedAction =
    priorityScore >= 76 && relevanceScore >= 56 && strongIntentSignals >= 2 && riskScore < 55
      ? "ship-now"
      : priorityScore >= 54 && (relevanceScore >= 34 || strongIntentSignals >= 2)
        ? "watch"
        : "discard";

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

  const response = await fetchTextResponse(provider.buildUrl(brand), {
    headers: {
      "User-Agent": "BrandHotspotStudio/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`${provider.id} responded with ${response.status}`);
  }

  return parseFeedItems(response.text);
}

function isMissingHotspotSourceColumnsError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  const message = "message" in error ? (error as { message?: unknown }).message : undefined;
  const details = "details" in error ? (error as { details?: unknown }).details : undefined;
  const text = [message, details]
    .filter((item): item is string => typeof item === "string")
    .join(" ");

  const mentionsSourceColumn =
    /source_title|source_excerpt|source_fetched_at/.test(text);

  return code === "42703" || (code === "PGRST204" && mentionsSourceColumn) || mentionsSourceColumn;
}

async function persistHotspots(brand: BrandStrategyPack, hotspots: SyncedHotspot[]) {
  const supabase = getSupabaseServerClient();

  if (hotspots.length === 0) {
    return {
      persisted: false,
      usedMockStorage: !supabase
    };
  }

  if (!supabase) {
    await updateLocalDataStore((store) => {
      const nextHotspots = hotspots.map((hotspot) => ({
        id: hotspot.id,
        title: hotspot.title,
        summary: hotspot.summary,
        kind: hotspot.kind,
        source: hotspot.source,
        sourceUrl: hotspot.url,
        sourceTitle: hotspot.sourceTitle,
        sourceExcerpt: hotspot.sourceExcerpt,
        sourceFetchedAt: hotspot.sourceFetchedAt,
        detectedAt: hotspot.detectedAt,
        relevanceScore: hotspot.relevanceScore,
        industryScore: hotspot.industryScore,
        velocityScore: hotspot.velocityScore,
        riskScore: hotspot.riskScore,
        recommendedAction: hotspot.recommendedAction,
        reasons: hotspot.reasons
      }));
      const existing = store.hotspots.filter(
        (item) => !nextHotspots.some((hotspot) => hotspot.id === item.id)
      );

      return {
        ...store,
        hotspots: [...nextHotspots, ...existing]
      };
    });

    return {
      persisted: true,
      usedMockStorage: true
    };
  }

  const hotspotRows = hotspots.map((hotspot) => ({
    id: hotspot.id,
    title: hotspot.title,
    summary: hotspot.summary,
    kind: hotspot.kind,
    source: hotspot.source,
    source_url: hotspot.url,
    source_title: hotspot.sourceTitle ?? null,
    source_excerpt: hotspot.sourceExcerpt ?? null,
    source_fetched_at: hotspot.sourceFetchedAt ?? null,
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
    if (isMissingHotspotSourceColumnsError(hotspotError)) {
      console.warn(
        "[hotspot-sync] hotspots 表尚未完成 source_* 字段迁移，已自动回退为旧字段写入。",
        hotspotError
      );

      const fallbackRows = hotspotRows.map(
        ({ source_title, source_excerpt, source_fetched_at, ...rest }) => rest
      );
      const { error: fallbackHotspotError } = await supabase
        .from("hotspots")
        .upsert(fallbackRows, { onConflict: "id" });

      if (fallbackHotspotError) {
        throw fallbackHotspotError;
      }
    } else {
      throw hotspotError;
    }
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

function resolveSourceEnrichmentMaxItems(): number {
  const parsed = Number.parseInt(process.env.HOTSPOT_SOURCE_ENRICH_MAX_ITEMS ?? "6", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
}

async function enrichHotspotsWithSourceMaterial(hotspots: SyncedHotspot[]): Promise<SyncedHotspot[]> {
  const maxItems = resolveSourceEnrichmentMaxItems();
  const candidates = hotspots
    .filter((hotspot) => hotspot.url && hotspot.recommendedAction !== "discard")
    .slice(0, maxItems);
  const enrichedMap = new Map<string, Awaited<ReturnType<typeof fetchSourceMaterial>>>();

  await Promise.all(
    candidates.map(async (hotspot) => {
      const result = await fetchSourceMaterial(hotspot.url);
      enrichedMap.set(hotspot.id, result);
    })
  );

  return hotspots.map((hotspot) => {
    const enriched = enrichedMap.get(hotspot.id);

    if (!enriched) {
      return hotspot;
    }

    return {
      ...hotspot,
      sourceTitle: enriched.title ?? hotspot.sourceTitle,
      sourceExcerpt: enriched.excerpt ?? hotspot.sourceExcerpt,
      sourceFetchedAt: enriched.fetchedAt ?? hotspot.sourceFetchedAt
    };
  });
}

async function autoGeneratePacks(
  brand: BrandStrategyPack,
  hotspots: SyncedHotspot[]
): Promise<GeneratedPackResult[]> {
  const enabled = (process.env.AUTO_GENERATE_CONTENT_PACKS ?? "false").toLowerCase() === "true";

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

        const hotspots = items.map((item) => {
          const scores = scoreAgainstBrand(brand, item, provider.kind);
          const localizedBoost = provider.market === "china" ? 6 : 0;
          const providerAdjustment = getProviderPriorityAdjustment(provider, scores);
          const priorityScore = Math.min(98, Math.max(0, scores.priorityScore + localizedBoost + providerAdjustment));
          const reasons =
            provider.id === marketingCalendarProviderId
              ? [
                  `营销节点信号：${item.title} 属于可提前规划的公共传播节点，适合尽早准备选题与素材。`,
                  `借势路径：优先把节点翻译成 ${brand.name} 的用户场景、行业趋势或品牌态度，不只复述事件本身。`,
                  "执行节奏：先做 AI 搜索摸底，补齐平台热度、用户情绪和品牌案例，再决定快反或观点内容。",
                  ...scores.reasons,
                  ...getChinaHotspotRules().slice(0, 1)
                ]
              : provider.id.startsWith("ai-super-ip-")
                ? [
                    `超级IP信号：${item.title} 属于高共识度的大众议题，适合单独策划借势传播。`,
                    `借势路径：优先判断这个超级IP和 ${brand.name} 的品牌态度、用户情绪或场景需求怎么连接。`,
                    "执行节奏：先做 AI 搜索摸底，确认热度趋势、关键话题、平台玩法和过往借势案例，再决定打法。",
                    ...scores.reasons,
                    ...getChinaHotspotRules().slice(0, 1)
                  ]
              : [...scores.reasons, ...getChinaHotspotRules().slice(0, 1)];
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
            source: `${provider.source} / ${provider.market === "china" ? "CN-first" : "Global-core"} / ${provider.id}`,
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
          fetchStatus: (items.length > 0 ? "ok" : "empty") as HotspotFetchStatus,
          fetchNote: items.length > 0 ? `抓取成功，返回 ${items.length} 条` : "抓取成功，但返回 0 条",
          pageObservation
        };
      } catch (error) {
        return {
          provider,
          hotspots: [],
          fetchStatus: "failed" as const,
          fetchNote: error instanceof Error ? error.message : "未知错误",
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
  const enrichedHotspots = await enrichHotspotsWithSourceMaterial(deduped);

  const storage = await persistHotspots(brand, enrichedHotspots);
  const generatedPacks = await autoGeneratePacks(brand, enrichedHotspots);
  const providerReports = providerResults.map((result) => ({
    id: result.provider.id,
    label: result.provider.label,
    sourceType: getProviderSourceType(result.provider),
    priorityRole: getProviderPriorityRole(result.provider),
    fetched: result.hotspots.length,
    persisted: storage.persisted ? result.hotspots.length : 0,
    fetchStatus: result.fetchStatus,
    fetchNote: result.fetchNote,
    pageChecked: result.pageObservation?.checked,
    pageReachable: result.pageObservation?.reachable,
    pageMatchedTitles: result.pageObservation?.matchedTitles,
    pageGated: result.pageObservation?.gated,
    pageNote: result.pageObservation?.note
  }));
  const executedAt = new Date().toISOString();
  const syncSnapshot = buildHotspotSyncSnapshot({
    executedAt,
    hotspotCount: enrichedHotspots.length,
    providers: providerReports
  });

  try {
    await updateLocalDataStore((store) => ({
      ...store,
      lastHotspotSync: syncSnapshot
    }));
  } catch {
    // Ignore snapshot persistence errors in read-only runtime environments.
  }

  return {
    providers: providerReports,
    hotspots: enrichedHotspots,
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
