import Link from "next/link";
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
}>;

interface TaskGroup {
  key: ReviewStatus;
  label: string;
  description: string;
}

const taskGroups: TaskGroup[] = [
  {
    key: "pending",
    label: "待审核",
    description: "已经有稿，下一步是过审和决定是否进入发布。"
  },
  {
    key: "needs-edit",
    label: "待改稿",
    description: "这些题已经卡在内容质量或表达方式上，适合先清掉。"
  },
  {
    key: "approved",
    label: "已通过",
    description: "这些题已经可以进入发布台，不需要继续留在编辑主流程里。"
  }
];

export default async function ReviewPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [brand, packs] = await Promise.all([getBrandStrategyPack(), getReviewQueue()]);
  const statusFilter = resolvedSearchParams?.status ?? "all";
  const visiblePacks =
    statusFilter === "all" ? packs : packs.filter((pack) => pack.status === statusFilter);

  const activePack =
    visiblePacks.find((pack) => pack.id === resolvedSearchParams?.pack) ??
    visiblePacks[0] ??
    packs[0];

  if (!activePack) {
    return (
      <div className="page">
        <section className="panel">
          <p className="eyebrow">选题与审核</p>
          <h2>还没有可编辑的选题任务</h2>
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
  const counts = {
    all: packs.length,
    pending: packs.filter((pack) => pack.status === "pending").length,
    "needs-edit": packs.filter((pack) => pack.status === "needs-edit").length,
    approved: packs.filter((pack) => pack.status === "approved").length
  };

  return (
    <div className="page reviewWorkbenchPage">
      <section className="reviewHero panel">
        <div>
          <p className="eyebrow">选题库</p>
          <h2>先把题挑清楚、稿子改顺，再把它推进到可审可发。</h2>
          <p className="muted">
            这里是选题进入编辑和审核的主战场。你可以先选任务，再切平台版本，把内容改到可以出街的状态。
          </p>
        </div>
        <div className="reviewHeroMeta">
          <div className="metaPill">
            <span>当前品牌</span>
            <strong>{brand.name}</strong>
          </div>
          <div className="metaPill">
            <span>当前状态</span>
            <strong>{reviewStatusLabels[activePack.status]}</strong>
          </div>
        </div>
      </section>

      <section className="reviewToolbar panel">
        <div className="toolbarFilters">
          <Link
            aria-current={statusFilter === "all" ? "page" : undefined}
            className={`filterChip ${statusFilter === "all" ? "filterChipActive" : ""}`}
            href="/review"
          >
            全部选题
            <strong>{counts.all}</strong>
          </Link>
          <Link
            aria-current={statusFilter === "pending" ? "page" : undefined}
            className={`filterChip ${statusFilter === "pending" ? "filterChipActive" : ""}`}
            href="/review?status=pending"
          >
            待审核
            <strong>{counts.pending}</strong>
          </Link>
          <Link
            aria-current={statusFilter === "needs-edit" ? "page" : undefined}
            className={`filterChip ${statusFilter === "needs-edit" ? "filterChipActive" : ""}`}
            href="/review?status=needs-edit"
          >
            待改稿
            <strong>{counts["needs-edit"]}</strong>
          </Link>
          <Link
            aria-current={statusFilter === "approved" ? "page" : undefined}
            className={`filterChip ${statusFilter === "approved" ? "filterChipActive" : ""}`}
            href="/review?status=approved"
          >
            已通过
            <strong>{counts.approved}</strong>
          </Link>
        </div>
        <div className="toolbarActions">
          <Link className="buttonLike subtleButton" href="/hotspots">
            去热点机会池补题
          </Link>
          <Link className="buttonLike" href="/publish">
            去发布台看出口
          </Link>
        </div>
      </section>

      <section className="summaryGrid">
        <article className="panel summaryCard">
          <p className="eyebrow">当前可见</p>
          <h3>{visiblePacks.length} 个选题任务</h3>
          <p className="muted">筛选后只保留你现在最需要处理的一组任务，避免在编辑台里来回找题。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">优先清理</p>
          <h3>{counts["needs-edit"]} 个待改稿</h3>
          <p className="muted">这些题最容易卡住团队节奏，通常应该先于新选题处理。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">可进入发布</p>
          <h3>{counts.approved} 个已通过</h3>
          <p className="muted">已经通过的题尽量尽快进入发布台，不要继续占据编辑注意力。</p>
        </article>
      </section>

      <div className="reviewWorkbenchLayout">
        <aside className="reviewNavColumn">
          <section className="panel reviewTaskNav">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">选题任务列表</p>
                <h3>先按状态找到题，再进入平台版本</h3>
              </div>
              <Link className="sectionLink" href="/">
                回到今日选题台
              </Link>
            </div>

            {visiblePacks.length > 0 ? (
              <div className="taskGroupStack">
                {taskGroups.map((group) => {
                  const groupPacks = visiblePacks.filter((pack) => pack.status === group.key);

                  if (groupPacks.length === 0) {
                    return null;
                  }

                  return (
                    <section className="taskGroupSection" key={group.key}>
                      <div className="taskGroupHeader">
                        <div>
                          <strong>{group.label}</strong>
                          <p className="muted">{group.description}</p>
                        </div>
                        <span className={`pill pill-${getPackStatusTone(group.key)}`}>{groupPacks.length}</span>
                      </div>

                      <div className="taskNavList">
                        {groupPacks.map((pack) => {
                          const defaultVariant = pack.variants[0];
                          const isActive = pack.id === activePack.id;

                          return (
                            <Link
                              className={`taskNavItem ${isActive ? "taskNavItemActive" : ""}`}
                              href={`/review?status=${statusFilter}&pack=${pack.id}${defaultVariant ? `&variant=${defaultVariant.id}&platform=${defaultVariant.platforms[0]}` : ""}`}
                              key={pack.id}
                            >
                              <div className="listItem">
                                <strong>{defaultVariant?.title ?? pack.whyNow}</strong>
                                <span className={`pill pill-${getPackStatusTone(pack.status)}`}>
                                  {reviewStatusLabels[pack.status]}
                                </span>
                              </div>
                              <p className="muted">{pack.whyUs}</p>
                              <small className="muted">{pack.reviewOwner}</small>
                            </Link>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <p className="emptyState">当前筛选条件下没有选题任务。可以切换状态，或者回热点机会池补充新题。</p>
            )}
          </section>

          <section className="panel taskDefinitionPanel">
            <p className="eyebrow">任务定义</p>
            <h3>{activeVariant?.title ?? activePack.whyNow}</h3>
            <div className="definitionList">
              <div>
                <span>来源判断</span>
                <strong>{activePack.whyNow}</strong>
              </div>
              <div>
                <span>品牌关联</span>
                <strong>{activePack.whyUs}</strong>
              </div>
              <div>
                <span>负责人</span>
                <strong>{activePack.reviewOwner}</strong>
              </div>
              <div>
                <span>当前处理平台</span>
                <strong>{activeDraft ? platformLabels[activeDraft.platform] : "未选择"}</strong>
              </div>
            </div>
          </section>

          <section className="panel platformTabsPanel">
            <p className="eyebrow">平台版本</p>
            <div className="platformTabsList">
              {platformDrafts.map((draft) => {
                const isActive =
                  draft.variant.id === activeDraft?.variant.id &&
                  draft.platform === activeDraft?.platform;

                return (
                  <Link
                    className={`platformTab ${isActive ? "platformTabActive" : ""}`}
                    href={`/review?pack=${activePack.id}&variant=${draft.variant.id}&platform=${draft.platform}`}
                    key={draft.slotId}
                  >
                    <div>
                      <strong>{platformLabels[draft.platform]}</strong>
                      <p className="muted">{trackLabels[draft.variant.track]} · {draft.variant.publishWindow}</p>
                      <small className="muted">{draft.variant.title}</small>
                    </div>
                    <span className={`pill pill-${getPackStatusTone(activePack.status)}`}>
                      {reviewStatusLabels[activePack.status]}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        </aside>

        <main className="reviewMainColumn">
          {activeVariant ? (
            <ReviewEditor
              packId={activePack.id}
              angle={activeDraft?.variant.angle ?? activeVariant.angle}
              brandName={brand.name}
              brandTone={brand.tone}
              initialBody={activeDraft?.variant.body ?? activeVariant.body}
              initialHook={activeDraft?.variant.coverHook ?? activeVariant.coverHook}
              initialTitle={activeDraft?.variant.title ?? activeVariant.title}
              platformKey={activeDraft?.platform ?? activeVariant.platforms[0]}
              platformLabel={activeDraft ? platformLabels[activeDraft.platform] : platformLabels[activeVariant.platforms[0]]}
              redLines={brand.redLines}
              trackLabel={trackLabels[activeDraft?.variant.track ?? activeVariant.track]}
              variantId={activeDraft?.variant.id ?? activeVariant.id}
              whyNow={activePack.whyNow}
              whyUs={activePack.whyUs}
            />
          ) : null}
        </main>

        <aside className="reviewActionColumn">
          <ReviewActions
            packId={activePack.id}
            currentStatus={activePack.status}
            currentNote={activePack.reviewNote}
            defaultReviewer={activePack.reviewedBy ?? activePack.reviewOwner}
          />

          <PublishActions
            packId={activePack.id}
            failedCount={failedCount}
            publishedCount={publishedCount}
            queuedCount={queuedCount}
          />

          <section className="panel helperPanel">
            <strong>当前出口状态</strong>
            <p className="muted">先在中间稿件区把内容改顺，再在右侧完成审核和发布动作。</p>
            <ul className="simpleList">
              <li>待排队：{queuedCount} 条</li>
              <li>已发布：{publishedCount} 条</li>
              <li>失败：{failedCount} 条</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
