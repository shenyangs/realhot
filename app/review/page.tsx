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

function getStepCopy(status: ReviewStatus) {
  if (status === "approved") {
    return {
      title: "已通过，进入发布与一键制作",
      description: "可以直接安排发布，或触发图文+视频自动制作。"
    };
  }

  if (status === "needs-edit") {
    return {
      title: "先改稿，再回到待审核",
      description: "把问题改清楚后再提交，避免带着风险进发布。"
    };
  }

  return {
    title: "先看稿，再做审核决定",
    description: "确认内容质量后，选择通过或退回修改。"
  };
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
    });

  const activePack =
    filteredPacks.find((pack) => pack.id === resolvedSearchParams?.pack) ??
    filteredPacks[0] ??
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

  const activePlatform =
    (resolvedSearchParams?.platform && activeVariant?.platforms.includes(resolvedSearchParams.platform)
      ? resolvedSearchParams.platform
      : activeVariant?.platforms[0]) ?? "xiaohongshu";

  const jobs = await getPublishJobsForPack(activePack.id);
  const queuedCount = jobs.filter((job) => job.status === "queued").length;
  const publishedCount = jobs.filter((job) => job.status === "published").length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const stepCopy = getStepCopy(activePack.status);

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
        description="按三步走：先选题，再改稿，最后做审核与发布。"
        eyebrow="编辑台"
        facts={[
          { label: "当前品牌", value: brand.name },
          { label: "待审核", value: `${counts.pending} 条` },
          { label: "已通过", value: `${counts.approved} 条` },
          { label: "当前负责人", value: activePack.reviewOwner }
        ]}
        context={activeVariant?.title ?? activePack.whyNow}
        title="选题详情台"
      />

      <div className="reviewDeskLayout">
        <aside className="reviewQueueColumn">
          <section className="panel reviewRailSection" id="review-tasks">
            <div className="reviewSimpleHeader">
              <div>
                <p className="eyebrow">步骤 1</p>
                <h3>先选今天要处理的题</h3>
              </div>
              <span className="muted">当前 {filteredPacks.length} 条</span>
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
                <input
                  defaultValue={searchQuery}
                  name="q"
                  placeholder="按标题、切入角度、负责人搜索"
                />
              </label>
              <div className="buttonRow reviewSearchActionsRow">
                <button type="submit">应用筛选</button>
                <Link className="buttonLike subtleButton" href={buildReviewHref({ status: statusFilter })}>
                  清空条件
                </Link>
              </div>
            </form>

            {filteredPacks.length > 0 ? (
              <div className="reviewTaskListSimple reviewTaskRailList">
                {filteredPacks.map((pack) => {
                  const defaultVariant = pack.variants[0];
                  const isActive = pack.id === activePack.id;

                  return (
                    <Link
                      className={`reviewTaskRow ${isActive ? "reviewTaskRowActive" : ""}`}
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
                        <p className="muted reviewTaskSummary">{pack.whyUs}</p>
                      </div>
                      <div className="reviewTaskRowMeta">
                        <span className={`pill pill-${getPackStatusTone(pack.status)}`}>
                          {reviewStatusLabels[pack.status]}
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
                <p className="eyebrow">步骤 2</p>
                <h3>改稿并确认版本</h3>
              </div>
              <span className={`pill pill-${getPackStatusTone(activePack.status)}`}>
                {reviewStatusLabels[activePack.status]}
              </span>
            </div>

            <div className="reviewContextCopy reviewContextNarrative">
              <p><strong>当前标题：</strong>{activeVariant?.title ?? activePack.whyNow}</p>
              <p><strong>为什么现在做：</strong>{activePack.whyNow}</p>
              <p><strong>为什么和品牌相关：</strong>{activePack.whyUs}</p>
            </div>

            <div className="reviewPlatformStrip">
              {activePack.variants.map((variant) => {
                const isActive = variant.id === activeVariant?.id;

                return (
                  <Link
                    className={`reviewPlatformChip ${isActive ? "reviewPlatformChipActive" : ""}`}
                    href={buildReviewHref({
                      status: statusFilter,
                      q: searchQuery,
                      pack: activePack.id,
                      variant: variant.id,
                      platform: variant.platforms[0]
                    })}
                    key={variant.id}
                  >
                    <strong>{trackLabels[variant.track]}版本</strong>
                    <small className="muted">{variant.publishWindow}</small>
                  </Link>
                );
              })}
            </div>

            <div className="reviewPlatformStrip">
              {activeVariant?.platforms.map((platform) => {
                const isActive = platform === activePlatform;

                return (
                  <Link
                    className={`reviewPlatformChip ${isActive ? "reviewPlatformChipActive" : ""}`}
                    href={buildReviewHref({
                      status: statusFilter,
                      q: searchQuery,
                      pack: activePack.id,
                      variant: activeVariant.id,
                      platform
                    })}
                    key={platform}
                  >
                    <strong>{platformLabels[platform]}</strong>
                    <small className="muted">{trackLabels[activeVariant.track]}</small>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="panel reviewEditorSurface" id="review-editor">
            <div className="reviewSimpleHeader">
              <div>
                <p className="eyebrow">编辑区</p>
                <h3>{platformLabels[activePlatform]}</h3>
              </div>
            </div>

            {activeVariant ? (
              <ReviewEditor
                angle={activeVariant.angle}
                brandName={brand.name}
                brandTone={brand.tone}
                initialBody={activeVariant.body}
                initialHook={activeVariant.coverHook}
                initialTitle={activeVariant.title}
                packId={activePack.id}
                platformKey={activePlatform}
                platformLabel={platformLabels[activePlatform]}
                redLines={brand.redLines}
                trackLabel={trackLabels[activeVariant.track]}
                variantId={activeVariant.id}
                whyNow={activePack.whyNow}
                whyUs={activePack.whyUs}
              />
            ) : null}
          </section>
        </main>

        <aside className="reviewActionColumn" id="review-actions">
          <section className="panel actionFocusPanel reviewActionPanel">
            <p className="eyebrow">步骤 3</p>
            <h3>{stepCopy.title}</h3>
            <p className="muted">{stepCopy.description}</p>
          </section>

          <section className="panel helperPanel reviewDecisionPanel">
            <div className="listItem">
              <strong>发布状态</strong>
              <span className="pill pill-neutral">{reviewStatusLabels[activePack.status]}</span>
            </div>
            <div className="definitionList compactDefinitionList">
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
              <div>
                <span>发布窗口</span>
                <strong>{activeVariant?.publishWindow ?? "未设置"}</strong>
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
              <strong>危险操作</strong>
              <span className="pill pill-warning">谨慎</span>
            </div>
            <p className="muted">这条选题不再需要时再删除；删除后关联发布任务会一起移除。</p>
            <PackDeleteButton packId={activePack.id} redirectHref="/review" />
          </section>
        </aside>
      </div>
    </div>
  );
}
