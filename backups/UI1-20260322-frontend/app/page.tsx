import Link from "next/link";
import { EmptyStateCard } from "@/components/empty-state-card";
import { HotspotActionButton } from "@/components/hotspot-action-button";
import {
  getBrandStrategyPack,
  getPrioritizedHotspots,
  getReviewQueue
} from "@/lib/data";
import type { ContentTrack, Platform, ReviewStatus } from "@/lib/domain/types";

const platformLabels: Record<Platform, string> = {
  xiaohongshu: "小红书",
  wechat: "公众号",
  "video-channel": "视频号",
  douyin: "抖音"
};

const trackLabels: Record<ContentTrack, string> = {
  "rapid-response": "快反",
  "point-of-view": "观点"
};

const statusLabels: Record<ReviewStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  "needs-edit": "待改稿"
};

function getOpportunityWindow(velocityScore: number) {
  if (velocityScore >= 85) {
    return "建议 4 小时内立题";
  }

  if (velocityScore >= 75) {
    return "建议今天内完成首稿";
  }

  return "可继续观察，适合沉淀观点";
}

function getRecommendedAngle(kind: "industry" | "mass" | "brand") {
  if (kind === "industry") {
    return "行业判断 + 品牌方法";
  }

  if (kind === "mass") {
    return "平台变化 + 内容策略";
  }

  return "差异化观点 + 品牌站位";
}

function getProgressLabel(platformCount: number, status: ReviewStatus) {
  if (status === "approved") {
    return `${platformCount}/${platformCount} 已通过`;
  }

  if (status === "needs-edit") {
    return `已生成 ${platformCount} 个版本，待修改`;
  }

  return `已生成 ${platformCount} 个版本，待审核`;
}

function formatOpportunityTime(value: string) {
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

export default async function HomePage() {
  const [brand, prioritized, packs] = await Promise.all([
    getBrandStrategyPack(),
    getPrioritizedHotspots(),
    getReviewQueue()
  ]);

  const focusHotspots = prioritized.slice(0, 5);
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
  const tasks = packs.flatMap((pack) =>
    pack.variants.map((variant) => ({
      id: variant.id,
      packId: pack.id,
      title: variant.title,
      source: focusHotspots.find((signal) => signal.id === pack.hotspotId)?.title ?? pack.whyNow,
      platforms: variant.platforms.map((platform) => platformLabels[platform]).join(" / "),
      type: trackLabels[variant.track],
      status: statusLabels[pack.status],
      progress: getProgressLabel(variant.platforms.length, pack.status),
      publishWindow: variant.publishWindow,
      owner: pack.reviewOwner,
      packStatus: pack.status
    }))
  );

  const reviewItems = tasks.filter((task) => task.packStatus === "pending").slice(0, 4);
  const publishItems = tasks.filter((task) => task.packStatus === "approved").slice(0, 4);
  const needsEditCount = tasks.filter((task) => task.packStatus === "needs-edit").length;

  return (
    <div className="page workbenchPage">
      <section className="panel pageIntro">
        <div className="pageIntroHeader">
          <div className="heroCopy">
            <p className="eyebrow">今日选题台</p>
            <h2>今日选题台</h2>
            <p className="muted heroText">
              查看今天优先处理的热点机会和正在推进的选题任务。
            </p>
          </div>
          <div className="buttonRow">
            <Link className="buttonLike subtleButton" href="/hotspots">
              看全部热点
            </Link>
            <Link className="buttonLike primaryButton" href="/review">
              进入选题库
            </Link>
            <Link className="buttonLike subtleButton" href="/onboarding">
              新品牌接入
            </Link>
          </div>
        </div>
        <div className="pageIntroFacts">
          <div>
            <span>当前品牌</span>
            <strong>{brand.name}</strong>
          </div>
          <div>
            <span>重点平台</span>
            <strong>小红书 / 公众号 / 视频号 / 抖音</strong>
          </div>
          <div>
            <span>今日节奏</span>
            <strong>{focusHotspots.length} 个机会，{tasks.length} 个选题在推进</strong>
          </div>
        </div>
      </section>

      <section className="summaryGrid">
        <article className="panel summaryCard">
          <p className="eyebrow">今天值得做</p>
          <h3>{focusHotspots.length} 个热点机会已排优先级</h3>
          <p className="muted">优先看行业热点，再看大众热点，避免把精力花在低相关噪音上。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">正在生产</p>
          <h3>{tasks.length} 个选题任务在流转</h3>
          <p className="muted">按选题推进，不按技术模块切换，减少来回跳页和理解成本。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">今日堵点</p>
          <h3>{reviewItems.length} 个待审核，{needsEditCount} 个待改稿</h3>
          <p className="muted">先清影响发布节奏的卡点，再继续开新题，首页只展示今天必须处理的出口。</p>
        </article>
      </section>

      <section className="panel helperPanel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">第一次试用</p>
            <h3>先按这 3 步走，最快看到完整链路</h3>
          </div>
          <Link className="sectionLink" href="/hotspots">
            从热点看板开始
          </Link>
        </div>
        <div className="definitionList">
          <div>
            <span>第 1 步</span>
            <strong>去热点看板，点“转成 4 条内容”，先生成一个选题任务。</strong>
          </div>
          <div>
            <span>第 2 步</span>
            <strong>进入选题库，在中间编辑区改稿，右侧完成审核通过。</strong>
          </div>
          <div>
            <span>第 3 步</span>
            <strong>到发布台把内容送进队列，再执行发布，确认出口跑通。</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">今天值得做</p>
            <h3>先选机会，再转成选题</h3>
          </div>
          <Link className="sectionLink" href="/hotspots">
            打开热点看板
          </Link>
        </div>

        <div className="opportunityRail">
          {focusHotspots.length > 0 ? (
            focusHotspots.map((signal) => {
              const existingPack = packByHotspotId.get(signal.id);

              return (
                <article className="opportunityCard" key={signal.id}>
                <div className="opportunityHeader">
                  <span className={`pill pill-${signal.recommendedAction === "ship-now" ? "positive" : "warning"}`}>
                    {signal.recommendedAction === "ship-now" ? "建议立刻跟进" : "建议继续观察"}
                  </span>
                  <small className="muted opportunityTime">{formatOpportunityTime(signal.detectedAt)}</small>
                </div>

                <div className="stack compactStack">
                  <h3 className="opportunityTitle">{signal.title}</h3>
                  <p className="muted opportunitySummary">{signal.summary}</p>
                </div>

                <div className="opportunityFacts">
                  <div>
                    <span>为什么相关</span>
                    <strong className="opportunityFactValue">{signal.reasons[0] ?? "已命中品牌主题词与近期传播方向"}</strong>
                  </div>
                  <div>
                    <span>建议角度</span>
                    <strong className="opportunityFactValue">{getRecommendedAngle(signal.kind)}</strong>
                  </div>
                  <div>
                    <span>时效窗口</span>
                    <strong className="opportunityFactValue">{getOpportunityWindow(signal.velocityScore)}</strong>
                  </div>
                </div>

                <div className="opportunityFooter">
                  <span className="sourceLabel">{signal.source}</span>
                  <div className="buttonRow">
                    <HotspotActionButton
                      hotspotId={signal.id}
                      packId={existingPack?.packId}
                      platform={existingPack?.platform}
                      variantId={existingPack?.variantId}
                    />
                    <Link className="buttonLike subtleButton" href="/hotspots">
                      进入机会判断
                    </Link>
                  </div>
                </div>
                </article>
              );
            })
          ) : (
            <EmptyStateCard
              actionLabel="去品牌与规则补资料"
              description="还没有抓到适合今天处理的热点。先补品牌资料或刷新热点机会，再回来决定今天做什么。"
              eyebrow="热点机会"
              href="/brands"
              title="今天还没有可立刻处理的热点机会"
            />
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">正在推进的选题任务</p>
            <h3>把今天该做的题推进到可审、可发</h3>
          </div>
          <Link className="sectionLink" href="/review">
            进入选题库
          </Link>
        </div>

        {tasks.length > 0 ? (
          <div className="reviewTaskListSimple">
            {tasks.map((task) => (
              <article className="reviewTaskRow" key={task.id}>
                <div className="reviewTaskRowMain">
                  <strong className="reviewTaskTitle">{task.title}</strong>
                  <p className="muted reviewTaskSummary">{task.source}</p>
                  <div className="reviewContextLine">
                    <span>{task.platforms}</span>
                    <span>{task.type}</span>
                    <span>{task.publishWindow}</span>
                    <span>{task.owner}</span>
                  </div>
                </div>
                <div className="reviewTaskRowMeta">
                  <span
                    className={`pill pill-${task.packStatus === "approved" ? "positive" : task.packStatus === "needs-edit" ? "warning" : "neutral"}`}
                  >
                    {task.status}
                  </span>
                  <small className="muted">{task.progress}</small>
                  <div className="buttonRow">
                    <Link className="buttonLike subtleButton" href={`/review?pack=${task.packId}&variant=${task.id}`}>
                      进入编辑
                    </Link>
                    <Link className="buttonLike subtleButton" href="/brands">
                      品牌规则
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="taskEmptyRow">
            <EmptyStateCard
              actionLabel="去热点看板挑题"
              description="当前还没有选题任务进入生产。你可以先从热点看板挑一个题，转进今天的生产流程。"
              eyebrow="选题任务"
              href="/hotspots"
              title="今天还没有正在推进的选题"
            />
          </div>
        )}
      </section>

      <section className="queueGrid">
        <article className="panel queuePanel">
          <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">待审核</p>
            <h3>先清会影响今天节奏的稿件</h3>
          </div>
          <Link className="sectionLink" href={reviewItems[0] ? `/review?pack=${reviewItems[0].packId}&variant=${reviewItems[0].id}` : "/review"}>
            进入选题库
          </Link>
          </div>

          <div className="queueList">
            {reviewItems.length > 0 ? (
              reviewItems.map((item) => (
                <div className="queueItem" key={`review-${item.id}`}>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="muted">{item.owner} · {item.publishWindow}</p>
                  </div>
                  <span className="pill pill-warning">待审核</span>
                </div>
              ))
            ) : (
              <p className="emptyState">今天没有堆积在审核口的内容，可以继续推进新选题。</p>
            )}
          </div>
        </article>

        <article className="panel queuePanel">
          <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">待发布</p>
            <h3>只看今天真正能出街的内容</h3>
          </div>
          <Link className="sectionLink" href="/publish">
            进入发布台
          </Link>
          </div>

          <div className="queueList">
            {publishItems.length > 0 ? (
              publishItems.map((item) => (
                <div className="queueItem" key={`publish-${item.id}`}>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="muted">{item.platforms} · {item.publishWindow}</p>
                  </div>
                  <span className="pill pill-positive">待发布</span>
                </div>
              ))
            ) : (
              <p className="emptyState">当前还没有通过终审的内容，先把上面的选题推进到可发布状态。</p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
