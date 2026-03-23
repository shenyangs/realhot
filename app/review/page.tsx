import type { Route } from "next";
import Link from "next/link";
import { EmptyStateCard } from "@/components/empty-state-card";
import { OneClickProductionButton } from "@/components/one-click-production-button";
import { PackDeleteButton } from "@/components/pack-delete-button";
import { PageHero } from "@/components/page-hero";
import { PublishActions } from "@/components/publish-actions";
import { ReviewActions } from "@/components/review-actions";
import { ReviewEditor } from "@/components/review-editor";
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

function buildReviewHref(input: {
  status?: string;
  q?: string;
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

function getNextActionHint(status: ReviewStatus) {
  if (status === "approved") {
    return "已通过：可以直接一键制作或进入发布执行。";
  }

  if (status === "needs-edit") {
    return "待改稿：先在下方编辑区修改，再恢复待审核。";
  }

  return "待审核：确认可发性后，点“通过”或“退回修改”。";
}

export default async function ReviewPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [brand, packs] = await Promise.all([getBrandStrategyPack(), getReviewQueue()]);

  const statusFilter = resolvedSearchParams?.status ?? "all";
  const searchQuery = resolvedSearchParams?.q?.trim() ?? "";

  const filteredPacks = packs
    .filter((pack) => (statusFilter === "all" ? true : pack.status === statusFilter))
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

      if (leftPriority !== rightPriority) {
        const weight = {
          高: 0,
          中: 1,
          低: 2
        };

        return weight[leftPriority] - weight[rightPriority];
      }

      return getPublishWindowRank(leftPrimary?.publishWindow) - getPublishWindowRank(rightPrimary?.publishWindow);
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

  const counts = {
    all: packs.length,
    pending: packs.filter((pack) => pack.status === "pending").length,
    "needs-edit": packs.filter((pack) => pack.status === "needs-edit").length,
    approved: packs.filter((pack) => pack.status === "approved").length
  };

  return (
    <div className="page reviewClearPage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="/publish">
              去发布执行台
            </Link>
            <Link className="buttonLike subtleButton" href="/">
              回工作台
            </Link>
            <Link className="buttonLike subtleButton" href="#step-3">
              直接做审核决策
            </Link>
          </>
        }
        context={activeVariant?.title ?? activePack.whyNow}
        description="按固定三步走：先选题，再改稿，最后做审核或发布决策。"
        eyebrow="选题详情台"
        facts={[
          { label: "当前品牌", value: brand.name },
          { label: "当前状态", value: reviewStatusLabels[activePack.status] },
          { label: "当前负责人", value: activePack.reviewOwner },
          { label: "下一步", value: activePack.status === "approved" ? "发布或制作" : "先做审核" }
        ]}
        title="先选题，再改稿，再决策"
      />

      <section className="panel reviewFlowGuide">
        <div className="reviewFlowSteps">
          <article className="reviewFlowStepCard">
            <span className="stepBadge">步骤 1</span>
            <strong>选择今天要处理的题</strong>
            <p className="muted">先在左侧列表选中一条，不要同时处理多条。</p>
          </article>
          <article className="reviewFlowStepCard">
            <span className="stepBadge">步骤 2</span>
            <strong>确认并修改当前稿</strong>
            <p className="muted">在中间切平台版本并编辑正文，保证可发性。</p>
          </article>
          <article className="reviewFlowStepCard">
            <span className="stepBadge">步骤 3</span>
            <strong>做审核决定</strong>
            <p className="muted">通过后可一键制作与发布；不通过就退回改稿。</p>
          </article>
        </div>
      </section>

      <div className="reviewClearLayout">
        <aside className="reviewClearQueue" id="step-1">
          <section className="panel reviewRailSection">
            <div className="reviewSimpleHeader">
              <div>
                <p className="eyebrow">步骤 1</p>
                <h3>选择选题</h3>
              </div>
              <span className="muted">共 {visiblePacks.length} 条</span>
            </div>

            <div className="reviewFilterRow">
              <Link
                aria-current={statusFilter === "all" ? "page" : undefined}
                className={`filterChip ${statusFilter === "all" ? "filterChipActive" : ""}`}
                href={buildReviewHref({ status: "all", q: searchQuery })}
              >
                全部
                <strong>{counts.all}</strong>
              </Link>
              <Link
                aria-current={statusFilter === "pending" ? "page" : undefined}
                className={`filterChip ${statusFilter === "pending" ? "filterChipActive" : ""}`}
                href={buildReviewHref({ status: "pending", q: searchQuery })}
              >
                待审核
                <strong>{counts.pending}</strong>
              </Link>
              <Link
                aria-current={statusFilter === "needs-edit" ? "page" : undefined}
                className={`filterChip ${statusFilter === "needs-edit" ? "filterChipActive" : ""}`}
                href={buildReviewHref({ status: "needs-edit", q: searchQuery })}
              >
                待改稿
                <strong>{counts["needs-edit"]}</strong>
              </Link>
              <Link
                aria-current={statusFilter === "approved" ? "page" : undefined}
                className={`filterChip ${statusFilter === "approved" ? "filterChipActive" : ""}`}
                href={buildReviewHref({ status: "approved", q: searchQuery })}
              >
                已通过
                <strong>{counts.approved}</strong>
              </Link>
            </div>

            <form action="/review" className="reviewSearchFormSimple reviewSearchFormLean" method="get">
              <input name="status" type="hidden" value={statusFilter} />
              <label className="field reviewSearchField">
                <span>搜索选题</span>
                <input defaultValue={searchQuery} name="q" placeholder="按标题、负责人或角度搜索" />
              </label>
              <div className="buttonRow reviewSearchActionsRow">
                <button type="submit">应用筛选</button>
                <Link className="buttonLike subtleButton" href={`/review?status=${statusFilter}`}>
                  清空
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
                      className={`reviewTaskRow reviewLeanTaskRow ${isActive ? "reviewTaskRowActive" : ""}`}
                      href={buildReviewHref({
                        status: statusFilter,
                        q: searchQuery,
                        pack: pack.id,
                        variant: defaultVariant?.id,
                        platform: defaultVariant?.platforms[0]
                      })}
                      key={pack.id}
                    >
                      <div className="reviewTaskRowMain">
                        <strong className="reviewTaskTitle">{defaultVariant?.title ?? pack.whyNow}</strong>
                        <p className="muted reviewTaskSummary">
                          {pack.reviewOwner} · {defaultVariant?.publishWindow ?? "未设置发布时间"}
                        </p>
                      </div>
                      <div className="reviewTaskRowMeta reviewLeanTaskMeta">
                        <span className={`pill pill-${getPackStatusTone(pack.status)}`}>{reviewStatusLabels[pack.status]}</span>
                        <small className="muted">优先级 {getPriorityLevel({
                          status: pack.status,
                          publishWindow: defaultVariant?.publishWindow,
                          variantCount: pack.variants.length
                        })}</small>
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

        <main className="reviewClearMain">
          <section className="panel reviewContextPanel" id="step-2">
            <div className="reviewSimpleHeader">
              <div>
                <p className="eyebrow">步骤 2</p>
                <h3>查看并确认当前稿</h3>
              </div>
              <span className={`pill pill-${getPackStatusTone(activePack.status)}`}>
                {reviewStatusLabels[activePack.status]}
              </span>
            </div>

            <h2 className="reviewCurrentTitle">{activeVariant?.title ?? activePack.whyNow}</h2>
            <p className="muted reviewCurrentHint">{getNextActionHint(activePack.status)}</p>

            <div className="definitionList compactDefinitionList reviewContextMiniFacts">
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
                <span>出口状态</span>
                <strong>排队 {queuedCount} / 发布 {publishedCount} / 失败 {failedCount}</strong>
              </div>
            </div>

            <div className="reviewContextNarrative reviewContextCopy">
              <p><strong>为什么现在做：</strong>{activePack.whyNow}</p>
              <p><strong>为什么与品牌相关：</strong>{activePack.whyUs}</p>
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
                <p className="eyebrow">步骤 2（继续）</p>
                <h3>修改当前版本</h3>
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

          <section className="panel reviewDecisionSurface" id="step-3">
            <div className="reviewSimpleHeader">
              <div>
                <p className="eyebrow">步骤 3</p>
                <h3>审核与发布决策</h3>
              </div>
              <span className={`pill pill-${getPackStatusTone(activePack.status)}`}>
                {reviewStatusLabels[activePack.status]}
              </span>
            </div>

            <p className="muted">{getNextActionHint(activePack.status)}</p>

            {activePack.status === "approved" ? (
              <div className="reviewDecisionStack">
                <OneClickProductionButton packId={activePack.id} />
                <PublishActions
                  failedCount={failedCount}
                  packId={activePack.id}
                  publishedCount={publishedCount}
                  queuedCount={queuedCount}
                />
              </div>
            ) : (
              <ReviewActions
                currentNote={activePack.reviewNote}
                currentStatus={activePack.status}
                defaultReviewer={activePack.reviewedBy ?? activePack.reviewOwner}
                packId={activePack.id}
              />
            )}

            <div className="reviewDangerZone">
              <div className="listItem">
                <strong>不需要这条选题？</strong>
                <span className="pill pill-warning">谨慎操作</span>
              </div>
              <p className="muted">删除后会一起清空它关联的待发布任务。</p>
              <PackDeleteButton packId={activePack.id} redirectHref="/review" />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
