import Link from "next/link";
import { EmptyStateCard } from "@/components/empty-state-card";
import { HotspotActionButton } from "@/components/hotspot-action-button";
import { getBrandStrategyPack, getHotspotSignals, getReviewQueue } from "@/lib/data";
import type { HotspotKind } from "@/lib/domain/types";

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

function parseSourceLabels(source: string) {
  const sourcePart = source.includes(" / ") ? source.split(" / ")[0] : source;

  return sourcePart
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAnchorId(index: number) {
  return `source-group-${index + 1}`;
}

export default async function HotspotsPage() {
  const [brand, hotspots, packs] = await Promise.all([
    getBrandStrategyPack(),
    getHotspotSignals(),
    getReviewQueue()
  ]);

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

  const groupMap = new Map<string, typeof hotspots>();

  for (const hotspot of hotspots) {
    const labels = parseSourceLabels(hotspot.source);

    for (const label of labels.length > 0 ? labels : ["未标注信源"]) {
      const current = groupMap.get(label) ?? [];
      current.push(hotspot);
      groupMap.set(label, current);
    }
  }

  const sourceGroups = Array.from(groupMap.entries())
    .map(([label, items]) => ({
      label,
      items: items.sort((left, right) => {
        const timeGap = Date.parse(right.detectedAt) - Date.parse(left.detectedAt);

        if (!Number.isNaN(timeGap) && timeGap !== 0) {
          return timeGap;
        }

        return right.velocityScore - left.velocityScore;
      })
    }))
    .sort((left, right) => {
      if (right.items.length !== left.items.length) {
        return right.items.length - left.items.length;
      }

      return left.label.localeCompare(right.label, "zh-Hans-CN");
    });

  return (
    <div className="page hotspotBoardPage">
      <section className="reviewFlatHeader">
        <div>
          <p className="eyebrow">热点看板</p>
          <h2>这里只展示我们实际抓到的全部热点，按信源分类全量摊开。</h2>
          <p className="muted">
            这个页面不替操作者做选择，只负责把热源、平台和抓取结果完整展示出来。重复出现在多个信源分组，代表它被交叉命中。
          </p>
        </div>
        <div className="reviewFlatMeta">
          <span className="reviewInlineMeta">当前品牌：{brand.name}</span>
          <span className="reviewInlineMeta">累计热点：{hotspots.length} 条</span>
          <span className="reviewInlineMeta">信源分组：{sourceGroups.length} 组</span>
          <span className="reviewInlineMeta">已进入生产：{packs.length} 条</span>
        </div>
      </section>

      <nav className="reviewModuleBar" aria-label="hotspot-board-modules">
        <Link className="reviewModuleChip" href="/">
          回今日选题台
        </Link>
        <Link className="reviewModuleChip" href="/review">
          去选题库
        </Link>
        <Link className="reviewModuleChip" href="/brands">
          看品牌与规则
        </Link>
      </nav>

      <section className="reviewSimpleSection">
        <div className="reviewSimpleHeader">
          <div>
            <p className="eyebrow">信源导航</p>
            <h3>按抓取来源查看全部热点</h3>
          </div>
          <span className="muted">点击分组可直接跳转</span>
        </div>

        {sourceGroups.length > 0 ? (
          <div className="reviewFilterRow">
            {sourceGroups.map((group, index) => (
              <a className="filterChip" href={`#${buildAnchorId(index)}`} key={group.label}>
                {group.label}
                <strong>{group.items.length}</strong>
              </a>
            ))}
          </div>
        ) : null}
      </section>

      {sourceGroups.length > 0 ? (
        sourceGroups.map((group, index) => (
          <section
            className="reviewSimpleSection hotspotBoardSection"
            id={buildAnchorId(index)}
            key={group.label}
          >
            <div className="reviewSimpleHeader">
              <div>
                <p className="eyebrow">信源分组</p>
                <h3>{group.label}</h3>
              </div>
              <span className="muted">共 {group.items.length} 条热点</span>
            </div>

            <div className="hotspotBoardList">
              {group.items.map((signal) => {
                const existingPack = packByHotspotId.get(signal.id);
                const sourceLabels = parseSourceLabels(signal.source);

                return (
                  <article className="hotspotBoardRow" key={`${group.label}-${signal.id}`}>
                    <div className="hotspotBoardMain">
                      <div className="tagRow">
                        <span className="tag">{getKindLabel(signal.kind)}</span>
                        <span className="tag">交叉命中 {sourceLabels.length} 个信源</span>
                        {existingPack ? <span className="pill pill-neutral">已进入生产</span> : null}
                      </div>

                      <h3>{signal.title}</h3>
                      <p className="muted">{signal.summary}</p>

                      <div className="reviewContextLine">
                        <span>抓取时间：{signal.detectedAt}</span>
                        <span>相关性：{signal.relevanceScore}</span>
                        <span>行业性：{signal.industryScore}</span>
                        <span>速度：{signal.velocityScore}</span>
                        <span>风险：{signal.riskScore}</span>
                        <span>系统建议：{getActionLabel(signal.recommendedAction)}</span>
                      </div>

                      <div className="reviewContextCopy">
                        <p>
                          <strong>全部命中信源：</strong>
                          {sourceLabels.join(" / ")}
                        </p>
                        <p>
                          <strong>为什么值得看：</strong>
                          {signal.reasons[0] ?? "已命中当前抓取规则，值得人工判断是否立题。"}
                        </p>
                        <p>
                          <strong>建议切入：</strong>
                          {signal.reasons[1] ?? "可结合品牌语境判断是否转成快反或观点内容。"}
                        </p>
                      </div>
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
        ))
      ) : (
        <section className="reviewSimpleSection hotspotBoardSection">
          <EmptyStateCard
            description="当前还没有抓到热点。你可以先执行同步，或者补充品牌资料与热源规则。"
            eyebrow="热点看板"
            title="这里暂时没有可展示的热点"
          />
        </section>
      )}
    </div>
  );
}
