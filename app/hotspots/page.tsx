import type { Route } from "next";
import Link from "next/link";
import { BackToTopButton } from "@/components/back-to-top-button";
import { EmptyStateCard } from "@/components/empty-state-card";
import { HotspotActionButton } from "@/components/hotspot-action-button";
import { HotspotInsightTrigger } from "@/components/hotspot-insight-trigger";
import { PageHero } from "@/components/page-hero";
import { getBrandStrategyPack, getHotspotSignals, getLatestHotspotSyncSnapshot, getReviewQueue } from "@/lib/data";
import type { HotspotKind } from "@/lib/domain/types";
import { prioritizeHotspots, type PrioritizedHotspot } from "@/lib/services/hotspot-engine";

type HotspotMarket = "china" | "global" | "unknown";
type SourceFamily = "platform" | "media" | "community" | "global";

type SearchParams = Promise<{
  family?: string;
  families?: string;
  source?: string;
  sources?: string;
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

function getActionLabel(action: "ship-now" | "watch" | "discard") {
  if (action === "ship-now") {
    return "立刻跟进";
  }

  if (action === "watch") {
    return "继续观察";
  }

  return "暂不跟进";
}

function getKindLabel(kind: HotspotKind) {
  if (kind === "industry") {
    return "行业热点";
  }

  if (kind === "mass") {
    return "大众 / 平台热点";
  }

  return "品牌 / 竞品热点";
}

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

function getBrandFitTone(score: number) {
  if (score >= 80) {
    return "positive";
  }

  if (score >= 60) {
    return "neutral";
  }

  return "warning";
}

function formatSyncTimestamp(value?: string) {
  if (!value) {
    return "未记录";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function formatHotspotTimestamp(value: string) {
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
    return "平台源";
  }

  if (family === "media") {
    return "媒体源";
  }

  if (family === "community") {
    return "社区源";
  }

  return "海外源";
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

function parseSourceRecords(source: string): SourceRecord[] {
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

function pruneSourcesByFamilies(sourceLabels: string[], groups: SourceGroup[], families: SourceFamily[]) {
  const allowed = new Set(
    groups.filter((group) => families.includes(group.family)).map((group) => group.displayLabel)
  );

  return sourceLabels.filter((label) => allowed.has(label));
}

function toggleListValue<T extends string>(values: T[], target: T) {
  return values.includes(target) ? values.filter((value) => value !== target) : [...values, target];
}

function buildHotspotHref(input: { families: SourceFamily[]; sources?: string[] }): Route {
  const params = new URLSearchParams();
  const normalizedFamilies = [...input.families].sort(
    (left, right) => allFamilyKeys.indexOf(left) - allFamilyKeys.indexOf(right)
  );
  const normalizedSources = [...(input.sources ?? [])].sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));

  if (normalizedFamilies.length > 0 && normalizedFamilies.length < allFamilyKeys.length) {
    params.set("families", normalizedFamilies.join(","));
  }

  if (normalizedSources.length > 0) {
    params.set("sources", normalizedSources.join(","));
  }

  const query = params.toString();
  return (query ? `/hotspots?${query}` : "/hotspots") as Route;
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

  return Array.from(entryMap.values()).sort((left, right) => {
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
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [brand, hotspots, syncSnapshot, packs] = await Promise.all([
    getBrandStrategyPack(),
    getHotspotSignals(),
    getLatestHotspotSyncSnapshot(),
    getReviewQueue()
  ]);
  const scoredHotspots = prioritizeHotspots(brand, hotspots);
  const syncProviders = syncSnapshot?.providers ?? [];
  const successfulPrimaryProviders = syncProviders.filter(
    (provider) => provider.priorityRole === "primary" && provider.fetchStatus === "ok" && provider.fetched > 0
  ).length;
  const successfulFallbackProviders = syncProviders.filter(
    (provider) => provider.priorityRole === "fallback" && provider.fetchStatus === "ok" && provider.fetched > 0
  ).length;
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

        const timeGap = Date.parse(right.detectedAt) - Date.parse(left.detectedAt);

        if (!Number.isNaN(timeGap) && timeGap !== 0) {
          return timeGap;
        }

        return right.velocityScore - left.velocityScore;
      })
    }))
    .sort((left, right) => {
      if (right.topBrandFitScore !== left.topBrandFitScore) {
        return right.topBrandFitScore - left.topBrandFitScore;
      }

      if (right.items.length !== left.items.length) {
        return right.items.length - left.items.length;
      }

      const familyRank: Record<SourceFamily, number> = {
        platform: 0,
        media: 1,
        community: 2,
        global: 3
      };

      if (familyRank[left.family] !== familyRank[right.family]) {
        return familyRank[left.family] - familyRank[right.family];
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
  const aggregatedHotspots = aggregateHotspots(activeGroups);
  const allFamiliesSelected = selectedFamilies.length === allFamilyKeys.length;
  const counts = {
    platform: sourceGroups.filter((group) => group.family === "platform").length,
    media: sourceGroups.filter((group) => group.family === "media").length,
    community: sourceGroups.filter((group) => group.family === "community").length,
    global: sourceGroups.filter((group) => group.family === "global").length,
    all: sourceGroups.length
  };
  const providerRows = [...syncProviders].sort((left, right) => {
    const getSortRank = (provider: (typeof syncProviders)[number]) => {
      const status = provider.fetchStatus ?? "undefined";
      const role = provider.priorityRole ?? "primary";

      if (status === "ok" && role === "primary") {
        return 0;
      }

      if (status === "ok" && role === "fallback") {
        return 1;
      }

      if (status === "empty" && role === "primary") {
        return 2;
      }

      if (status === "empty" && role === "fallback") {
        return 3;
      }

      if (status === "failed" && role === "primary") {
        return 4;
      }

      if (status === "failed" && role === "fallback") {
        return 5;
      }

      return 6;
    };

    const leftRank = getSortRank(left);
    const rightRank = getSortRank(right);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return right.fetched - left.fetched;
  });

  return (
    <div className="page hotspotBoardPage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike subtleButton" href="/">
              回工作台
            </Link>
            <Link className="buttonLike primaryButton" href="/review">
              进入选题详情台
            </Link>
            <Link className="buttonLike subtleButton" href="/brands">
              看品牌资料
            </Link>
          </>
        }
        description="查看来源状态、筛选层级与当前热点。"
        eyebrow="热点总览"
        facts={[
          { label: "当前品牌", value: brand.name },
          { label: "热点覆盖", value: `${hotspots.length} 条热点 / ${sourceGroups.length} 组来源` },
          {
            label: "同步状态",
            value: syncSnapshot ? `${formatSyncTimestamp(syncSnapshot.executedAt)} 更新` : "还没有同步快照"
          },
          { label: "高结合热点", value: `${scoredHotspots.filter((item) => item.brandFitScore >= 80).length} 条` }
        ]}
        context={brand.name}
        title="热点看板"
      />

      <section className="reviewSimpleSection">
        <div className="reviewSimpleHeader">
          <div>
            <p className="eyebrow">同步状态</p>
            <h3>本次同步</h3>
          </div>
          <span className="muted">
            {syncSnapshot ? `最近同步：${formatSyncTimestamp(syncSnapshot.executedAt)}` : "还没有同步快照"}
          </span>
        </div>

        {syncSnapshot ? (
          <>
            <div className="hotspotSyncFacts">
              <div className="hotspotSyncFact">
                <span>本次同步</span>
                <strong>{syncSnapshot.hotspotCount} 条热点</strong>
              </div>
              <div className="hotspotSyncFact">
                <span>主链路成功</span>
                <strong>{successfulPrimaryProviders} 个</strong>
              </div>
              <div className="hotspotSyncFact">
                <span>备用补位</span>
                <strong>{successfulFallbackProviders} 个</strong>
              </div>
              <div className="hotspotSyncFact">
                <span>失败来源</span>
                <strong>{failedProviders} 个</strong>
              </div>
            </div>

            <div className="hotspotMetaStrip">
              <span className="reviewInlineMeta">直连源 {directProviders}</span>
              <span className="reviewInlineMeta">RSS {rssProviders}</span>
              <span className="reviewInlineMeta">聚合补位 {aggregatorProviders}</span>
              <span className={`reviewInlineMeta ${failedProviders > 0 ? "hotspotMetaWarning" : ""}`}>
                失败 {failedProviders}
              </span>
            </div>

            <details className="hotspotBoardDetails">
              <summary>查看全部来源执行明细</summary>
              <div className="hotspotBoardDetailsBody">
                <div className="providerHealthTable">
                  <div className="providerHealthRow providerHealthHead">
                    <span>来源</span>
                    <span>链路</span>
                    <span>状态</span>
                    <span>说明</span>
                  </div>
                  {providerRows.map((provider) => (
                    <div className="providerHealthRow" key={provider.id}>
                      <div className="providerHealthSource">
                        <strong>{provider.label}</strong>
                        <div className="tagRow">
                          <span className="tag">
                            {provider.sourceType === "direct"
                              ? "直连"
                              : provider.sourceType === "rss"
                                ? "RSS"
                                : "聚合"}
                          </span>
                          <span className="tag">{provider.priorityRole === "fallback" ? "备用" : "主链路"}</span>
                        </div>
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
          </>
        ) : (
          <EmptyStateCard
            eyebrow="同步状态"
            title="暂无同步结果"
            description="执行一次同步后，这里会显示来源状态与执行结果。"
          />
        )}
      </section>

      <section className="reviewSimpleSection">
        <div className="reviewSimpleHeader">
          <div>
            <p className="eyebrow">热源类型</p>
            <h3>来源层级</h3>
          </div>
          <span className="muted">支持多选，默认显示全部</span>
        </div>

        <div className="hotspotTopTabs">
          <Link
            aria-current={allFamiliesSelected ? "page" : undefined}
            className={`hotspotTopTab ${allFamiliesSelected ? "hotspotTopTabActive" : ""}`}
            href={buildHotspotHref({ families: allFamilyKeys, sources: pruneSourcesByFamilies(selectedSources, sourceGroups, allFamilyKeys) })}
          >
            <span>全部</span>
            <strong>{counts.all}</strong>
          </Link>
          {allFamilyKeys.map((family) => {
            const nextFamilies = toggleListValue(selectedFamilies, family);
            const normalizedNextFamilies = nextFamilies.length > 0 ? nextFamilies : [...allFamilyKeys];
            const nextSources = pruneSourcesByFamilies(selectedSources, sourceGroups, normalizedNextFamilies);

            return (
              <Link
                aria-current={selectedFamilies.includes(family) ? "page" : undefined}
                className={`hotspotTopTab ${selectedFamilies.includes(family) ? "hotspotTopTabActive" : ""}`}
                href={buildHotspotHref({ families: normalizedNextFamilies, sources: nextSources })}
                key={family}
              >
                <span>{getFamilyLabel(family)}</span>
                <strong>{counts[family]}</strong>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="reviewSimpleSection">
        <div className="reviewSimpleHeader">
          <div>
            <p className="eyebrow">来源导航</p>
            <h3>来源筛选</h3>
          </div>
          <span className="muted">支持多选，未单独勾选时显示当前层级全部来源</span>
        </div>

        {visibleGroups.length > 0 ? (
          <div className="hotspotSourceGrid">
            <Link
              aria-current={selectedSources.length === 0 ? "page" : undefined}
              className={`hotspotSourceTile ${selectedSources.length === 0 ? "hotspotSourceTileActive" : ""}`}
              href={buildHotspotHref({ families: selectedFamilies })}
            >
              <span>全部来源</span>
              <strong>{visibleGroups.length} 组</strong>
            </Link>
            {visibleGroups.map((group) => {
              const nextSources = toggleListValue(selectedSources, group.displayLabel);

              return (
                <Link
                  aria-current={selectedSources.includes(group.displayLabel) ? "page" : undefined}
                  className={`hotspotSourceTile ${selectedSources.includes(group.displayLabel) ? "hotspotSourceTileActive" : ""}`}
                  href={buildHotspotHref({ families: selectedFamilies, sources: nextSources })}
                  key={`${group.market}-${group.label}`}
                >
                  <span>{group.displayLabel}</span>
                  <strong>{group.items.length} 条 · 最高 {group.topBrandFitScore} 分</strong>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyStateCard
            description="当前层级下暂无来源。"
            eyebrow="来源目录"
            title="暂无来源分组"
          />
        )}
      </section>

      {activeGroups.length > 0 ? (
        <section className="reviewSimpleSection hotspotBoardSection">
          <div className="reviewSimpleHeader">
            <div>
              <p className="eyebrow">结果列表</p>
              <h3>热点列表</h3>
            </div>
            <div className="hotspotBoardHeaderMeta">
              <span className="tag">已选层级 {selectedFamilies.length} 个</span>
              <span className="tag">已选来源 {selectedSources.length > 0 ? selectedSources.length : activeGroups.length} 个</span>
              <span className="muted">共 {aggregatedHotspots.length} 条，按品牌结合度排序</span>
            </div>
          </div>

          <div className="tagRow">
            {selectedFamilies.map((family) => (
              <span className="tag" key={family}>
                {getFamilyLabel(family)}
              </span>
            ))}
            {selectedSources.slice(0, 8).map((source) => (
              <span className="tag" key={source}>
                {source}
              </span>
            ))}
            {selectedSources.length > 8 ? <span className="tag">其余 {selectedSources.length - 8} 个来源</span> : null}
          </div>

          <div className="hotspotBoardList">
            {aggregatedHotspots.map((entry) => {
              const { signal, selectedSourceLabels, sourceRecords } = entry;
              const existingPack = packByHotspotId.get(signal.id);
              const sourceTypeSummary = Array.from(
                new Set(sourceRecords.map((record) => getSourceTypeLabel(record.sourceType, record.providerId)))
              );

              return (
                <article className="hotspotBoardRow" key={signal.id}>
                  <div className="hotspotBoardMain">
                    <div className="tagRow">
                      <span className={`pill pill-${getBrandFitTone(signal.brandFitScore)}`}>品牌结合 {signal.brandFitScore}/100</span>
                      <span className="tag">{getKindLabel(signal.kind)}</span>
                      <span className="tag">命中来源 {selectedSourceLabels.length} 个</span>
                      <span className={`pill pill-${getSyncStatusTone(signal.riskScore >= 70 ? "failed" : "ok")}`}>
                        风险 {signal.riskScore}
                      </span>
                      {existingPack ? <span className="pill pill-neutral">已进入生产</span> : null}
                    </div>

                    <h3 className="hotspotBoardTitle">{signal.title}</h3>
                    <p className="muted hotspotBoardSummary">{truncateDisplayText(signal.summary, 96)}</p>

                    <div className="hotspotMetricRow">
                      <span className="hotspotMetricChip">抓取时间 {formatHotspotTimestamp(signal.detectedAt)}</span>
                      <span className="hotspotMetricChip">相关性 {signal.relevanceScore}</span>
                      <span className="hotspotMetricChip">行业性 {signal.industryScore}</span>
                      <span className="hotspotMetricChip">速度 {signal.velocityScore}</span>
                      <span className="hotspotMetricChip">排序分 {signal.priorityScore}</span>
                      <span className="hotspotMetricChip">建议 {getActionLabel(signal.recommendedAction)}</span>
                    </div>

                    <p className="muted hotspotSourceHint">
                      当前命中来源：{selectedSourceLabels.join(" / ")} · 来源链路：{sourceTypeSummary.join(" / ")}
                    </p>

                    <div className="hotspotLinkRow">
                      <a
                        className="buttonLike subtleButton hotspotDetailLink"
                        href={signal.sourceUrl ?? buildFallbackSearchUrl(signal.title, sourceRecords)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {signal.sourceUrl ? "查看原文" : "搜索详情"}
                      </a>
                      <span className="muted">
                        {signal.sourceUrl ? "原始来源" : "按标题搜索"}
                      </span>
                    </div>

                    <details className="hotspotBoardDetails">
                      <summary>展开判断信息</summary>
                      <div className="reviewContextCopy hotspotBoardDetailsBody">
                        <p>
                          <strong>全部命中来源：</strong>
                          {sourceRecords
                            .map(
                              (record) =>
                                `${record.displayLabel}（${getFamilyLabel(record.family)} · ${getSourceTypeLabel(
                                  record.sourceType,
                                  record.providerId
                                )}）`
                            )
                            .join(" / ")}
                        </p>
                        <div className="hotspotDetailSourceLinks">
                          {sourceRecords.map((record) => (
                            <a
                              className="tag"
                              href={buildFallbackSearchUrl(signal.title, [record])}
                              key={`${signal.id}-${record.displayLabel}-${record.providerId ?? record.label}`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              看 {record.displayLabel} 详情
                            </a>
                          ))}
                        </div>
                        <p>
                          <strong>为什么值得看：</strong>
                          {truncateDisplayText(
                            signal.reasons[0] ?? "已命中当前抓取规则，值得人工判断是否立题。",
                            72
                          )}
                        </p>
                        <p>
                          <strong>品牌结合提示：</strong>
                          {truncateDisplayText(
                            signal.reasons[1] ?? `优先把这条热点往 ${brand.name} 的真实产品场景和传播角度上收。`,
                            72
                          )}
                        </p>
                        <HotspotInsightTrigger hotspotId={signal.id} />
                      </div>
                    </details>
                  </div>

                  <div className="hotspotBoardActions">
                    <HotspotActionButton
                      hotspotId={signal.id}
                      packId={existingPack?.packId}
                      platform={existingPack?.platform}
                      variantId={existingPack?.variantId}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="reviewSimpleSection hotspotBoardSection">
          <EmptyStateCard
            description="当前筛选下暂无热点。"
            eyebrow="热点看板"
            title="暂无热点"
          />
        </section>
      )}

      <BackToTopButton />
    </div>
  );
}
