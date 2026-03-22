import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyStateCard } from "@/components/empty-state-card";
import { OpportunityCard } from "@/components/opportunity-card";
import { PageHero } from "@/components/page-hero";
import { getCurrentViewer } from "@/lib/auth/session";
import { getBrandStrategyPack, getPrioritizedHotspots, getReviewQueue } from "@/lib/data";
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
    return "4 小时内完成立题";
  }

  if (velocityScore >= 75) {
    return "今天内完成首稿";
  }

  return "适合继续观察并沉淀观点";
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
  const viewer = await getCurrentViewer();

  if (!viewer.isPlatformAdmin && viewer.isAuthenticated && viewer.memberships.length > 1 && !viewer.currentWorkspace) {
    redirect("/select-workspace");
  }

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

  const pendingTasks = tasks.filter((task) => task.packStatus === "pending");
  const approvedTasks = tasks.filter((task) => task.packStatus === "approved");
  const reviewItems = pendingTasks.slice(0, 4);
  const publishItems = approvedTasks.slice(0, 4);
  const mobileReviewItems = pendingTasks.slice(0, 3);
  const mobilePublishItems = approvedTasks.slice(0, 3);
  const mobileHotspots = focusHotspots.slice(0, 3);
  const todayLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).format(new Date());
  const needsEditCount = tasks.filter((task) => task.packStatus === "needs-edit").length;
  const blockerCount = pendingTasks.length + needsEditCount;

  return (
    <div className="page workbenchPage">
      <div className="workbenchDesktopStack">
        <PageHero
          actions={
            <>
              <Link className="buttonLike primaryButton" href="/review">
                进入选题详情台
              </Link>
              <Link className="buttonLike subtleButton" href="/hotspots">
                查看全部热点
              </Link>
              <Link className="buttonLike subtleButton" href="/brands">
                管理品牌系统
              </Link>
              <Link className="buttonLike subtleButton" href="/production-studio">
                内容深度制作
              </Link>
            </>
          }
          context={brand.name}
          description="查看今日机会、审核积压与发布准备。"
          eyebrow="工作台总览"
          facts={[
            { label: "当前品牌", value: brand.name },
            { label: "今日机会", value: `${focusHotspots.length} 个优先热点` },
            { label: "生产负载", value: `${tasks.length} 个任务流转中` },
            { label: "当前堵点", value: `${blockerCount} 个待处理出口` }
          ]}
          title="工作台"
          variant="utility"
        />

        <section className="panel workbenchFocusStrip">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">处理顺序</p>
              <h2>今日优先级</h2>
            </div>
          </div>

          <div className="workflowStrip workbenchFocusSteps">
            <article className="workflowCard">
              <span className="workflowStep">01</span>
              <strong>审核</strong>
              <p className="muted">{reviewItems.length} 条内容等待确认，优先释放后续流转。</p>
            </article>
            <article className="workflowCard">
              <span className="workflowStep">02</span>
              <strong>改稿</strong>
              <p className="muted">{needsEditCount} 条版本待调整，完成后可重新进入审核。</p>
            </article>
            <article className="workflowCard">
              <span className="workflowStep">03</span>
              <strong>新增选题</strong>
              <p className="muted">当前可从 {focusHotspots.length} 个优先热点里继续补充新题。</p>
            </article>
          </div>
        </section>

        <section className="summaryGrid">
          <article className="panel summaryCard summaryCardElevated">
            <p className="eyebrow">热点筛选</p>
            <h3>{focusHotspots.length} 个优先机会</h3>
            <p className="muted">按品牌相关性与执行窗口筛出今日值得处理的热点。</p>
          </article>
          <article className="panel summaryCard summaryCardElevated">
            <p className="eyebrow">流程状态</p>
            <h3>{tasks.length} 个版本在流转</h3>
            <p className="muted">从选题到终稿统一放在当前工作流内处理。</p>
          </article>
          <article className="panel summaryCard summaryCardElevated">
            <p className="eyebrow">待处理</p>
            <h3>{blockerCount} 处需要跟进</h3>
            <p className="muted">优先清理出口，再决定是否继续扩充新题。</p>
          </article>
        </section>

        <section className="panel workflowPanel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">主流程</p>
              <h2>工作流</h2>
            </div>
          </div>

          <div className="workflowStrip">
            <article className="workflowCard">
              <span className="workflowStep">01</span>
              <strong>热点</strong>
              <p className="muted">筛出今天值得进入判断的外部信号。</p>
            </article>
            <article className="workflowCard">
              <span className="workflowStep">02</span>
              <strong>选题</strong>
              <p className="muted">映射为品牌视角、版本与发布时间窗口。</p>
            </article>
            <article className="workflowCard">
              <span className="workflowStep">03</span>
              <strong>编辑</strong>
              <p className="muted">在统一编辑台完成改写、审核与风险控制。</p>
            </article>
            <article className="workflowCard">
              <span className="workflowStep">04</span>
              <strong>发布</strong>
              <p className="muted">进入发布执行台排队、导出或立即发送。</p>
            </article>
          </div>
        </section>

        <div className="dashboardSplit">
          <section className="panel">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">优先机会</p>
                <h2>热点机会</h2>
              </div>
              <Link className="sectionLink" href="/hotspots">
                打开热点看板
              </Link>
            </div>

            <div className="opportunityRail opportunityRailDense">
              {focusHotspots.length > 0 ? (
                focusHotspots.map((signal) => {
                  const existingPack = packByHotspotId.get(signal.id);

                  return (
                    <OpportunityCard
                      angle={getRecommendedAngle(signal.kind)}
                      detectedAt={formatOpportunityTime(signal.detectedAt)}
                      hotspotId={signal.id}
                      key={signal.id}
                      packId={existingPack?.packId}
                      platform={existingPack?.platform}
                      recommendedAction={signal.recommendedAction}
                      relevanceReason={signal.reasons[0] ?? "已命中品牌主题词与近期传播方向"}
                      source={signal.source}
                      summary={signal.summary}
                      title={signal.title}
                      variantId={existingPack?.variantId}
                      windowLabel={getOpportunityWindow(signal.velocityScore)}
                    />
                  );
                })
              ) : (
                <EmptyStateCard
                  actionLabel="去品牌系统补资料"
                  description="还没有抓到适合今天处理的热点。先补品牌资料或刷新热点机会，再回来决定今天做什么。"
                  eyebrow="热点机会"
                  href="/brands"
                  title="今天还没有可立刻处理的热点机会"
                />
              )}
            </div>
          </section>

          <aside className="stack dashboardAsideStack">
            <article className="panel queuePanel queuePanelDense">
              <div className="panelHeader sectionTitle">
                <div>
                  <p className="eyebrow">审核队列</p>
                  <h2>待审核</h2>
                </div>
                <Link className="sectionLink" href="/review">
                  进入处理
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

            <article className="panel queuePanel queuePanelDense">
              <div className="panelHeader sectionTitle">
                <div>
                  <p className="eyebrow">待发布</p>
                  <h2>已通过</h2>
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
          </aside>
        </div>

        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">任务流转</p>
              <h2>当前任务</h2>
            </div>
            <Link className="sectionLink" href="/review">
              查看全部任务
            </Link>
          </div>

          {tasks.length > 0 ? (
            <div className="reviewTaskListSimple reviewTaskListWorkspace">
              {tasks.map((task) => (
                <article className="reviewTaskRow reviewTaskRowWorkspace" key={task.id}>
                  <div className="reviewTaskRowMain">
                    <div className="taskRowIdentity">
                      <strong className="reviewTaskTitle">{task.title}</strong>
                      <p className="muted reviewTaskSummary">{task.source}</p>
                    </div>
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
                        打开详情台
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
      </div>

      <div className="workbenchMobileStack">
        <section className="panel mobileHeroCard">
          <div className="mobileHeroHeading">
            <p className="eyebrow">移动工作台</p>
            <h1>今天先处理这三步</h1>
            <p className="muted">
              {brand.name} · {todayLabel}
            </p>
          </div>
          <div className="mobileStatGrid">
            <article className="mobileStatItem">
              <span>优先热点</span>
              <strong>{focusHotspots.length}</strong>
            </article>
            <article className="mobileStatItem">
              <span>待审核</span>
              <strong>{pendingTasks.length}</strong>
            </article>
            <article className="mobileStatItem">
              <span>待发布</span>
              <strong>{approvedTasks.length}</strong>
            </article>
            <article className="mobileStatItem">
              <span>需改稿</span>
              <strong>{needsEditCount}</strong>
            </article>
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">快捷入口</p>
              <h2>直接开始</h2>
            </div>
          </div>
          <div className="mobileQuickGrid">
            <Link className="mobileQuickAction" href="/review">
              <strong>审核队列</strong>
              <small>先清理 {pendingTasks.length} 条待审核</small>
            </Link>
            <Link className="mobileQuickAction" href="/publish">
              <strong>发布执行</strong>
              <small>{approvedTasks.length} 条可进入发布</small>
            </Link>
            <Link className="mobileQuickAction" href="/hotspots">
              <strong>热点看板</strong>
              <small>{focusHotspots.length} 个机会可补题</small>
            </Link>
            <Link className="mobileQuickAction" href="/brands">
              <strong>品牌系统</strong>
              <small>维护规则与素材资产</small>
            </Link>
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">待处理</p>
              <h2>今天要推进</h2>
            </div>
            <Link className="sectionLink" href="/review">
              查看全部
            </Link>
          </div>

          <div className="mobileTaskGroup">
            <h3>待审核</h3>
            {mobileReviewItems.length > 0 ? (
              mobileReviewItems.map((item) => (
                <Link className="mobileTaskCard" href={`/review?pack=${item.packId}&variant=${item.id}`} key={`mobile-review-${item.id}`}>
                  <strong>{item.title}</strong>
                  <p className="muted">
                    {item.owner} · {item.publishWindow}
                  </p>
                </Link>
              ))
            ) : (
              <p className="emptyState">审核队列目前为空，可以继续补充新选题。</p>
            )}
          </div>

          <div className="mobileTaskGroup">
            <h3>待发布</h3>
            {mobilePublishItems.length > 0 ? (
              mobilePublishItems.map((item) => (
                <Link className="mobileTaskCard" href="/publish" key={`mobile-publish-${item.id}`}>
                  <strong>{item.title}</strong>
                  <p className="muted">
                    {item.platforms} · {item.publishWindow}
                  </p>
                </Link>
              ))
            ) : (
              <p className="emptyState">目前还没有可直接发布的内容。</p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">热点机会</p>
              <h2>优先观察</h2>
            </div>
            <Link className="sectionLink" href="/hotspots">
              打开看板
            </Link>
          </div>
          <div className="mobileTaskGroup">
            {mobileHotspots.length > 0 ? (
              mobileHotspots.map((signal) => {
                const existingPack = packByHotspotId.get(signal.id);

                return (
                  <Link className="mobileTaskCard" href={existingPack ? `/review?pack=${existingPack.packId}` : "/hotspots"} key={signal.id}>
                    <strong>{signal.title}</strong>
                    <p className="muted">
                      {signal.source} · {getOpportunityWindow(signal.velocityScore)}
                    </p>
                  </Link>
                );
              })
            ) : (
              <p className="emptyState">当前还没有高优先级热点，建议稍后刷新。</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
