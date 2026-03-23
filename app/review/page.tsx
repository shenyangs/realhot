import type { Route } from "next";
import Link from "next/link";
import { OneClickProductionButton } from "@/components/one-click-production-button";
import { PackDeleteButton } from "@/components/pack-delete-button";
import { PageHero } from "@/components/page-hero";
import { PublishActions } from "@/components/publish-actions";
import { ReviewActions } from "@/components/review-actions";
import { ReviewEditor } from "@/components/review-editor";
import { roleLabels } from "@/lib/auth";
import { listWorkspaceMembers } from "@/lib/auth/repository";
import { writeAuditLog } from "@/lib/auth/audit";
import { getCurrentViewer } from "@/lib/auth/session";
import { getBrandStrategyPack, getPrioritizedHotspots, getPublishJobsForPack, getReviewQueue } from "@/lib/data";
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

type SearchParams = Promise<{
  pack?: string;
  variant?: string;
  platform?: Platform;
  status?: ReviewStatus | "all";
  q?: string;
}>;

interface ReviewActionReviewerOption {
  value: string;
  description?: string;
}

function getPackStatusTone(status: ReviewStatus) {
  if (status === "approved") {
    return "positive";
  }

  if (status === "needs-edit") {
    return "warning";
  }

  return "neutral";
}

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

function getRiskTone(score?: number) {
  if (score === undefined) {
    return "neutral";
  }

  if (score <= 35) {
    return "positive";
  }

  if (score <= 55) {
    return "neutral";
  }

  return "warning";
}

function getRiskLabel(score?: number) {
  if (score === undefined) {
    return "未评估";
  }

  if (score <= 35) {
    return `低风险 · ${score}`;
  }

  if (score <= 55) {
    return `中风险 · ${score}`;
  }

  return `高风险 · ${score}`;
}

function getFitLabel(score?: number) {
  if (score === undefined) {
    return "未评估";
  }

  if (score >= 80) {
    return `高相关 · ${score}`;
  }

  if (score >= 65) {
    return `中相关 · ${score}`;
  }

  return `低相关 · ${score}`;
}

function getNextActionHint(status: ReviewStatus) {
  if (status === "approved") {
    return "这条内容已通过审核，可以直接进入一键制作或发布执行。";
  }

  if (status === "needs-edit") {
    return "先在右侧把稿件改到可发布状态，再恢复待审核。";
  }

  return "先判断是否值得做，再决定通过还是退回修改。";
}

export default async function ReviewPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  const viewer = await getCurrentViewer();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [brand, packs, prioritizedHotspots, workspaceMembers] = await Promise.all([
    getBrandStrategyPack(),
    getReviewQueue(),
    getPrioritizedHotspots(),
    listWorkspaceMembers()
  ]);

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
        <section className="panel systemFeedbackCard">
          <strong>还没有可处理的选题任务</strong>
          <p className="muted">先去热点看板转入一条选题，再回到这里做决策和编辑。</p>
        </section>
      </div>
    );
  }

  const activeVariant =
    activePack.variants.find((variant) => variant.id === resolvedSearchParams?.variant) ??
    activePack.variants[0];

  if (resolvedSearchParams?.pack && viewer.isAuthenticated) {
    const hotspot = prioritizedHotspots.find((item) => item.id === activePack.hotspotId);

    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.user.id,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "hotspot_pack",
      entityId: activePack.id,
      action: "review.pack_viewed",
      payload: {
        hotspotTitle: hotspot?.title,
        variantTitle: activeVariant?.title,
        status: activePack.status
      }
    });
  }

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
  const reviewerRolePriority = {
    approver: 0,
    org_admin: 1,
    operator: 2
  } as const;
  const reviewerCandidates: ReviewActionReviewerOption[] = [];
  const currentReviewer = activePack.reviewedBy ?? activePack.reviewOwner;

  if (currentReviewer) {
    reviewerCandidates.push({
      value: currentReviewer,
      description: "当前审核负责人"
    });
  }

  workspaceMembers
    .filter((member) => member.status === "active")
    .sort((left, right) => {
      const roleGap = reviewerRolePriority[left.role] - reviewerRolePriority[right.role];

      if (roleGap !== 0) {
        return roleGap;
      }

      return left.user.displayName.localeCompare(right.user.displayName, "zh-Hans-CN");
    })
    .forEach((member) => {
      reviewerCandidates.push({
        value: member.user.displayName,
        description: [roleLabels[member.role], member.user.email].filter(Boolean).join(" · ")
      });
    });

  const reviewerOptions = reviewerCandidates.reduce<ReviewActionReviewerOption[]>((options, option) => {
    if (options.some((item) => item.value === option.value)) {
      return options;
    }

    options.push(option);
    return options;
  }, []);
  const priorityLabel = getPriorityLevel({
    status: activePack.status,
    publishWindow: activeVariant?.publishWindow,
    variantCount: activePack.variants.length
  });
  const activeSignal = prioritizedHotspots.find((item) => item.id === activePack.hotspotId);
  const counts = {
    all: packs.length,
    pending: packs.filter((pack) => pack.status === "pending").length,
    "needs-edit": packs.filter((pack) => pack.status === "needs-edit").length,
    approved: packs.filter((pack) => pack.status === "approved").length
  };

  return (
    <div className="page topicWorkbenchPage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="#decision-actions">
              进入审核动作
            </Link>
            <Link className="buttonLike subtleButton" href="/publish">
              去发布执行台
            </Link>
            <Link className="buttonLike subtleButton" href="/">
              回工作台
            </Link>
          </>
        }
        context={activeVariant?.title ?? activePack.whyNow}
        description="左侧只回答值不值得做，右侧只负责把内容改到可发布状态。"
        eyebrow="选题详情台"
        facts={[
          { label: "当前状态", value: reviewStatusLabels[activePack.status] },
          { label: "优先级", value: priorityLabel },
          { label: "品牌相关", value: getFitLabel(activeSignal?.brandFitScore) },
          { label: "平台建议", value: activeVariant?.platforms.map((platform) => platformLabels[platform]).join(" / ") ?? "未设置" },
          { label: "发布窗口", value: activeVariant?.publishWindow ?? "未设置" },
          { label: "负责人", value: activePack.reviewOwner }
        ]}
        title="左决策，右编辑"
      />

      <div className="topicWorkbenchLayout">
        <aside className="topicDecisionColumn">
          <section className="panel topicQueuePanel">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">选题队列</p>
                <h2>今天处理哪一条</h2>
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
                <button className="buttonLike subtleButton" type="submit">
                  应用筛选
                </button>
                <Link className="buttonLike subtleButton" href={`/review?status=${statusFilter}`}>
                  清空
                </Link>
              </div>
            </form>

            {visiblePacks.length > 0 ? (
              <div className="reviewTaskListSimple topicQueueList">
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
              <div className="systemFeedbackCard">
                <strong>当前筛选下没有任务</strong>
                <p className="muted">可以切换状态筛选，或回到热点看板补入新选题。</p>
              </div>
            )}
          </section>

          <section className="panel topicDecisionPanel">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">决策区</p>
                <h2>这条值不值得做</h2>
              </div>
              <span className={`pill pill-${getPackStatusTone(activePack.status)}`}>
                {reviewStatusLabels[activePack.status]}
              </span>
            </div>

            <div className="topicDecisionHeadline">
              <h3>{activeVariant?.title ?? activePack.whyNow}</h3>
              <p className="muted">{getNextActionHint(activePack.status)}</p>
            </div>

            <div className="decisionMetricGrid">
              <div>
                <span>优先级</span>
                <strong>{priorityLabel}</strong>
              </div>
              <div>
                <span>品牌相关</span>
                <strong>{getFitLabel(activeSignal?.brandFitScore)}</strong>
              </div>
              <div>
                <span>平台建议</span>
                <strong>{activeVariant?.platforms.map((platform) => platformLabels[platform]).join(" / ") ?? "未设置"}</strong>
              </div>
              <div>
                <span>发布窗口</span>
                <strong>{activeVariant?.publishWindow ?? "未设置"}</strong>
              </div>
              <div>
                <span>风险提醒</span>
                <strong className={`decisionRisk decisionRisk-${getRiskTone(activeSignal?.riskScore)}`}>{getRiskLabel(activeSignal?.riskScore)}</strong>
              </div>
              <div>
                <span>出口状态</span>
                <strong>排队 {queuedCount} / 发布 {publishedCount} / 失败 {failedCount}</strong>
              </div>
            </div>

            <div className="topicDecisionNarrative">
              <div>
                <strong>立题理由</strong>
                <p className="muted">{activePack.whyNow}</p>
              </div>
              <div>
                <strong>与品牌结合的原因</strong>
                <p className="muted">{activePack.whyUs}</p>
              </div>
              <div>
                <strong>风险提醒</strong>
                <ul className="simpleList">
                  {brand.redLines.slice(0, 3).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="panel topicActionPanel" id="decision-actions">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">审核结论</p>
                <h2>固定出口</h2>
              </div>
              <span className={`pill pill-${getPackStatusTone(activePack.status)}`}>
                {reviewStatusLabels[activePack.status]}
              </span>
            </div>

            {activePack.status === "approved" ? (
              <div className="topicApprovedStack">
                <OneClickProductionButton packId={activePack.id} />
                <PublishActions
                  compact
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
                reviewerOptions={reviewerOptions}
              />
            )}
          </section>

          <details className="panel topicDangerPanel">
            <summary>管理与危险操作</summary>
            <div className="topicDangerBody">
              <p className="muted">删除后会一并清空该选题关联的待发布任务，请确认这条题确实不再推进。</p>
              <PackDeleteButton packId={activePack.id} redirectHref="/review" />
            </div>
          </details>
        </aside>

        <main className="topicEditorColumn">
          <section className="panel topicPlatformPanel">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">编辑区</p>
                <h2>平台版本</h2>
              </div>
            </div>

            <div className="reviewPlatformStrip topicPlatformTabs">
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

          <section className="panel topicEditorPanel">
            {activeVariant ? (
              <ReviewEditor
                angle={activeDraft?.variant.angle ?? activeVariant.angle}
                brandName={brand.name}
                brandTone={brand.tone}
                decisionAnchorId="decision-actions"
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
      </div>
    </div>
  );
}
