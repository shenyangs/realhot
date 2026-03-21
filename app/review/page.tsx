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
}>;

export default async function ReviewPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [brand, packs] = await Promise.all([getBrandStrategyPack(), getReviewQueue()]);

  const activePack =
    packs.find((pack) => pack.id === resolvedSearchParams?.pack) ??
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

  return (
    <div className="page reviewWorkbenchPage">
      <section className="reviewHero panel">
        <div>
          <p className="eyebrow">选题与审核</p>
          <h2>先把稿子改清楚，再把审核和发布动作接上。</h2>
          <p className="muted">
            以选题任务为中心处理多平台版本，减少在热点、内容、审核之间来回跳页。
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

      <div className="reviewWorkbenchLayout">
        <aside className="reviewNavColumn">
          <section className="panel reviewTaskNav">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">今天的选题任务</p>
                <h3>先选任务，再进平台版本</h3>
              </div>
              <Link className="sectionLink" href="/">
                回到今日选题台
              </Link>
            </div>

            <div className="taskNavList">
              {packs.map((pack) => {
                const defaultVariant = pack.variants[0];
                const isActive = pack.id === activePack.id;

                return (
                  <Link
                    className={`taskNavItem ${isActive ? "taskNavItemActive" : ""}`}
                    href={`/review?pack=${pack.id}${defaultVariant ? `&variant=${defaultVariant.id}&platform=${defaultVariant.platforms[0]}` : ""}`}
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
              angle={activeDraft?.variant.angle ?? activeVariant.angle}
              brandName={brand.name}
              brandTone={brand.tone}
              initialBody={activeDraft?.variant.body ?? activeVariant.body}
              initialHook={activeDraft?.variant.coverHook ?? activeVariant.coverHook}
              initialTitle={activeDraft?.variant.title ?? activeVariant.title}
              platformLabel={activeDraft ? platformLabels[activeDraft.platform] : platformLabels[activeVariant.platforms[0]]}
              redLines={brand.redLines}
              trackLabel={trackLabels[activeDraft?.variant.track ?? activeVariant.track]}
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
