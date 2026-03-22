import type { Route } from "next";
import Link from "next/link";
import { EmptyStateCard } from "@/components/empty-state-card";
import { OneClickProductionButton } from "@/components/one-click-production-button";
import { PackDeleteButton } from "@/components/pack-delete-button";
import { PageHero } from "@/components/page-hero";
import { PublishActions } from "@/components/publish-actions";
import { ReviewActions } from "@/components/review-actions";
import { ReviewEditor } from "@/components/review-editor";
import { requireWorkspacePageViewer } from "@/lib/auth";
import { getBrandStrategyPack, getPublishJobsForPack, getReviewQueue } from "@/lib/data";
import type { ContentTrack, Platform, ReviewStatus } from "@/lib/domain/types";

const platformLabels: Record<Platform, string> = {
  xiaohongshu: "小红书图文",
  wechat: "公众号文章",
  "video-channel": "视频号口播稿",
  douyin: "抖音短视频脚本"
};

const trackLabels: Record<ContentTrack, string> = {
  "rapid-response": "快反",
  "point-of-view": "观点"
};

const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  "needs-edit": "待改稿"
};

const statusFocusCopy: Record<
  ReviewStatus,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  pending: {
    eyebrow: "现在要做什么",
    title: "先做审核判断",
    description: "先确认这版能不能发，再决定通过、退回或删除。"
  },
  approved: {
    eyebrow: "现在要做什么",
    title: "这题可以进入发布",
    description: "可以安排发布；如果这题不需要了，也能直接删除。"
  },
  "needs-edit": {
    eyebrow: "现在要做什么",
    title: "这题先改再审",
    description: "先把问题改清楚，再恢复到待审核。"
  }
};

function getPackStatusTone(status: ReviewStatus) {
  if (status === "approved") {
    return "positive";
  }

  if (status === "needs-edit") {
    return "warning";
  }

  return "neutral";
}

type SearchParams = Promise<{
  pack?: string;
  variant?: string;
  platform?: Platform;
  status?: ReviewStatus | "all";
  q?: string;
  owner?: string;
  sort?: "priority" | "deadline" | "owner";
}>;

function getPublishWindowRank(value?: string) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const match = value.match(/(\d{1,2}):(\d{2})/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function getPriorityLevel(input: {
  status: ReviewStatus;
  publishWindow?: string;
  variantCount: number;
}) {
  const deadlineScore = getPublishWindowRank(input.publishWindow);

  if (input.status === "needs-edit") {
    return "高";
  }

  if (input.status === "pending" && deadlineScore <= 12 * 60) {
    return "高";
  }

  if (input.status === "pending" || input.variantCount >= 4) {
    return "中";
  }

  return "低";
}

function getPriorityWeight(label: string) {
  if (label === "高") {
    return 0;
  }

  if (label === "中") {
    return 1;
  }

  return 2;
}

function buildReviewHref(input: {
  status?: string;
  q?: string;
  owner?: string;
  sort?: string;
  pack?: string;
  variant?: string;
  platform?: string;
}) {
  const params = new URLSearchParams();

  if (input.status && input.status !== "all") {
    params.set("status", input.status);
  }

  if (input.q) {
    params.set("q", input.q);
  }

  if (input.owner && input.owner !== "all") {
    params.set("owner", input.owner);
  }

  if (input.sort && input.sort !== "priority") {
    params.set("sort", input.sort);
  }

  if (input.pack) {
    params.set("pack", input.pack);
  }

  if (input.variant) {
    params.set("variant", input.variant);
  }

  if (input.platform) {
    params.set("platform", input.platform);
  }

  const query = params.toString();
  return (query ? `/review?${query}` : "/review") as Route;
}

export default async function ReviewPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  await requireWorkspacePageViewer();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [brand, packs] = await Promise.all([getBrandStrategyPack(), getReviewQueue()]);
  const statusFilter = resolvedSearchParams?.status ?? "all";
  const searchQuery = resolvedSearchParams?.q?.trim() ?? "";
  const ownerFilter = resolvedSearchParams?.owner?.trim() ?? "all";
  const sortBy = resolvedSearchParams?.sort ?? "priority";

  const filteredPacks = packs
    .filter((pack) => (statusFilter === "all" ? true : pack.status === statusFilter))
    .filter((pack) => {
      if (ownerFilter === "all") {
        return true;
      }

      return pack.reviewOwner === ownerFilter;
    })
    .filter((pack) => {
      if (!searchQuery) {
        return true;
      }

      const haystack = [
        pack.whyNow,
        pack.whyUs,
        pack.reviewOwner,
        ...pack.variants.map((variant) => variant.title),
        ...pack.variants.map((variant) => variant.angle)
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(searchQuery.toLowerCase());
    })
    .sort((left, right) => {
      const leftPrimary = left.variants[0];
      const rightPrimary = right.variants[0];
      const leftPriority = getPriorityLevel({
        status: left.status,
        publishWindow: leftPrimary?.publishWindow,
        variantCount: left.variants.length
      });
      const rightPriority = getPriorityLevel({
        status: right.status,
        publishWindow: rightPrimary?.publishWindow,
        variantCount: right.variants.length
      });

      if (sortBy === "deadline") {
        return getPublishWindowRank(leftPrimary?.publishWindow) - getPublishWindowRank(rightPrimary?.publishWindow);
      }

      if (sortBy === "owner") {
        return left.reviewOwner.localeCompare(right.reviewOwner, "zh-CN");
      }

      return (
        getPriorityWeight(leftPriority) - getPriorityWeight(rightPriority) ||
        getPublishWindowRank(leftPrimary?.publishWindow) - getPublishWindowRank(rightPrimary?.publishWindow)
      );
    });

  const visiblePacks = filteredPacks;
  const activePack =
    visiblePacks.find((pack) => pack.id === resolvedSearchParams?.pack) ??
    visiblePacks[0] ??
    packs[0];

  if (!activePack) {
    return (
      <div className="page">
        <section className="panel emptyPageState">
          <p className="eyebrow">选题与审核</p>
          <h1>还没有可编辑的选题任务</h1>
          <p className="muted">先去同步热点并生成选题包，再回来进入编辑与审核。</p>
        </section>
      </div>
    );
  }

  const activeVariant =
    activePack.variants.find((variant) => variant.id === resolvedSearchParams?.variant) ??
    activePack.variants[0];

  const platformDrafts = activePack.variants.flatMap((variant) =>
    variant.platforms.map((platform) => ({
      slotId: `${variant.id}:${platform}`,
      variant,
      platform
    }))
  );

  const activeDraft =
    platformDrafts.find(
      (draft) =>
        draft.variant.id === activeVariant?.id &&
        draft.platform === resolvedSearchParams?.platform
    ) ??
    platformDrafts.find((draft) => draft.variant.id === activeVariant?.id) ??
    platformDrafts[0];

  const jobs = await getPublishJobsForPack(activePack.id);
  const queuedCount = jobs.filter((job) => job.status === "queued").length;
  const publishedCount = jobs.filter((job) => job.status === "published").length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const priorityLabel = getPriorityLevel({
    status: activePack.status,
    publishWindow: activeVariant?.publishWindow,
    variantCount: activePack.variants.length
  });
  const activeDraftCount = activePack.variants.length;

  const counts = {
    all: packs.length,
    pending: packs.filter((pack) => pack.status === "pending").length,
    "needs-edit": packs.filter((pack) => pack.status === "needs-edit").length,
    approved: packs.filter((pack) => pack.status === "approved").length
  };

  return (
    <div className="page reviewFlatPage reviewDeskPage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="/publish">
              进入发布执行台
            </Link>
            <Link className="buttonLike subtleButton" href="#review-editor">
              直接改稿
            </Link>
          </>
        }
        description="先选题，再看当前稿，再做审核决定。"
        eyebrow="编辑台"
        facts={[
          { label: "当前品牌", value: brand.name },
          { label: "当前状态", value: reviewStatusLabels[activePack.status] },
          { label: "负责人", value: activePack.reviewOwner },
          { label: "发布窗口", value: activeVariant?.publishWindow ?? "未设置" }
        ]}
        context={activeVariant?.title ?? activePack.whyNow}
        title="选题详情台"
      />

      <div className="reviewDeskLayout">
        <aside className="reviewQueueColumn">
          <section className="panel reviewRailSection" id="review-tasks">
            <div className="reviewSimpleHeader">
              <div>
                <p className="eyebrow">选题列表</p>
                <h3>先选今天要处理的题</h3>
              </div>
              <span className="muted">当前筛到 {visiblePacks.length} 条</span>
            </div>

            <div className="reviewFilterRow">
              <Link
                aria-current={statusFilter === "all" ? "page" : undefined}
                className={`filterChip ${statusFilter === "all" ? "filterChipActive" : ""}`}
                href={buildReviewHref({
                  status: "all",
                  q: searchQuery,
                  owner: ownerFilter,
                  sort: sortBy
                })}
              >
                全部
                <strong>{counts.all}</strong>
              </Link>
              <Link
                aria-current={statusFilter === "pending" ? "page" : undefined}
                className={`filterChip ${statusFilter === "pending" ? "filterChipActive" : ""}`}
                href={buildReviewHref({
                  status: "pending",
                  q: searchQuery,
                  owner: ownerFilter,
                  sort: sortBy
                })}
              >
                待审核
                <strong>{counts.pending}</strong>
              </Link>
              <Link
                aria-current={statusFilter === "needs-edit" ? "page" : undefined}
                className={`filterChip ${statusFilter === "needs-edit" ? "filterChipActive" : ""}`}
                href={buildReviewHref({
                  status: "needs-edit",
                  q: searchQuery,
                  owner: ownerFilter,
                  sort: sortBy
                })}
              >
                待改稿
                <strong>{counts["needs-edit"]}</strong>
              </Link>
              <Link
                aria-current={statusFilter === "approved" ? "page" : undefined}
                className={`filterChip ${statusFilter === "approved" ? "filterChipActive" : ""}`}
                href={buildReviewHref({
                  status: "approved",
                  q: searchQuery,
                  owner: ownerFilter,
                  sort: sortBy
                })}
              >
                已通过
                <strong>{counts.approved}</strong>
              </Link>
            </div>

            <form action="/review" className="reviewSearchFormSimple reviewSearchFormLean" method="get">
              <input name="status" type="hidden" value={statusFilter} />
              <label className="field reviewSearchField">
                <span>搜索选题</span>
                <input
                  defaultValue={searchQuery}
                  name="q"
                  placeholder="按标题、切入角度、负责人搜索"
                />
              </label>
              <div className="buttonRow reviewSearchActionsRow">
                <button type="submit">应用筛选</button>
                <Link className="buttonLike subtleButton" href={`/review?status=${statusFilter}`}>
                  清空条件
                </Link>
              </div>
            </form>

            {visiblePacks.length > 0 ? (
              <div className="reviewTaskListSimple reviewTaskRailList">
                {visiblePacks.map((pack) => {
                  const defaultVariant = pack.variants[0];
                  const isActive = pack.id === activePack.id;

                  return (
                    <Link
                      className={`reviewTaskRow ${isActive ? "reviewTaskRowActive" : ""}`}
                      href={buildReviewHref({
                        status: statusFilter,
                        q: searchQuery,
                        owner: ownerFilter,
                        sort: sortBy,
                        pack: pack.id,
                        variant: defaultVariant?.id,
                        platform: defaultVariant?.platforms[0]
                      })}
                      key={pack.id}
                    >
                      <div className="reviewTaskRowMain">
                        <strong className="reviewTaskTitle">{defaultVariant?.title ?? pack.whyNow}</strong>
                        <p className="muted reviewTaskSummary">{pack.whyUs}</p>
                      </div>
                      <div className="reviewTaskRowMeta">
                        <span className={`pill pill-${getPackStatusTone(pack.status)}`}>
                          {reviewStatusLabels[pack.status]}
                        </span>
                        <span className="tag">
                          优先级 {getPriorityLevel({
                            status: pack.status,
                            publishWindow: defaultVariant?.publishWindow,
                            variantCount: pack.variants.length
                          })}
                        </span>
                        <small className="muted">{pack.reviewOwner}</small>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyStateCard
                actionLabel="去热点看板补题"
                description="当前筛选下暂无任务。"
                eyebrow="选题库"
                href="/hotspots"
                title="暂无选题"
              />
            )}
          </section>
        </aside>

        <main className="reviewEditorColumn">
          <section className="panel reviewContextPanel" id="review-context">
            <div className="reviewSimpleHeader">
              <div>
                <p className="eyebrow">当前选题</p>
                <h3>{activeVariant?.title ?? activePack.whyNow}</h3>
              </div>
              <span className={`pill pill-${getPackStatusTone(activePack.status)}`}>
                {reviewStatusLabels[activePack.status]}
              </span>
            </div>

            <div className="pageHeroFacts reviewContextFacts">
              <div>
                <span>优先级</span>
                <strong>{priorityLabel}</strong>
              </div>
              <div>
                <span>负责人</span>
                <strong>{activePack.reviewOwner}</strong>
              </div>
              <div>
                <span>发布时间</span>
                <strong>{activeVariant?.publishWindow ?? "未设置"}</strong>
              </div>
              <div>
                <span>当前平台</span>
                <strong>{activeDraft ? platformLabels[activeDraft.platform] : "未选择"}</strong>
              </div>
              <div>
                <span>版本数</span>
                <strong>{activeDraftCount} 条</strong>
              </div>
              <div>
                <span>出口状态</span>
                <strong>排队 {queuedCount} / 发布 {publishedCount} / 失败 {failedCount}</strong>
              </div>
            </div>

            <div className="reviewContextCopy reviewContextNarrative">
              <p><strong>为什么现在做：</strong>{activePack.whyNow}</p>
              <p><strong>为什么和品牌相关：</strong>{activePack.whyUs}</p>
            </div>

            <div className="reviewPlatformStrip">
              {platformDrafts.map((draft) => {
                const isActive =
                  draft.variant.id === activeDraft?.variant.id &&
                  draft.platform === activeDraft?.platform;

                return (
                  <Link
                    className={`reviewPlatformChip ${isActive ? "reviewPlatformChipActive" : ""}`}
                    href={buildReviewHref({
                      status: statusFilter,
                      q: searchQuery,
                      owner: ownerFilter,
                      sort: sortBy,
                      pack: activePack.id,
                      variant: draft.variant.id,
                      platform: draft.platform
                    })}
                    key={draft.slotId}
                  >
                    <strong>{platformLabels[draft.platform]}</strong>
                    <small className="muted">{trackLabels[draft.variant.track]} · {draft.variant.publishWindow}</small>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="panel reviewEditorSurface" id="review-editor">
            <div className="reviewSimpleHeader">
              <div>
                <p className="eyebrow">编辑区</p>
                <h3>当前版本</h3>
              </div>
            </div>

            {activeVariant ? (
              <ReviewEditor
                angle={activeDraft?.variant.angle ?? activeVariant.angle}
                brandName={brand.name}
                brandTone={brand.tone}
                initialBody={activeDraft?.variant.body ?? activeVariant.body}
                initialHook={activeDraft?.variant.coverHook ?? activeVariant.coverHook}
                initialTitle={activeDraft?.variant.title ?? activeVariant.title}
                packId={activePack.id}
                platformKey={activeDraft?.platform ?? activeVariant.platforms[0]}
                platformLabel={activeDraft ? platformLabels[activeDraft.platform] : platformLabels[activeVariant.platforms[0]]}
                redLines={brand.redLines}
                trackLabel={trackLabels[activeDraft?.variant.track ?? activeVariant.track]}
                variantId={activeDraft?.variant.id ?? activeVariant.id}
                whyNow={activePack.whyNow}
                whyUs={activePack.whyUs}
              />
            ) : null}
          </section>
        </main>

        <aside className="reviewActionColumn" id="review-actions">
          <section className="panel actionFocusPanel reviewActionPanel">
            <p className="eyebrow">{statusFocusCopy[activePack.status].eyebrow}</p>
            <h3>{statusFocusCopy[activePack.status].title}</h3>
            <p className="muted">{statusFocusCopy[activePack.status].description}</p>
          </section>

          <section className="panel helperPanel reviewDecisionPanel">
            <div className="listItem">
              <strong>当前进度</strong>
              <span className="pill pill-neutral">{reviewStatusLabels[activePack.status]}</span>
            </div>
            <div className="definitionList compactDefinitionList">
              <div>
                <span>审核优先级</span>
                <strong>{priorityLabel}</strong>
              </div>
              <div>
                <span>排队中</span>
                <strong>{queuedCount} 条</strong>
              </div>
              <div>
                <span>已发布</span>
                <strong>{publishedCount} 条</strong>
              </div>
              <div>
                <span>失败</span>
                <strong>{failedCount} 条</strong>
              </div>
            </div>
          </section>

          <section className="panel helperPanel reviewNextStepBlock">
            <div className="listItem">
              <strong>一键制作</strong>
              <span className={`pill ${activePack.status === "approved" ? "pill-positive" : "pill-neutral"}`}>
                {activePack.status === "approved" ? "已就绪" : "待通过"}
              </span>
            </div>
            <p className="muted">
              {activePack.status === "approved"
                ? "当前选题已通过，可直接触发图文、视频、口播、字幕的自动生产流程。"
                : "当前选题还未通过审核；先点“通过”后会出现可点击的一键制作按钮。"}
            </p>
            {activePack.status === "approved" ? (
              <OneClickProductionButton packId={activePack.id} />
            ) : (
              <button className="buttonLike subtleButton" disabled type="button">
                一键制作图文+视频（待审核通过）
              </button>
            )}
          </section>

          {activePack.status === "approved" ? (
            <PublishActions
              failedCount={failedCount}
              packId={activePack.id}
              publishedCount={publishedCount}
              queuedCount={queuedCount}
            />
          ) : (
            <ReviewActions
              currentNote={activePack.reviewNote}
              currentStatus={activePack.status}
              defaultReviewer={activePack.reviewedBy ?? activePack.reviewOwner}
              packId={activePack.id}
            />
          )}

          <section className="panel helperPanel reviewNextStepBlock">
            <div className="listItem">
              <strong>选题管理</strong>
              <span className="pill pill-warning">谨慎操作</span>
            </div>
            <p className="muted">如果这题不再需要，可以直接删除；关联的待发布任务也会一起移除。</p>
            <PackDeleteButton packId={activePack.id} redirectHref="/review" />
          </section>

          <section className="panel helperPanel reviewNextStepBlock">
            <strong>接下来怎么处理</strong>
            <p className="muted">
              {activePack.status === "approved"
                ? "可进入发布安排。"
                : activePack.status === "needs-edit"
                  ? "调整后再进入审核。"
                  : "当前版本等待审核确认。"}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
