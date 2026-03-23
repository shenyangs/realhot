import type { Route } from "next";
import Link from "next/link";
import { BackToTopButton } from "@/components/back-to-top-button";
import { HotspotActionButton } from "@/components/hotspot-action-button";
import { HotspotDecisionBasis } from "@/components/hotspot-decision-basis";
import { PageAutoRefresh } from "@/components/page-auto-refresh";
import { PageHero } from "@/components/page-hero";
import { canGenerateContent, canUseHotspotInsight } from "@/lib/auth";
import { getCurrentViewer } from "@/lib/auth/session";
import { getBrandStrategyPack, getHotspotSignals, getLatestHotspotSyncSnapshot, getReviewQueue } from "@/lib/data";
import { ensureHotspotsFresh } from "@/lib/services/hotspot-auto-sync";
import type { HotspotKind } from "@/lib/domain/types";
import { prioritizeHotspots, type PrioritizedHotspot } from "@/lib/services/hotspot-engine";

type HotspotMarket = "china" | "global" | "unknown";
type SourceFamily = "platform" | "media" | "community" | "global";
type HeatFilter = "all" | "high" | "medium" | "emerging";
type FitFilter = "all" | "high" | "medium" | "low";
type RiskFilter = "all" | "low" | "medium" | "high";
type ConvertedFilter = "all" | "converted" | "unconverted";
type WindowFilter = "all" | "now" | "today" | "later";
type SortOption = "fit" | "latest" | "hottest" | "urgent" | "low-risk";
type HeatFilterOption = Exclude<HeatFilter, "all">;
type FitFilterOption = Exclude<FitFilter, "all">;
type RiskFilterOption = Exclude<RiskFilter, "all">;
type ConvertedFilterOption = Exclude<ConvertedFilter, "all">;
type WindowFilterOption = Exclude<WindowFilter, "all">;

type SearchParams = Promise<{
  family?: string;
  families?: string;
  source?: string;
  sources?: string;
  heat?: string;
  fit?: string;
  risk?: string;
  converted?: string;
  window?: string;
  sort?: string;
}>;

interface SourceRecord {
  label: string;
  market: HotspotMarket;
  displayLabel: string;
  family: SourceFamily;
  providerId?: string;
  sourceType: "direct" | "rss" | "aggregator" | "unknown";
}

interface SourceGroup {
  label: string;
  displayLabel: string;
  market: HotspotMarket;
  family: SourceFamily;
  items: PrioritizedHotspot[];
  topBrandFitScore: number;
}

interface AggregatedHotspotEntry {
  signal: PrioritizedHotspot;
  selectedSourceLabels: string[];
  sourceRecords: SourceRecord[];
}

const allFamilyKeys: SourceFamily[] = ["platform", "media", "community", "global"];
const sortValues: SortOption[] = ["fit", "latest", "hottest", "urgent", "low-risk"];
const heatFilterOptions: HeatFilterOption[] = ["high", "medium", "emerging"];
const fitFilterOptions: FitFilterOption[] = ["high", "medium", "low"];
const riskFilterOptions: RiskFilterOption[] = ["low", "medium", "high"];
const convertedFilterOptions: ConvertedFilterOption[] = ["converted", "unconverted"];
const windowFilterOptions: WindowFilterOption[] = ["now", "today", "later"];

function cleanDisplayText(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateDisplayText(value: string, maxLength: number) {
  const cleaned = cleanDisplayText(value);
  const chars = Array.from(cleaned);

  if (chars.length <= maxLength) {
    return cleaned;
  }

  return `${chars.slice(0, maxLength).join("").trimEnd()}...`;
}

function getSourceDisplayLabel(label: string) {
  const sourceMap: Record<string, string> = {
    "Weibo Realtime Hot": "微博",
    "Zhihu Hot API": "知乎",
    "Bilibili Popular API": "哔哩哔哩",
    "Toutiao Hot Board": "今日头条",
    "AA1 Baidu Hot": "百度",
    "华尔街见闻": "华尔街见闻",
    "财联社": "财联社",
    "澎湃新闻": "澎湃新闻",
    "凤凰网": "凤凰网",
    "贴吧": "贴吧",
    "抖音": "抖音",
    "36Kr RSS": "36氪",
    "IT之家 RSS": "IT之家",
    "虎嗅 RSS": "虎嗅",
    "爱范儿 RSS": "爱范儿",
    "Google News RSS": "谷歌新闻",
    "Entobit Hot Search": "热搜神器"
  };

  return sourceMap[label] ?? label;
}

function getSourceTypeLabel(sourceType: SourceRecord["sourceType"], providerId?: string) {
  if (providerId?.startsWith("trendradar-")) {
    return "备用聚合";
  }

  if (sourceType === "rss") {
    return "RSS 直连";
  }

  if (sourceType === "aggregator") {
    return "聚合源";
  }

  if (sourceType === "direct") {
    return "直连源";
  }

  return "未标注";
}

function getSyncStatusLabel(fetchStatus?: "ok" | "empty" | "failed") {
  if (fetchStatus === "ok") {
    return "抓取成功";
  }

  if (fetchStatus === "empty") {
    return "返回为空";
  }

  if (fetchStatus === "failed") {
    return "抓取失败";
  }

  return "未执行";
}

function getSyncStatusTone(fetchStatus?: "ok" | "empty" | "failed") {
  if (fetchStatus === "ok") {
    return "positive";
  }

  if (fetchStatus === "failed") {
    return "warning";
  }

  return "neutral";
}

function formatDateTime(value?: string) {
  if (!value) {
    return "未记录";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(parsed);
}

function getSourceFamily(record: {
  label: string;
  displayLabel: string;
  market: HotspotMarket;
}): SourceFamily {
  if (record.market === "global") {
    return "global";
  }

  const platformLabels = new Set(["微博", "知乎", "哔哩哔哩", "今日头条", "百度", "小红书", "抖音"]);
  const mediaLabels = new Set([
    "36氪",
    "IT之家",
    "虎嗅",
    "爱范儿",
    "谷歌新闻",
    "腾讯新闻",
    "网易新闻",
    "搜狐新闻",
    "华尔街见闻",
    "财联社",
    "澎湃新闻",
    "凤凰网"
  ]);
  const communityLabels = new Set(["GitHub", "虎扑", "V2EX", "掘金", "豆瓣", "贴吧", "少数派"]);

  if (platformLabels.has(record.displayLabel)) {
    return "platform";
  }

  if (communityLabels.has(record.displayLabel)) {
    return "community";
  }

  if (mediaLabels.has(record.displayLabel)) {
    return "media";
  }

  return record.market === "china" ? "media" : "global";
}

function getFamilyLabel(family: SourceFamily) {
  if (family === "platform") {
    return "平台来源";
  }

  if (family === "media") {
    return "媒体来源";
  }

  if (family === "community") {
    return "社区来源";
  }

  return "海外来源";
}

function getKindLabel(kind: HotspotKind) {
  if (kind === "industry") {
    return "行业热点";
  }

  if (kind === "mass") {
    return "大众 / 平台";
  }

  return "品牌 / 竞品";
}

function parseSourceRecords(source: string | null | undefined): SourceRecord[] {
  if (!source || typeof source !== "string") {
    return [];
  }

  return source
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const parts = item
        .split(" / ")
        .map((part) => part.trim())
        .filter(Boolean);
      const label = parts[0] ?? "未标注信源";
      const marketTag = parts[1];
      const market =
        marketTag === "CN-first"
          ? "china"
          : marketTag === "Global-core"
            ? "global"
            : "unknown";

      return {
        label,
        market,
        displayLabel: getSourceDisplayLabel(label),
        family: getSourceFamily({
          label,
          displayLabel: getSourceDisplayLabel(label),
          market
        }),
        providerId: parts[2],
        sourceType:
          parts[2]?.startsWith("trendradar-")
            ? "aggregator"
            : parts[2]?.startsWith("rss-")
              ? "rss"
              : parts[2]?.startsWith("entobit-") || parts[2]?.startsWith("aa1-")
                ? "aggregator"
                : parts[2]
                  ? "direct"
                  : "unknown"
      } satisfies SourceRecord;
    });
}

function parseQueryList(value?: string) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

function normalizeFamilySelection(value?: string) {
  const parsed = parseQueryList(value).filter((item): item is SourceFamily =>
    allFamilyKeys.includes(item as SourceFamily)
  );

  return parsed.length > 0 ? [...parsed].sort((left, right) => allFamilyKeys.indexOf(left) - allFamilyKeys.indexOf(right)) : [...allFamilyKeys];
}

function parseFilterValue<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T) {
  return value && allowed.includes(value as T) ? (value as T) : fallback;
}

function parseMultiFilterValue<T extends string>(value: string | undefined, allowed: readonly T[]) {
  const parsed = parseQueryList(value).filter((item): item is T => allowed.includes(item as T));

  return parsed.sort((left, right) => allowed.indexOf(left) - allowed.indexOf(right));
}

function toggleListValue<T extends string>(values: T[], target: T) {
  return values.includes(target) ? values.filter((value) => value !== target) : [...values, target];
}

function pruneSourcesByFamilies(sourceLabels: string[], groups: SourceGroup[], families: SourceFamily[]) {
  const allowed = new Set(
    groups.filter((group) => families.includes(group.family)).map((group) => group.displayLabel)
  );

  return sourceLabels.filter((label) => allowed.has(label));
}

function buildFallbackSearchUrl(title: string, sourceRecords: SourceRecord[]) {
  const primaryRecord = sourceRecords[0];
  const query = encodeURIComponent(title);

  if (primaryRecord?.displayLabel === "微博") {
    return `https://s.weibo.com/weibo?q=${query}`;
  }

  if (primaryRecord?.displayLabel === "知乎") {
    return `https://www.zhihu.com/search?type=content&q=${query}`;
  }

  if (primaryRecord?.displayLabel === "哔哩哔哩") {
    return `https://search.bilibili.com/all?keyword=${query}`;
  }

  if (primaryRecord?.displayLabel === "今日头条") {
    return `https://so.toutiao.com/search?keyword=${query}`;
  }

  if (primaryRecord?.family === "global") {
    return `https://news.google.com/search?q=${query}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  }

  return `https://www.baidu.com/s?wd=${query}`;
}

function aggregateHotspots(groups: SourceGroup[]): AggregatedHotspotEntry[] {
  const entryMap = new Map<string, AggregatedHotspotEntry>();

  for (const group of groups) {
    for (const signal of group.items) {
      const current = entryMap.get(signal.id) ?? {
        signal,
        selectedSourceLabels: [],
        sourceRecords: []
      };
      const recordMap = new Map(
        current.sourceRecords.map((record) => [`${record.market}:${record.label}:${record.providerId ?? ""}`, record])
      );

      current.selectedSourceLabels = Array.from(new Set([...current.selectedSourceLabels, group.displayLabel])).sort((left, right) =>
        left.localeCompare(right, "zh-Hans-CN")
      );

      const nextRecords =
        parseSourceRecords(signal.source).length > 0
          ? parseSourceRecords(signal.source)
          : [
              {
                label: "未标注信源",
                displayLabel: "未标注",
                market: "unknown" as const,
                family: "media" as const,
                sourceType: "unknown" as const
              }
            ];

      for (const record of nextRecords) {
        recordMap.set(`${record.market}:${record.label}:${record.providerId ?? ""}`, record);
      }

      current.sourceRecords = Array.from(recordMap.values()).sort((left, right) =>
        left.displayLabel.localeCompare(right.displayLabel, "zh-Hans-CN")
      );
      entryMap.set(signal.id, current);
    }
  }

  return Array.from(entryMap.values());
}

function getHeatLabel(signal: PrioritizedHotspot) {
  if (signal.velocityScore >= 85) {
    return "高热";
  }

  if (signal.velocityScore >= 75) {
    return "中热";
  }

  return "观察";
}

function getHeatFilterMatch(signal: PrioritizedHotspot, filter: HeatFilterOption) {
  if (filter === "high") {
    return signal.velocityScore >= 85;
  }

  if (filter === "medium") {
    return signal.velocityScore >= 75 && signal.velocityScore < 85;
  }

  return signal.velocityScore < 75;
}

function getFitLabel(score: number) {
  if (score >= 80) {
    return "高";
  }

  if (score >= 65) {
    return "中";
  }

  return "低";
}

function getFitFilterMatch(score: number, filter: FitFilterOption) {
  if (filter === "high") {
    return score >= 80;
  }

  if (filter === "medium") {
    return score >= 65 && score < 80;
  }

  return score < 65;
}

function getRiskLabel(score: number) {
  if (score <= 35) {
    return "低";
  }

  if (score <= 55) {
    return "中";
  }

  return "高";
}

function getRiskTone(score: number) {
  if (score <= 35) {
    return "positive";
  }

  if (score <= 55) {
    return "neutral";
  }

  return "warning";
}

function getRiskFilterMatch(score: number, filter: RiskFilterOption) {
  if (filter === "low") {
    return score <= 35;
  }

  if (filter === "medium") {
    return score > 35 && score <= 55;
  }

  return score > 55;
}

function getWindowLabel(signal: PrioritizedHotspot) {
  if (signal.velocityScore >= 85 || signal.recommendedAction === "ship-now") {
    return "4 小时内";
  }

  if (signal.velocityScore >= 75) {
    return "今天内";
  }

  return "继续观察";
}

function getWindowFilterMatch(signal: PrioritizedHotspot, filter: WindowFilterOption) {
  if (filter === "now") {
    return signal.velocityScore >= 85 || signal.recommendedAction === "ship-now";
  }

  if (filter === "today") {
    return signal.velocityScore >= 75 && signal.velocityScore < 85;
  }

  return signal.velocityScore < 75 && signal.recommendedAction !== "ship-now";
}

function getUrgencyRank(signal: PrioritizedHotspot) {
  if (signal.velocityScore >= 85 || signal.recommendedAction === "ship-now") {
    return 0;
  }

  if (signal.velocityScore >= 75) {
    return 1;
  }

  return 2;
}

function buildHotspotHref(input: {
  families: SourceFamily[];
  sources?: string[];
  heat?: HeatFilterOption[];
  fit?: FitFilterOption[];
  risk?: RiskFilterOption[];
  converted?: ConvertedFilterOption[];
  window?: WindowFilterOption[];
  sort?: SortOption;
}): Route {
  const params = new URLSearchParams();
  const normalizedFamilies = [...input.families].sort((left, right) => allFamilyKeys.indexOf(left) - allFamilyKeys.indexOf(right));
  const normalizedSources = [...(input.sources ?? [])].sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  const normalizedHeat = [...(input.heat ?? [])].sort((left, right) => heatFilterOptions.indexOf(left) - heatFilterOptions.indexOf(right));
  const normalizedFit = [...(input.fit ?? [])].sort((left, right) => fitFilterOptions.indexOf(left) - fitFilterOptions.indexOf(right));
  const normalizedRisk = [...(input.risk ?? [])].sort((left, right) => riskFilterOptions.indexOf(left) - riskFilterOptions.indexOf(right));
  const normalizedConverted = [...(input.converted ?? [])].sort(
    (left, right) => convertedFilterOptions.indexOf(left) - convertedFilterOptions.indexOf(right)
  );
  const normalizedWindow = [...(input.window ?? [])].sort(
    (left, right) => windowFilterOptions.indexOf(left) - windowFilterOptions.indexOf(right)
  );

  if (normalizedFamilies.length > 0 && normalizedFamilies.length < allFamilyKeys.length) {
    params.set("families", normalizedFamilies.join(","));
  }

  if (normalizedSources.length > 0) {
    params.set("sources", normalizedSources.join(","));
  }

  if (normalizedHeat.length > 0) {
    params.set("heat", normalizedHeat.join(","));
  }

  if (normalizedFit.length > 0) {
    params.set("fit", normalizedFit.join(","));
  }

  if (normalizedRisk.length > 0) {
    params.set("risk", normalizedRisk.join(","));
  }

  if (normalizedConverted.length > 0) {
    params.set("converted", normalizedConverted.join(","));
  }

  if (normalizedWindow.length > 0) {
    params.set("window", normalizedWindow.join(","));
  }

  if (input.sort && input.sort !== "fit") {
    params.set("sort", input.sort);
  }

  const query = params.toString();
  return (query ? `/hotspots?${query}` : "/hotspots") as Route;
}

function sortEntries(entries: AggregatedHotspotEntry[], sort: SortOption) {
  return [...entries].sort((left, right) => {
    if (sort === "latest") {
      return Date.parse(right.signal.detectedAt) - Date.parse(left.signal.detectedAt);
    }

    if (sort === "hottest") {
      return right.signal.velocityScore - left.signal.velocityScore || right.signal.priorityScore - left.signal.priorityScore;
    }

    if (sort === "urgent") {
      return getUrgencyRank(left.signal) - getUrgencyRank(right.signal) || right.signal.priorityScore - left.signal.priorityScore;
    }

    if (sort === "low-risk") {
      return left.signal.riskScore - right.signal.riskScore || right.signal.brandFitScore - left.signal.brandFitScore;
    }

    if (right.signal.brandFitScore !== left.signal.brandFitScore) {
      return right.signal.brandFitScore - left.signal.brandFitScore;
    }

    if (right.signal.priorityScore !== left.signal.priorityScore) {
      return right.signal.priorityScore - left.signal.priorityScore;
    }

    return Date.parse(right.signal.detectedAt) - Date.parse(left.signal.detectedAt);
  });
}

export default async function HotspotsPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  await ensureHotspotsFresh();
  const viewer = await getCurrentViewer();
  const canGenerate = canGenerateContent(viewer);
  const canUseInsight = canUseHotspotInsight(viewer);
  const isTrialAccess = viewer.effectiveRole === "trial_guest";

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [brand, hotspots, syncSnapshot, packs] = await Promise.all([
    getBrandStrategyPack(),
    getHotspotSignals(),
    getLatestHotspotSyncSnapshot(),
    getReviewQueue()
  ]);

  const scoredHotspots = prioritizeHotspots(brand, hotspots);
  const syncProviders = syncSnapshot?.providers ?? [];
  const failedProviders = syncProviders.filter((provider) => provider.fetchStatus === "failed").length;
  const directProviders = syncProviders.filter((provider) => provider.sourceType === "direct").length;
  const rssProviders = syncProviders.filter((provider) => provider.sourceType === "rss").length;
  const aggregatorProviders = syncProviders.filter((provider) => provider.sourceType === "aggregator").length;

  const packByHotspotId = new Map(
    packs.map((pack) => [
      pack.hotspotId,
      {
        packId: pack.id,
        variantId: pack.variants[0]?.id,
        platform: pack.variants[0]?.platforms[0]
      }
    ])
  );

  const groupMap = new Map<string, SourceGroup>();

  for (const hotspot of scoredHotspots) {
    const records = parseSourceRecords(hotspot.source);

    for (const record of records.length > 0
      ? records
      : [
          {
            label: "未标注信源",
            displayLabel: "未标注",
            market: "unknown" as const,
            family: "media" as const,
            sourceType: "unknown" as const
          }
        ]) {
      const key = `${record.market}:${record.label}`;
      const current = groupMap.get(key) ?? {
        label: record.label,
        displayLabel: record.displayLabel,
        market: record.market,
        family: record.family,
        items: [],
        topBrandFitScore: 0
      };

      current.items.push(hotspot);
      current.topBrandFitScore = Math.max(current.topBrandFitScore, hotspot.brandFitScore);
      groupMap.set(key, current);
    }
  }

  const sourceGroups = Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) => {
        if (right.brandFitScore !== left.brandFitScore) {
          return right.brandFitScore - left.brandFitScore;
        }

        if (right.priorityScore !== left.priorityScore) {
          return right.priorityScore - left.priorityScore;
        }

        return Date.parse(right.detectedAt) - Date.parse(left.detectedAt);
      })
    }))
    .sort((left, right) => {
      if (right.topBrandFitScore !== left.topBrandFitScore) {
        return right.topBrandFitScore - left.topBrandFitScore;
      }

      if (right.items.length !== left.items.length) {
        return right.items.length - left.items.length;
      }

      return left.displayLabel.localeCompare(right.displayLabel, "zh-Hans-CN");
    });

  const selectedFamilies = normalizeFamilySelection(resolvedSearchParams?.families ?? resolvedSearchParams?.family);
  const visibleGroups = sourceGroups.filter((group) => selectedFamilies.includes(group.family));
  const selectedSources = parseQueryList(resolvedSearchParams?.sources ?? resolvedSearchParams?.source).filter((source) =>
    visibleGroups.some((group) => group.displayLabel === source)
  );
  const activeGroups =
    selectedSources.length > 0
      ? visibleGroups.filter((group) => selectedSources.includes(group.displayLabel))
      : visibleGroups;
  const heatFilters = parseMultiFilterValue(resolvedSearchParams?.heat, heatFilterOptions);
  const fitFilters = parseMultiFilterValue(resolvedSearchParams?.fit, fitFilterOptions);
  const riskFilters = parseMultiFilterValue(resolvedSearchParams?.risk, riskFilterOptions);
  const convertedFilters = parseMultiFilterValue(resolvedSearchParams?.converted, convertedFilterOptions);
  const windowFilters = parseMultiFilterValue(resolvedSearchParams?.window, windowFilterOptions);
  const sort = parseFilterValue(resolvedSearchParams?.sort, sortValues, "fit");

  const allFamiliesSelected = selectedFamilies.length === allFamilyKeys.length;
  const aggregatedHotspots = aggregateHotspots(activeGroups);
  const filteredEntries = aggregatedHotspots.filter((entry) => {
    const isConverted = packByHotspotId.has(entry.signal.id);

    return (
      (heatFilters.length === 0 || heatFilters.some((value) => getHeatFilterMatch(entry.signal, value))) &&
      (fitFilters.length === 0 || fitFilters.some((value) => getFitFilterMatch(entry.signal.brandFitScore, value))) &&
      (riskFilters.length === 0 || riskFilters.some((value) => getRiskFilterMatch(entry.signal.riskScore, value))) &&
      (windowFilters.length === 0 || windowFilters.some((value) => getWindowFilterMatch(entry.signal, value))) &&
      (convertedFilters.length === 0 ||
        convertedFilters.some(
          (value) => (value === "converted" && isConverted) || (value === "unconverted" && !isConverted)
        ))
    );
  });
  const sortedEntries = sortEntries(filteredEntries, sort);
  const counts = {
    platform: sourceGroups.filter((group) => group.family === "platform").length,
    media: sourceGroups.filter((group) => group.family === "media").length,
    community: sourceGroups.filter((group) => group.family === "community").length,
    global: sourceGroups.filter((group) => group.family === "global").length,
    all: sourceGroups.length
  };
  const highPotentialCount = scoredHotspots.filter((item) => item.priorityScore >= 75).length;
  const urgentCount = scoredHotspots.filter((item) => getWindowFilterMatch(item, "now")).length;
  const convertedCount = scoredHotspots.filter((item) => packByHotspotId.has(item.id)).length;
  const lowRiskCount = scoredHotspots.filter((item) => item.riskScore <= 35).length;
  const providerRows = [...syncProviders].sort((left, right) => right.fetched - left.fetched);

  return (
    <div className="page hotspotBoardPageV2">
      <PageAutoRefresh intervalMs={3 * 60 * 1000} />

      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="/review">
              去审核台
            </Link>
            <Link className="buttonLike subtleButton" href="/">
              回工作台
            </Link>
            <Link className="buttonLike subtleButton" href="/brands">
              查看品牌底盘
            </Link>
          </>
        }
        context={brand.name}
        description="这里先筛机会，不急着写内容。先判断哪些热点值得转成选题包。"
        eyebrow="热点机会"
        facts={[
          { label: "当前品牌", value: brand.name },
          { label: "高潜热点", value: `${highPotentialCount} 条` },
          { label: "需立即处理", value: `${urgentCount} 条` },
          { label: "已转题", value: `${convertedCount} 条` },
          { label: "低风险", value: `${lowRiskCount} 条` },
          { label: "最近同步", value: formatDateTime(syncSnapshot?.executedAt) }
        ]}
        title="今天有哪些值得跟"
      />

      <section className="panel hotspotOverviewPanel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">运行总览</p>
            <h2>机会池当前状态</h2>
          </div>
        </div>

        <div className="statusFeedGrid">
          <div className="statusFeedItem">
            <span>抓取来源</span>
            <strong>{sourceGroups.length} 组</strong>
          </div>
          <div className="statusFeedItem">
            <span>直连 / RSS / 聚合</span>
            <strong>
              {directProviders} / {rssProviders} / {aggregatorProviders}
            </strong>
          </div>
          <div className="statusFeedItem">
            <span>失败来源</span>
            <strong>{failedProviders} 个</strong>
          </div>
          <div className="statusFeedItem">
            <span>当前排序</span>
            <strong>
              {sort === "fit"
                ? "品牌相关度最高"
                : sort === "latest"
                  ? "最新出现"
                  : sort === "hottest"
                    ? "热度最高"
                    : sort === "urgent"
                      ? "最紧急"
                      : "风险最低"}
            </strong>
          </div>
        </div>

        <details className="hotspotBoardDetails">
          <summary>查看来源执行明细</summary>
          <div className="hotspotBoardDetailsBody">
            <div className="providerHealthTable">
              {providerRows.map((provider) => (
                <div className="providerHealthRow" key={provider.id}>
                  <div className="providerHealthSource">
                    <strong>{provider.label}</strong>
                    <p className="muted">
                      {provider.sourceType === "direct"
                        ? "直连"
                        : provider.sourceType === "rss"
                          ? "RSS"
                          : "聚合"}{" "}
                      · {provider.priorityRole === "fallback" ? "备用" : "主链路"}
                    </p>
                  </div>
                  <span>{provider.fetched} 条</span>
                  <span className={`pill pill-${getSyncStatusTone(provider.fetchStatus)}`}>
                    {getSyncStatusLabel(provider.fetchStatus)}
                  </span>
                  <span className="muted">{provider.fetchNote ?? provider.pageNote ?? "未返回附加说明"}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      </section>

      <section className="panel hotspotFilterPanel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">筛选与排序</p>
            <h2>先收窄，再做判断</h2>
          </div>
          <span className="muted">共 {sortedEntries.length} 条结果</span>
        </div>

        <div className="filterGroupBlock">
          <span className="filterGroupLabel">平台来源</span>
          <div className="filterChipRow">
            <Link
              aria-current={allFamiliesSelected ? "page" : undefined}
              className={`filterChip ${allFamiliesSelected ? "filterChipActive" : ""}`}
              href={buildHotspotHref({
                families: allFamilyKeys,
                sources: pruneSourcesByFamilies(selectedSources, sourceGroups, allFamilyKeys),
                heat: heatFilters,
                fit: fitFilters,
                risk: riskFilters,
                converted: convertedFilters,
                window: windowFilters,
                sort
              })}
            >
              全部
            </Link>
            {allFamilyKeys.map((family) => {
              const nextFamilies = toggleListValue(selectedFamilies, family);
              const normalizedNextFamilies = nextFamilies.length > 0 ? nextFamilies : [...allFamilyKeys];
              const nextSources = pruneSourcesByFamilies(selectedSources, sourceGroups, normalizedNextFamilies);

              return (
                <Link
                  aria-current={selectedFamilies.includes(family) ? "page" : undefined}
                  className={`filterChip ${selectedFamilies.includes(family) ? "filterChipActive" : ""}`}
                  href={buildHotspotHref({
                    families: normalizedNextFamilies,
                    sources: nextSources,
                    heat: heatFilters,
                    fit: fitFilters,
                    risk: riskFilters,
                    converted: convertedFilters,
                    window: windowFilters,
                    sort
                  })}
                  key={family}
                >
                  {getFamilyLabel(family)}
                  <strong>{counts[family]}</strong>
                </Link>
              );
            })}
          </div>
        </div>

        {visibleGroups.length > 0 ? (
          <div className="filterGroupBlock">
            <span className="filterGroupLabel">具体来源</span>
            <div className="filterChipRow">
              <Link
                aria-current={selectedSources.length === 0 ? "page" : undefined}
                className={`filterChip ${selectedSources.length === 0 ? "filterChipActive" : ""}`}
                href={buildHotspotHref({
                  families: selectedFamilies,
                  heat: heatFilters,
                  fit: fitFilters,
                  risk: riskFilters,
                  converted: convertedFilters,
                  window: windowFilters,
                  sort
                })}
              >
                全部来源
              </Link>
              {visibleGroups.slice(0, 12).map((group) => {
                const nextSources = toggleListValue(selectedSources, group.displayLabel);

                return (
                  <Link
                    aria-current={selectedSources.includes(group.displayLabel) ? "page" : undefined}
                    className={`filterChip ${selectedSources.includes(group.displayLabel) ? "filterChipActive" : ""}`}
                    href={buildHotspotHref({
                      families: selectedFamilies,
                      sources: nextSources,
                      heat: heatFilters,
                      fit: fitFilters,
                      risk: riskFilters,
                      converted: convertedFilters,
                      window: windowFilters,
                      sort
                    })}
                    key={`${group.market}-${group.label}`}
                  >
                    {group.displayLabel}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="filterMetaGrid">
          <div className="filterGroupBlock">
            <span className="filterGroupLabel">热度等级</span>
            <div className="filterChipRow">
              <Link
                aria-current={heatFilters.length === 0 ? "page" : undefined}
                className={`filterChip ${heatFilters.length === 0 ? "filterChipActive" : ""}`}
                href={buildHotspotHref({
                  families: selectedFamilies,
                  sources: selectedSources,
                  heat: [],
                  fit: fitFilters,
                  risk: riskFilters,
                  converted: convertedFilters,
                  window: windowFilters,
                  sort
                })}
              >
                全部
              </Link>
              {heatFilterOptions.map((value) => {
                const nextHeatFilters = toggleListValue(heatFilters, value);

                return (
                <Link
                  aria-current={heatFilters.includes(value) ? "page" : undefined}
                  className={`filterChip ${heatFilters.includes(value) ? "filterChipActive" : ""}`}
                  href={buildHotspotHref({
                    families: selectedFamilies,
                    sources: selectedSources,
                    heat: nextHeatFilters,
                    fit: fitFilters,
                    risk: riskFilters,
                    converted: convertedFilters,
                    window: windowFilters,
                    sort
                  })}
                  key={value}
                >
                  {value === "high" ? "高热" : value === "medium" ? "中热" : "观察"}
                </Link>
                );
              })}
            </div>
          </div>

          <div className="filterGroupBlock">
            <span className="filterGroupLabel">品牌相关度</span>
            <div className="filterChipRow">
              <Link
                aria-current={fitFilters.length === 0 ? "page" : undefined}
                className={`filterChip ${fitFilters.length === 0 ? "filterChipActive" : ""}`}
                href={buildHotspotHref({
                  families: selectedFamilies,
                  sources: selectedSources,
                  heat: heatFilters,
                  fit: [],
                  risk: riskFilters,
                  converted: convertedFilters,
                  window: windowFilters,
                  sort
                })}
              >
                全部
              </Link>
              {fitFilterOptions.map((value) => {
                const nextFitFilters = toggleListValue(fitFilters, value);

                return (
                <Link
                  aria-current={fitFilters.includes(value) ? "page" : undefined}
                  className={`filterChip ${fitFilters.includes(value) ? "filterChipActive" : ""}`}
                  href={buildHotspotHref({
                    families: selectedFamilies,
                    sources: selectedSources,
                    heat: heatFilters,
                    fit: nextFitFilters,
                    risk: riskFilters,
                    converted: convertedFilters,
                    window: windowFilters,
                    sort
                  })}
                  key={value}
                >
                  {value === "high" ? "高" : value === "medium" ? "中" : "低"}
                </Link>
                );
              })}
            </div>
          </div>

          <div className="filterGroupBlock">
            <span className="filterGroupLabel">风险等级</span>
            <div className="filterChipRow">
              <Link
                aria-current={riskFilters.length === 0 ? "page" : undefined}
                className={`filterChip ${riskFilters.length === 0 ? "filterChipActive" : ""}`}
                href={buildHotspotHref({
                  families: selectedFamilies,
                  sources: selectedSources,
                  heat: heatFilters,
                  fit: fitFilters,
                  risk: [],
                  converted: convertedFilters,
                  window: windowFilters,
                  sort
                })}
              >
                全部
              </Link>
              {riskFilterOptions.map((value) => {
                const nextRiskFilters = toggleListValue(riskFilters, value);

                return (
                <Link
                  aria-current={riskFilters.includes(value) ? "page" : undefined}
                  className={`filterChip ${riskFilters.includes(value) ? "filterChipActive" : ""}`}
                  href={buildHotspotHref({
                    families: selectedFamilies,
                    sources: selectedSources,
                    heat: heatFilters,
                    fit: fitFilters,
                    risk: nextRiskFilters,
                    converted: convertedFilters,
                    window: windowFilters,
                    sort
                  })}
                  key={value}
                >
                  {value === "low" ? "低风险" : value === "medium" ? "中风险" : "高风险"}
                </Link>
                );
              })}
            </div>
          </div>

          <div className="filterGroupBlock">
            <span className="filterGroupLabel">是否已转题</span>
            <div className="filterChipRow">
              <Link
                aria-current={convertedFilters.length === 0 ? "page" : undefined}
                className={`filterChip ${convertedFilters.length === 0 ? "filterChipActive" : ""}`}
                href={buildHotspotHref({
                  families: selectedFamilies,
                  sources: selectedSources,
                  heat: heatFilters,
                  fit: fitFilters,
                  risk: riskFilters,
                  converted: [],
                  window: windowFilters,
                  sort
                })}
              >
                全部
              </Link>
              {convertedFilterOptions.map((value) => {
                const nextConvertedFilters = toggleListValue(convertedFilters, value);

                return (
                <Link
                  aria-current={convertedFilters.includes(value) ? "page" : undefined}
                  className={`filterChip ${convertedFilters.includes(value) ? "filterChipActive" : ""}`}
                  href={buildHotspotHref({
                    families: selectedFamilies,
                    sources: selectedSources,
                    heat: heatFilters,
                    fit: fitFilters,
                    risk: riskFilters,
                    converted: nextConvertedFilters,
                    window: windowFilters,
                    sort
                  })}
                  key={value}
                >
                  {value === "converted" ? "已转题" : "未转题"}
                </Link>
                );
              })}
            </div>
          </div>

          <div className="filterGroupBlock">
            <span className="filterGroupLabel">时间窗口</span>
            <div className="filterChipRow">
              <Link
                aria-current={windowFilters.length === 0 ? "page" : undefined}
                className={`filterChip ${windowFilters.length === 0 ? "filterChipActive" : ""}`}
                href={buildHotspotHref({
                  families: selectedFamilies,
                  sources: selectedSources,
                  heat: heatFilters,
                  fit: fitFilters,
                  risk: riskFilters,
                  converted: convertedFilters,
                  window: [],
                  sort
                })}
              >
                全部
              </Link>
              {windowFilterOptions.map((value) => {
                const nextWindowFilters = toggleListValue(windowFilters, value);

                return (
                <Link
                  aria-current={windowFilters.includes(value) ? "page" : undefined}
                  className={`filterChip ${windowFilters.includes(value) ? "filterChipActive" : ""}`}
                  href={buildHotspotHref({
                    families: selectedFamilies,
                    sources: selectedSources,
                    heat: heatFilters,
                    fit: fitFilters,
                    risk: riskFilters,
                    converted: convertedFilters,
                    window: nextWindowFilters,
                    sort
                  })}
                  key={value}
                >
                  {value === "now" ? "立即处理" : value === "today" ? "今天内" : "继续观察"}
                </Link>
                );
              })}
            </div>
          </div>

          <div className="filterGroupBlock">
            <span className="filterGroupLabel">排序逻辑</span>
            <div className="filterChipRow">
              {sortValues.map((value) => (
                <Link
                  aria-current={sort === value ? "page" : undefined}
                  className={`filterChip ${sort === value ? "filterChipActive" : ""}`}
                  href={buildHotspotHref({
                    families: selectedFamilies,
                    sources: selectedSources,
                    heat: heatFilters,
                    fit: fitFilters,
                    risk: riskFilters,
                    converted: convertedFilters,
                    window: windowFilters,
                    sort: value
                  })}
                  key={value}
                >
                  {value === "fit"
                    ? "品牌相关度最高"
                    : value === "latest"
                      ? "最新出现"
                      : value === "hottest"
                        ? "热度最高"
                        : value === "urgent"
                          ? "最紧急"
                          : "风险最低"}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="hotspotDecisionGrid">
        {sortedEntries.length > 0 ? (
          sortedEntries.map((entry) => {
            const { signal, selectedSourceLabels, sourceRecords } = entry;
            const existingPack = packByHotspotId.get(signal.id);
            const sourceTypeSummary = Array.from(
              new Set(sourceRecords.map((record) => getSourceTypeLabel(record.sourceType, record.providerId)))
            );
            const reasonNow = signal.reasons[0] ?? "品牌匹配信号：已命中品牌主题与当前传播窗口。";
            const reasonBrandRaw = signal.reasons[1];
            const reasonBrand =
              reasonBrandRaw && !reasonBrandRaw.startsWith("切入建议：")
                ? reasonBrandRaw
                : `品牌结合路径：建议把议题收束到 ${brand.name} 的真实产品场景与组织协同价值，再展开内容。`;
            const reasonAngle =
              signal.reasons[2] ??
              (signal.recommendedAction === "ship-now"
                ? "风险与时效：优先给出业务判断，再补充方法论解释。"
                : "风险与时效：建议先观察证据完整度，再决定是否放大传播。");

            return (
              <article className="panel hotspotDecisionCard" key={signal.id}>
                <div className="hotspotDecisionHead">
                  <div className="tagRow">
                    <span className="pill pill-neutral">{getKindLabel(signal.kind)}</span>
                    <span className="pill pill-neutral">
                      {getHeatLabel(signal)} · {signal.velocityScore}
                    </span>
                    <span className={`pill pill-${getRiskTone(signal.riskScore)}`}>风险 {getRiskLabel(signal.riskScore)}</span>
                    {existingPack ? <span className="pill pill-positive">已转题</span> : null}
                  </div>
                  <span className="reviewInlineMeta">{formatDateTime(signal.detectedAt)}</span>
                </div>

                <h3>{signal.title}</h3>

                <div className="decisionMetricGrid">
                  <div>
                    <span>品牌相关</span>
                    <strong>{signal.brandFitScore}</strong>
                  </div>
                  <div>
                    <span>热度等级</span>
                    <strong>{signal.velocityScore}</strong>
                  </div>
                  <div>
                    <span>风险等级</span>
                    <strong>{signal.riskScore}</strong>
                  </div>
                  <div>
                    <span>介入窗口</span>
                    <strong>{getWindowLabel(signal)}</strong>
                  </div>
                </div>

                <p className="muted">{truncateDisplayText(signal.summary, 110)}</p>

                <div className="hotspotSourceSummary">
                  <span>来源：{selectedSourceLabels.join(" / ") || "未标注"}</span>
                  <span>链路：{sourceTypeSummary.join(" / ") || "未标注"}</span>
                </div>

                <div className="hotspotPrimaryAction">
                  <HotspotActionButton
                    hotspotId={signal.id}
                    packId={existingPack?.packId}
                    platform={existingPack?.platform}
                    readOnly={isTrialAccess || !canGenerate}
                    variantId={existingPack?.variantId}
                  />
                </div>

                <HotspotDecisionBasis
                  allowAiActions={canUseInsight}
                  fallbackReasons={{
                    whyNow: reasonNow,
                    whyBrand: reasonBrand,
                    angle: reasonAngle
                  }}
                  hotspotId={signal.id}
                  sourceLinks={sourceRecords.map((record) => ({
                    key: `${signal.id}-${record.displayLabel}-${record.providerId ?? record.label}`,
                    label: record.displayLabel,
                    href: buildFallbackSearchUrl(signal.title, [record])
                  }))}
                />
              </article>
            );
          })
        ) : (
          <section className="panel systemFeedbackCard">
            <strong>当前筛选下没有可处理热点</strong>
            <p className="muted">建议下一步：放宽一个筛选条件，或回到品牌底盘补充近期动态与表达规则。</p>
          </section>
        )}
      </section>

      <BackToTopButton />
    </div>
  );
}
