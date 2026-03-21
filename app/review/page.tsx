import type { Route } from "next";
import Link from "next/link";
import { EmptyStateCard } from "@/components/empty-state-card";
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

const statusFocusCopy: Record<
  ReviewStatus,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  pending: {
    eyebrow: "当前重点",
    title: "这条题已经有稿，下一步是审核通过",
    description: "先确认内容是否达标，再决定是否进入发布台。"
  },
  approved: {
    eyebrow: "当前重点",
    title: "这条题已经通过，可以直接送进发布台",
    description: "编辑主流程已经完成，接下来只需要处理发布和导出。"
  },
  "needs-edit": {
    eyebrow: "当前重点",
    title: "这条题先别急着审核，先把稿子改顺",
    description: "先完成修改，再恢复到待审核，避免审核和发布动作同时抢注意力。"
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
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [brand, packs] = await Promise.all([getBrandStrategyPack(), getReviewQueue()]);
  const statusFilter = resolvedSearchParams?.status ?? "all";
  const searchQuery = resolvedSearchParams?.q?.trim() ?? "";
  const ownerFilter = resolvedSearchParams?.owner?.trim() ?? "all";
  const sortBy = resolvedSearchParams?.sort ?? "priority";
  const ownerOptions = [...new Set(packs.map((pack) => pack.reviewOwner))].sort((left, right) =>
    left.localeCompare(right, "zh-CN")
  );

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
    <div className="page reviewFlatPage">
      <section className="reviewFlatHeader">
        <div>
          <p className="eyebrow">选题库</p>
          <h2>先选题，再改稿，再处理审核和发布。</h2>
          <p className="muted">这一页只保留主流程，不再把信息摊成多列。</p>
        </div>
        <div className="reviewFlatMeta">
          <span className="reviewInlineMeta">当前品牌：{brand.name}</span>
          <span className="reviewInlineMeta">当前状态：{reviewStatusLabels[activePack.status]}</span>
        </div>
      </section>

      <nav className="reviewModuleBar" aria-label="review-modules">
        <a className="reviewModuleChip" href="#review-tasks">1. 找题</a>
        <a className="reviewModuleChip" href="#review-context">2. 看当前版本</a>
        <a className="reviewModuleChip" href="#review-editor">3. 改稿</a>
        <a className="reviewModuleChip" href="#review-actions">4. 审核 / 发布</a>
        <Link className="reviewModuleChip" href="/hotspots">去热点看板补题</Link>
        <Link className="reviewModuleChip" href="/publish">进入发布台</Link>
      </nav>

      <div className="reviewSimpleSheet">
        <section className="reviewSimpleSection" id="review-tasks">
          <div className="reviewSimpleHeader">
            <div>
              <p className="eyebrow">找题</p>
              <h3>先把要处理的题挑出来</h3>
            </div>
            <span className="muted">当前可见 {visiblePacks.length} 个任务</span>
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
              全部选题
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

          <form action="/review" className="reviewSearchFormSimple" method="get">
            <input name="status" type="hidden" value={statusFilter} />
            <label className="field">
              <span>搜索选题</span>
              <input
                defaultValue={searchQuery}
                name="q"
                placeholder="按标题、切入角度、负责人搜索"
              />
            </label>
            <label className="field">
              <span>负责人</span>
              <select defaultValue={ownerFilter} name="owner">
                <option value="all">全部负责人</option>
                {ownerOptions.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>排序方式</span>
              <select defaultValue={sortBy} name="sort">
                <option value="priority">按优先级</option>
                <option value="deadline">按截止时间</option>
                <option value="owner">按负责人</option>
              </select>
            </label>
            <div className="buttonRow">
              <button type="submit">应用筛选</button>
              <Link className="buttonLike subtleButton" href={`/review?status=${statusFilter}`}>
                清空条件
              </Link>
            </div>
          </form>

          {visiblePacks.length > 0 ? (
            <div className="reviewTaskListSimple">
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
                      <strong>{defaultVariant?.title ?? pack.whyNow}</strong>
                      <p className="muted">{pack.whyUs}</p>
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
                      <span className="tag">{defaultVariant?.publishWindow ?? "未设发布时间"}</span>
                      <small className="muted">{pack.reviewOwner}</small>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyStateCard
              actionLabel="去热点看板补题"
              description="当前筛选条件下没有选题任务。你可以切换筛选条件，或者先回热点看板把新题送进选题库。"
              eyebrow="选题库"
              href="/hotspots"
              title="这里暂时没有符合条件的选题"
            />
          )}
        </section>

        <section className="reviewSimpleSection" id="review-context">
          <div className="reviewSimpleHeader">
            <div>
              <p className="eyebrow">当前版本</p>
              <h3>{activeVariant?.title ?? activePack.whyNow}</h3>
            </div>
            <span className={`pill pill-${getPackStatusTone(activePack.status)}`}>
              {reviewStatusLabels[activePack.status]}
            </span>
          </div>

          <div className="reviewContextLine">
            <span>优先级：{priorityLabel}</span>
            <span>负责人：{activePack.reviewOwner}</span>
            <span>发布时间：{activeVariant?.publishWindow ?? "未设置"}</span>
            <span>当前平台：{activeDraft ? platformLabels[activeDraft.platform] : "未选择"}</span>
          </div>

          <div className="reviewContextCopy">
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

        <section className="reviewSimpleSection" id="review-editor">
          <div className="reviewSimpleHeader">
            <div>
              <p className="eyebrow">改稿</p>
              <h3>先把当前平台这一版改顺</h3>
            </div>
          </div>

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
        </section>

        <section className="reviewSimpleSection" id="review-actions">
          <div className="reviewSimpleHeader">
            <div>
              <p className="eyebrow">审核 / 发布</p>
              <h3>最后只处理当前这一步该做的动作</h3>
            </div>
          </div>

          <section className="actionFocusPanel reviewActionBlock">
            <p className="eyebrow">{statusFocusCopy[activePack.status].eyebrow}</p>
            <h3>{statusFocusCopy[activePack.status].title}</h3>
            <p className="muted">{statusFocusCopy[activePack.status].description}</p>
          </section>

          {activePack.status === "approved" ? (
            <PublishActions
              packId={activePack.id}
              failedCount={failedCount}
              publishedCount={publishedCount}
              queuedCount={queuedCount}
            />
          ) : (
            <ReviewActions
              packId={activePack.id}
              currentStatus={activePack.status}
              currentNote={activePack.reviewNote}
              defaultReviewer={activePack.reviewedBy ?? activePack.reviewOwner}
            />
          )}

          {activePack.status !== "approved" ? (
            <section className="helperPanel reviewNextStepBlock">
              <strong>编辑完成后的下一步</strong>
              <p className="muted">
                {activePack.status === "needs-edit"
                  ? "先把这一版改顺，再恢复到待审核，最后再进入发布台。"
                  : "如果内容已经达标，就在这里完成审核；通过后再进入发布台统一处理出口。"}
              </p>
            </section>
          ) : null}

          {activePack.status !== "approved" ? (
            <PublishActions
              compact
              packId={activePack.id}
              failedCount={failedCount}
              publishedCount={publishedCount}
              queuedCount={queuedCount}
            />
          ) : null}

          <section className="helperPanel reviewNextStepBlock">
            <strong>当前出口状态</strong>
            <ul className="simpleList">
              <li>待排队：{queuedCount} 条</li>
              <li>已发布：{publishedCount} 条</li>
              <li>失败：{failedCount} 条</li>
            </ul>
          </section>
        </section>
      </div>
    </div>
  );
}
