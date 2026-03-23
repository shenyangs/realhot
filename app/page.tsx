import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HotspotActionButton } from "@/components/hotspot-action-button";
import { PageHero } from "@/components/page-hero";
import { PageRefreshButton } from "@/components/page-refresh-button";
import { getCurrentViewer } from "@/lib/auth/session";
import {
  getBrandStrategyPack,
  getLatestHotspotSyncSnapshot,
  getPrioritizedHotspots,
  getPublishJobsForPack,
  getReviewQueue
} from "@/lib/data";
import type { Platform } from "@/lib/domain/types";
import { getHomepageMoment } from "@/lib/services/homepage-moment";

const platformLabels: Record<Platform, string> = {
  xiaohongshu: "小红书",
  wechat: "公众号",
  "video-channel": "视频号",
  douyin: "抖音"
};

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

function getWindowLabel(velocityScore: number) {
  if (velocityScore >= 85) {
    return "4 小时内完成立题";
  }

  if (velocityScore >= 75) {
    return "今天内完成首稿";
  }

  return "可继续观察";
}

function getPriorityTone(priority: "high" | "medium" | "low") {
  if (priority === "high") {
    return "warning";
  }

  if (priority === "medium") {
    return "neutral";
  }

  return "positive";
}

function getFailureSummary(reason?: string) {
  if (!reason) {
    return "系统返回执行失败";
  }

  if (reason.includes("权限") || reason.includes("登录")) {
    return "账号或权限异常";
  }

  if (reason.includes("频率") || reason.includes("限流")) {
    return "平台限流";
  }

  return reason;
}

export default async function HomePage() {
  const viewer = await getCurrentViewer();
  const isTrialAccess = viewer.effectiveRole === "trial_guest";

  if (viewer.isPlatformAdmin && !viewer.currentWorkspace) {
    if (viewer.memberships.length > 0) {
      redirect("/select-workspace");
    }

    redirect("/admin");
  }

  if (!viewer.isPlatformAdmin && viewer.isAuthenticated && viewer.memberships.length > 1 && !viewer.currentWorkspace) {
    redirect("/select-workspace");
  }

  const [brand, prioritized, packs, syncSnapshot, homepageMoment] = await Promise.all([
    getBrandStrategyPack(),
    getPrioritizedHotspots(),
    getReviewQueue(),
    getLatestHotspotSyncSnapshot(),
    getHomepageMoment()
  ]);

  const packJobs = await Promise.all(
    packs.map(async (pack) => ({
      pack,
      jobs: await getPublishJobsForPack(pack.id)
    }))
  );

  const pendingPacks = packs.filter((pack) => pack.status === "pending");
  const needsEditPacks = packs.filter((pack) => pack.status === "needs-edit");
  const approvedPacks = packs.filter((pack) => pack.status === "approved");
  const allJobs = packJobs.flatMap(({ pack, jobs }) =>
    jobs.map((job) => {
      const variant = pack.variants.find((item) => item.id === job.variantId);

      return {
        ...job,
        reviewOwner: pack.reviewOwner,
        title: variant?.title ?? pack.whyNow,
        publishWindow: variant?.publishWindow ?? "未设置",
        platforms: variant?.platforms ?? []
      };
    })
  );

  const failedJobs = allJobs.filter((job) => job.status === "failed");
  const recentPublishedJob = [...allJobs]
    .filter((job) => job.status === "published")
    .sort((left, right) => Date.parse(right.publishedAt ?? right.updatedAt) - Date.parse(left.publishedAt ?? left.updatedAt))[0];
  const recentFailedJob = [...failedJobs].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  const highPotentialHotspots = prioritized.filter((item) => item.priorityScore >= 75);
  const focusHotspots = prioritized.slice(0, 3);
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

  const primaryQueue = [
    pendingPacks.length > 0
      ? {
          title: "先清待审核",
          description: `${pendingPacks.length} 条内容卡在审核口，优先释放下游。`,
          href: "/review" as Route,
          actionLabel: "去审核",
          priority: "high" as const
        }
      : null,
    needsEditPacks.length > 0
      ? {
          title: "再处理退回改稿",
          description: `${needsEditPacks.length} 条内容等待改稿后重新提交。`,
          href: "/review?status=needs-edit" as Route,
          actionLabel: "继续处理",
          priority: "high" as const
        }
      : null,
    failedJobs.length > 0
      ? {
          title: "排查发布异常",
          description: `${failedJobs.length} 条发布失败，最大风险在执行侧。`,
          href: "/publish" as Route,
          actionLabel: "进入发布",
          priority: "high" as const
        }
      : null,
    highPotentialHotspots.length > 0
      ? {
          title: "补充高潜选题",
          description: `${highPotentialHotspots.length} 条热点还在窗口期内，可继续转题。`,
          href: "/hotspots" as Route,
          actionLabel: "查看机会",
          priority: "medium" as const
        }
      : null
  ]
    .filter(Boolean)
    .slice(0, 3) as Array<{
    title: string;
    description: string;
    href: Route;
    actionLabel: string;
    priority: "high" | "medium" | "low";
  }>;

  const heroPrimaryHref =
    (pendingPacks.length > 0
      ? "/review"
      : failedJobs.length > 0
        ? "/publish"
        : highPotentialHotspots.length > 0
          ? "/hotspots"
          : "/brands") as Route;
  const heroPrimaryLabel =
    pendingPacks.length > 0
      ? "先去审核台"
      : failedJobs.length > 0
        ? "去发布中心"
        : highPotentialHotspots.length > 0
          ? "去看热点机会"
          : "完善品牌底盘";

  return (
    <div className="page workbenchPageV2">
      <section className="panel homeTopMomentBar" aria-label="今日时间与箴言">
        <div className="homeTopMomentDate">
          <span className="homeTopMomentBadge">{homepageMoment.weekdayLabel}</span>
          <strong>{homepageMoment.dateLabel}</strong>
        </div>

        <div className="homeTopMomentDivider" aria-hidden="true" />

        <div className="homeTopMomentQuote">
          <span className="homeTopMomentLabel">今日箴言</span>
          <p>{homepageMoment.quote}</p>
        </div>

        <p className="homeTopMomentSource">{homepageMoment.source}</p>
      </section>

      <section className="panel brandWorkbenchCard">
        <div className="brandWorkbenchHead">
          <div>
            <p className="eyebrow">品牌底盘</p>
            <h2>{brand.name}</h2>
            <p className="muted">先把品牌定位、语调和表达边界定清楚，后面的热点判断和内容制作才不会跑偏。</p>
          </div>
          <div className="brandWorkbenchActions">
            <Link className="buttonLike primaryButton" href="/brands">
              打开品牌底盘
            </Link>
            <span className="pill pill-neutral">{brand.sector}</span>
          </div>
        </div>

        <div className="brandWorkbenchMeta">
          <div className="brandWorkbenchStat">
            <span>当前服务品牌</span>
            <strong>{brand.name}</strong>
          </div>
          <div className="brandWorkbenchStat">
            <span>品牌语气</span>
            <strong>{brand.tone.slice(0, 2).join(" / ") || "待补充"}</strong>
          </div>
          <div className="brandWorkbenchStat">
            <span>近期重点</span>
            <strong>{brand.recentMoves[0] ?? "待补充最近动态"}</strong>
          </div>
        </div>
      </section>

      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href={heroPrimaryHref}>
              {heroPrimaryLabel}
            </Link>
            <Link className="buttonLike subtleButton" href="/publish">
              去发布中心
            </Link>
            <Link className="buttonLike subtleButton" href="/brands">
              查看品牌底盘
            </Link>
          </>
        }
        context={brand.name}
        description="先看当前卡在哪一步，再决定今天先处理什么。这里不是功能总控台，而是你的今日工作入口。"
        eyebrow="首页"
        facts={[
          { label: "今日核心任务", value: `${pendingPacks.length + needsEditPacks.length + failedJobs.length} 项` },
          { label: "待审核", value: `${pendingPacks.length} 条` },
          { label: "待改稿", value: `${needsEditPacks.length} 条` },
          { label: "高优热点", value: `${highPotentialHotspots.length} 条` },
          { label: "发布异常", value: `${failedJobs.length} 条` },
          { label: "最近同步", value: formatDateTime(syncSnapshot?.executedAt) }
        ]}
        title="今天先处理什么"
        variant="utility"
      />

      <div className="workbenchCoreGrid">
        <section className="panel commandBoardCard">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">今日优先处理</p>
              <h2>按这个顺序推进</h2>
            </div>
          </div>

          <div className="priorityCommandList">
            {primaryQueue.length > 0 ? (
              primaryQueue.map((item, index) => (
                <article className="priorityCommandItem" key={`${item.title}-${index}`}>
                  <div className="priorityCommandMeta">
                    <span className={`pill pill-${getPriorityTone(item.priority)}`}>{index + 1 < 10 ? `0${index + 1}` : index + 1}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p className="muted">{item.description}</p>
                    </div>
                  </div>
                  <Link className="buttonLike subtleButton" href={item.href}>
                    {item.actionLabel}
                  </Link>
                </article>
              ))
            ) : (
              <article className="priorityCommandItem priorityCommandItemQuiet">
                <div>
                  <strong>当前主链路运行平稳</strong>
                  <p className="muted">审核和发布都没有堆积，现在更适合继续从热点机会里补充新选题。</p>
                </div>
                <Link className="buttonLike subtleButton" href="/hotspots">
                  打开热点机会
                </Link>
              </article>
            )}
          </div>
        </section>

        <section className="panel commandBoardCard">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">待审核任务</p>
              <h2>先释放下游</h2>
            </div>
            <Link className="sectionLink" href="/review">
              去审核
            </Link>
          </div>

          <div className="decisionList">
            {pendingPacks.length > 0 ? (
              pendingPacks.slice(0, 3).map((pack) => {
                const primaryVariant = pack.variants[0];

                return (
                  <Link className="decisionListItem" href={`/review?pack=${pack.id}&variant=${primaryVariant?.id ?? ""}`} key={pack.id}>
                    <div>
                      <strong>{primaryVariant?.title ?? pack.whyNow}</strong>
                      <p className="muted">
                        {pack.reviewOwner} · {primaryVariant?.publishWindow ?? "未设置窗口"}
                      </p>
                    </div>
                    <span className="pill pill-warning">待审核</span>
                  </Link>
                );
              })
            ) : (
              <div className="systemFeedbackCard">
                <strong>审核队列当前为空</strong>
                <p className="muted">最近一次同步：{formatDateTime(syncSnapshot?.executedAt)}。现在更适合继续补题或推进已通过内容。</p>
              </div>
            )}
          </div>
        </section>

        <section className="panel commandBoardCard">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">高潜机会</p>
              <h2>不读长文也能判断</h2>
            </div>
            <div className="panelHeaderActions">
              <PageRefreshButton label="刷新" />
              <Link className="sectionLink" href="/hotspots">
                查看详情
              </Link>
            </div>
          </div>

          <div className="compactOpportunityList">
            {focusHotspots.length > 0 ? (
              focusHotspots.map((signal) => {
                const existingPack = packByHotspotId.get(signal.id);

                return (
                  <article className="compactOpportunityCard" key={signal.id}>
                    <div className="compactOpportunityHead">
                      <span className="pill pill-neutral">热度 {signal.velocityScore}</span>
                      <span className={`pill pill-${signal.riskScore <= 35 ? "positive" : signal.riskScore <= 55 ? "neutral" : "warning"}`}>
                        风险 {signal.riskScore}
                      </span>
                    </div>
                    <h3>{signal.title}</h3>
                    <div className="compactOpportunityMeta">
                      <span>品牌相关 {signal.brandFitScore}</span>
                      <span>窗口 {getWindowLabel(signal.velocityScore)}</span>
                    </div>
                    <p className="muted">{signal.reasons[0] ?? "已命中品牌主题，可快速进入立题判断。"}</p>
                    <div className="compactOpportunityFooter">
                      <HotspotActionButton
                        hotspotId={signal.id}
                        packId={existingPack?.packId}
                        platform={existingPack?.platform}
                        readOnly={isTrialAccess}
                        variantId={existingPack?.variantId}
                      />
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="systemFeedbackCard">
                <strong>当前没有高优热点</strong>
                <p className="muted">建议下一步：去品牌底盘补充近期动态，提升热点相关性判断命中率。</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="workbenchSecondaryGrid">
        <section className="panel secondaryBoardCard">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">当前堵点</p>
              <h3>最大的风险在哪</h3>
            </div>
          </div>

          <div className="statusFeedList">
            <div className="statusFeedItem">
              <span>待改稿</span>
              <strong>{needsEditPacks.length} 条</strong>
            </div>
            <div className="statusFeedItem">
              <span>发布失败</span>
              <strong>{failedJobs.length} 条</strong>
            </div>
            <div className="statusFeedItem">
              <span>最近失败原因</span>
              <strong>{getFailureSummary(recentFailedJob?.failureReason)}</strong>
            </div>
          </div>
        </section>

        <section className="panel secondaryBoardCard">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">生产负载</p>
              <h3>当前流转状态</h3>
            </div>
          </div>

          <div className="statusFeedList">
            <div className="statusFeedItem">
              <span>待审核</span>
              <strong>{pendingPacks.length} 条</strong>
            </div>
            <div className="statusFeedItem">
              <span>已通过</span>
              <strong>{approvedPacks.length} 条</strong>
            </div>
            <div className="statusFeedItem">
              <span>涉及平台</span>
              <strong>
                {Array.from(new Set(packs.flatMap((pack) => pack.variants.flatMap((variant) => variant.platforms))))
                  .map((platform) => platformLabels[platform])
                  .join(" / ") || "未开始"}
              </strong>
            </div>
          </div>
        </section>

        <section className="panel secondaryBoardCard">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">运行反馈</p>
              <h3>系统最近一次动作</h3>
            </div>
          </div>

          <div className="statusFeedList">
            <div className="statusFeedItem">
              <span>最近同步</span>
              <strong>{formatDateTime(syncSnapshot?.executedAt)}</strong>
            </div>
            <div className="statusFeedItem">
              <span>最近发布</span>
              <strong>{recentPublishedJob ? formatDateTime(recentPublishedJob.publishedAt ?? recentPublishedJob.updatedAt) : "暂无发布动作"}</strong>
            </div>
            <div className="statusFeedItem">
              <span>最近失败</span>
              <strong>{recentFailedJob ? formatDateTime(recentFailedJob.updatedAt) : "当前无失败任务"}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="summaryGrid adminSummaryGrid">
        <article className="panel summaryCard summaryCardElevated">
          <p className="eyebrow">第 1 步</p>
          <h3>热点机会</h3>
          <p className="muted">先筛今天值得跟的机会，不急着立刻写内容。</p>
        </article>
        <article className="panel summaryCard summaryCardElevated">
          <p className="eyebrow">第 2 步</p>
          <h3>审核台</h3>
          <p className="muted">把热点转成选题包后，在这里判断方向值不值得进入生产。</p>
        </article>
        <article className="panel summaryCard summaryCardElevated">
          <p className="eyebrow">第 3 步</p>
          <h3>内容制作</h3>
          <p className="muted">通过审核后，再把方案做成最终可发布的内容版本。</p>
        </article>
        <article className="panel summaryCard summaryCardElevated">
          <p className="eyebrow">第 4 步</p>
          <h3>发布中心</h3>
          <p className="muted">最后统一安排排期、执行发布，并查看结果和失败原因。</p>
        </article>
      </section>

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">快速入口</p>
            <h2>我现在该去哪里</h2>
          </div>
        </div>

        <div className="buttonRow">
          <Link className="buttonLike subtleButton" href="/hotspots">
            想找新机会，去热点机会
          </Link>
          <Link className="buttonLike subtleButton" href="/review">
            想看待审核内容，去审核台
          </Link>
          <Link className="buttonLike subtleButton" href="/production-studio">
            想继续做稿，去内容制作
          </Link>
          <Link className="buttonLike subtleButton" href="/publish">
            想安排发布，去发布中心
          </Link>
        </div>
      </section>
    </div>
  );
}
