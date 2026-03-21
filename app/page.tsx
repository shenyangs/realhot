import Link from "next/link";
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

export default async function HomePage() {
  const [brand, prioritized, packs] = await Promise.all([
    getBrandStrategyPack(),
    getPrioritizedHotspots(),
    getReviewQueue()
  ]);

  const focusHotspots = prioritized.slice(0, 5);
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
      <section className="workbenchHero">
        <div className="heroCopy">
          <p className="eyebrow">今日选题台</p>
          <h2>先判断今天值不值得做，再把选题快速推进到可发状态。</h2>
          <p className="muted heroText">
            已按 {brand.name} 的行业方向、品牌边界和近期动态，整理出今天最值得处理的热点机会与选题任务。
          </p>
        </div>
        <div className="heroMeta">
          <div className="metaPill">
            <span>当前品牌</span>
            <strong>{brand.name}</strong>
          </div>
          <div className="metaPill">
            <span>重点平台</span>
            <strong>小红书 / 公众号 / 视频号 / 抖音</strong>
          </div>
          <div className="metaPill">
            <span>今日节奏</span>
            <strong>{focusHotspots.length} 个机会，{tasks.length} 个选题在推进</strong>
          </div>
        </div>
      </section>

      <section className="workbenchToolbar panel">
        <div className="toolbarFilters">
          <div className="toolbarGroup">
            <span className="toolbarLabel">品牌</span>
            <strong>{brand.name}</strong>
          </div>
          <div className="toolbarGroup">
            <span className="toolbarLabel">平台</span>
            <strong>全部平台</strong>
          </div>
          <div className="toolbarGroup">
            <span className="toolbarLabel">状态</span>
            <strong>全部状态</strong>
          </div>
          <div className="toolbarGroup">
            <span className="toolbarLabel">时间</span>
            <strong>最近 24 小时</strong>
          </div>
        </div>
        <div className="toolbarActions">
          <Link className="buttonLike subtleButton" href="/hotspots">
            同步热点
          </Link>
          <Link className="buttonLike primaryButton" href="/review">
            批量生成
          </Link>
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

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">今天值得做</p>
            <h3>先选机会，再转成选题</h3>
          </div>
          <Link className="sectionLink" href="/hotspots">
            进入热点机会池
          </Link>
        </div>

        <div className="opportunityRail">
          {focusHotspots.map((signal) => (
            <article className="opportunityCard" key={signal.id}>
              <div className="opportunityHeader">
                <span className={`pill pill-${signal.recommendedAction === "ship-now" ? "positive" : "warning"}`}>
                  {signal.recommendedAction === "ship-now" ? "建议立刻跟进" : "建议继续观察"}
                </span>
                <small className="muted">{signal.detectedAt}</small>
              </div>

              <div className="stack compactStack">
                <h3>{signal.title}</h3>
                <p className="muted">{signal.summary}</p>
              </div>

              <div className="opportunityFacts">
                <div>
                  <span>为什么相关</span>
                  <strong>{signal.reasons[0] ?? "已命中品牌主题词与近期传播方向"}</strong>
                </div>
                <div>
                  <span>建议角度</span>
                  <strong>{getRecommendedAngle(signal.kind)}</strong>
                </div>
                <div>
                  <span>时效窗口</span>
                  <strong>{getOpportunityWindow(signal.velocityScore)}</strong>
                </div>
              </div>

              <div className="opportunityFooter">
                <span className="sourceLabel">{signal.source}</span>
                <Link className="buttonLike subtleButton" href="/hotspots">
                  去处理这个机会
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">正在推进的选题任务</p>
            <h3>把今天该做的题推进到可审、可发</h3>
          </div>
          <Link className="sectionLink" href="/review">
            进入选题与审核
          </Link>
        </div>

        <div className="taskTable">
          <div className="taskRow taskHead">
            <span>选题</span>
            <span>来源热点</span>
            <span>平台</span>
            <span>类型</span>
            <span>状态</span>
            <span>内容进度</span>
            <span>最佳发布时间</span>
            <span>负责人</span>
            <span>操作</span>
          </div>
          {tasks.map((task) => (
            <div className="taskRow" key={task.id}>
              <div className="taskTitleCell">
                <strong>{task.title}</strong>
              </div>
              <span className="muted">{task.source}</span>
              <span>{task.platforms}</span>
              <span>{task.type}</span>
              <span>
                <span className={`pill pill-${task.packStatus === "approved" ? "positive" : task.packStatus === "needs-edit" ? "warning" : "neutral"}`}>
                  {task.status}
                </span>
              </span>
              <span>{task.progress}</span>
              <span>{task.publishWindow}</span>
              <span>{task.owner}</span>
              <div className="taskActions">
                <Link className="tableAction" href={`/review?pack=${task.packId}&variant=${task.id}`}>
                  查看草稿
                </Link>
                <Link className="tableAction mutedAction" href="/brands">
                  看品牌规则
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="queueGrid">
        <article className="panel queuePanel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">待审核</p>
              <h3>先清会影响今天节奏的稿件</h3>
            </div>
            <Link className="sectionLink" href={reviewItems[0] ? `/review?pack=${reviewItems[0].packId}&variant=${reviewItems[0].id}` : "/review"}>
              去审核
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
            <Link className="sectionLink" href={publishItems[0] ? `/review?pack=${publishItems[0].packId}&variant=${publishItems[0].id}` : "/review"}>
              去发布链路
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
