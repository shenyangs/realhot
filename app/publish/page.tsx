import Link from "next/link";
import { EmptyStateCard } from "@/components/empty-state-card";
import { PackDeleteButton } from "@/components/pack-delete-button";
import { PageHero } from "@/components/page-hero";
import { PublishActions } from "@/components/publish-actions";
import { PublishJobDeleteButton } from "@/components/publish-job-delete-button";
import { PublishQueueClearButton } from "@/components/publish-queue-clear-button";
import { OneClickProductionButton } from "@/components/one-click-production-button";
import { getBrandStrategyPack, getPublishJobsForPack, getReviewQueue } from "@/lib/data";
import type { Platform } from "@/lib/domain/types";

const platformLabels: Record<Platform, string> = {
  xiaohongshu: "小红书",
  wechat: "公众号",
  "video-channel": "视频号",
  douyin: "抖音"
};

function getBodyPreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();

  if (normalized.length <= 110) {
    return normalized;
  }

  return `${normalized.slice(0, 110)}...`;
}

export default async function PublishPage() {
  const [brand, packs] = await Promise.all([getBrandStrategyPack(), getReviewQueue()]);

  const packJobs = await Promise.all(
    packs.map(async (pack) => ({
      pack,
      jobs: await getPublishJobsForPack(pack.id)
    }))
  );

  const readyPacks = packJobs.filter(({ pack }) => pack.status === "approved");
  const allJobs = packJobs.flatMap(({ pack, jobs }) =>
    jobs.map((job) => {
      const variant = pack.variants.find((item) => item.id === job.variantId);
      return {
        ...job,
        packId: pack.id,
        reviewOwner: pack.reviewOwner,
        variantTitle: variant?.title ?? "未命名内容",
        publishWindow: variant?.publishWindow ?? "未设置"
      };
    })
  );

  const queuedJobs = allJobs.filter((job) => job.status === "queued");
  const publishedJobs = allJobs.filter((job) => job.status === "published");
  const failedJobs = allJobs.filter((job) => job.status === "failed");
  const failedPacks = packJobs
    .map(({ pack, jobs }) => ({
      pack,
      jobs,
      failedJobs: jobs.filter((job) => job.status === "failed"),
      queuedCount: jobs.filter((job) => job.status === "queued").length,
      publishedCount: jobs.filter((job) => job.status === "published").length,
      failedCount: jobs.filter((job) => job.status === "failed").length
    }))
    .filter((item) => item.failedJobs.length > 0);

  return (
    <div className="page publishDeskPage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="/review">
              回到选题详情台
            </Link>
            <Link className="buttonLike subtleButton" href="/production-studio">
              进入内容深度制作
            </Link>
            <Link className="buttonLike subtleButton" href="/">
              回到工作台
            </Link>
          </>
        }
        description="先看待发布内容，再看发布队列，最后处理失败反馈。"
        eyebrow="发布总览"
        facts={[
          { label: "当前品牌", value: brand.name },
          { label: "待发布选题", value: `${readyPacks.length} 个热点包` },
          { label: "队列状态", value: `${queuedJobs.length} 条待执行` },
          { label: "已发布", value: `${publishedJobs.length} 条` }
        ]}
        context={brand.name}
        title="发布执行台"
      />

      <section className="summaryGrid">
        <article className="panel summaryCard">
          <p className="eyebrow">待发布</p>
          <h3>{readyPacks.length} 个</h3>
          <p className="muted">已通过审核，待进入发布。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">队列中</p>
          <h3>{queuedJobs.length} 条</h3>
          <p className="muted">已进入队列，等待执行。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">异常反馈</p>
          <h3>{failedJobs.length} 条</h3>
          <p className="muted">失败任务在这里集中处理。</p>
        </article>
      </section>

      <div className="publishDeskLayout">
        <main className="publishMainColumn">
          <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">待发布内容</p>
              <h3>哪些题准备发</h3>
            </div>
          </div>

            <div className="publishPackList">
              {readyPacks.length > 0 ? (
                readyPacks.map(({ pack, jobs }) => {
                  const queuedCount = jobs.filter((job) => job.status === "queued").length;
                  const publishedCount = jobs.filter((job) => job.status === "published").length;
                  const failedCount = jobs.filter((job) => job.status === "failed").length;
                  const defaultVariant = pack.variants[0];

                  return (
                    <article className="publishPackCard" key={pack.id}>
                      <div className="publishPackHeader">
                        <div className="publishPackHeading">
                          <p className="eyebrow">热点包 {pack.id}</p>
                          <h3 className="publishPackTitle">{pack.variants[0]?.title ?? pack.whyNow}</h3>
                          <p className="muted publishPackSummary">{pack.whyUs}</p>
                        </div>
                        <div className="publishPackHeaderActions">
                          <Link
                            className="buttonLike subtleButton publishPackAction"
                            href={`/review?pack=${pack.id}&variant=${defaultVariant?.id ?? ""}`}
                          >
                            查看选题详情
                          </Link>
                          <Link className="buttonLike subtleButton publishPackAction" href={`/production-studio/${pack.id}`}>
                            打开内容制作台
                          </Link>
                        </div>
                      </div>

                      <div className="publishPackMeta">
                        <div>
                          <span>负责人</span>
                          <strong>{pack.reviewOwner}</strong>
                        </div>
                        <div>
                          <span>版本数</span>
                          <strong>{pack.variants.length} 条</strong>
                        </div>
                        <div>
                          <span>最佳发布时间</span>
                          <strong>{pack.variants[0]?.publishWindow ?? "未设置"}</strong>
                        </div>
                        <div>
                          <span>发布进度</span>
                          <strong>
                            排队 {queuedCount} / 发布 {publishedCount} / 失败 {failedCount}
                          </strong>
                        </div>
                      </div>

                      <div className="publishVariantList">
                        {pack.variants.map((variant) => (
                          <Link
                            className="publishVariantItem publishVariantLink"
                            href={`/review?pack=${pack.id}&variant=${variant.id}&platform=${variant.platforms[0] ?? ""}`}
                            key={variant.id}
                          >
                            <div className="publishVariantMain">
                              <strong className="publishVariantTitle">{variant.title}</strong>
                              <p className="muted publishVariantSummary">{variant.angle}</p>
                              <p className="muted publishVariantExcerpt">{getBodyPreview(variant.body)}</p>
                            </div>
                            <div className="publishVariantMeta">
                              <span className="muted">{variant.platforms.map((platform) => platformLabels[platform]).join(" / ")}</span>
                              <span className="publishVariantOpen">查看详情</span>
                            </div>
                          </Link>
                        ))}
                      </div>

                      <OneClickProductionButton compact packId={pack.id} />

                      <PublishActions
                        packId={pack.id}
                        failedCount={failedCount}
                        publishedCount={publishedCount}
                        queuedCount={queuedCount}
                      />
                      <PackDeleteButton label="删除这题" packId={pack.id} redirectHref="/publish" />
                    </article>
                  );
                })
              ) : (
                <EmptyStateCard
                  actionLabel="去选题库推进内容"
                  description="当前暂无可发布内容。"
                  eyebrow="发布台"
                  href="/review"
                  title="暂无待发布内容"
                />
              )}
            </div>
          </section>
        </main>

        <aside className="publishAsideColumn">
          <section className="panel helperPanel">
            <div className="listItem">
              <div>
                <p className="eyebrow">队列中任务</p>
                <h3>待执行队列</h3>
              </div>
              <PublishQueueClearButton label="清空全部待执行" />
            </div>
            <div className="publishJobList">
              {queuedJobs.length > 0 ? (
                queuedJobs.map((job) => (
                  <div className="publishJobItem" key={job.id}>
                    <div>
                      <strong>{job.variantTitle}</strong>
                      <p className="muted">{platformLabels[job.platform]} · {job.publishWindow}</p>
                    </div>
                    <div className="publishJobControls">
                      <span className="pill pill-neutral">已排队</span>
                      <PublishJobDeleteButton jobId={job.id} />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyStateCard
                  actionLabel="去看待发布内容"
                  description="当前队列为空。"
                  eyebrow="队列中任务"
                  href="/publish"
                  title="暂无队列任务"
                />
              )}
            </div>
          </section>

          <section className="panel helperPanel">
            <p className="eyebrow">已发布记录</p>
            <h3>发布记录</h3>
            <div className="publishJobList">
              {publishedJobs.length > 0 ? (
                publishedJobs.map((job) => (
                  <div className="publishJobItem" key={job.id}>
                    <div>
                      <strong>{job.variantTitle}</strong>
                      <p className="muted">
                        {platformLabels[job.platform]} · {job.publishedAt ?? "已执行"}
                      </p>
                    </div>
                    <span className="pill pill-positive">已发布</span>
                  </div>
                ))
              ) : (
                <EmptyStateCard
                  description="成功发布的记录会显示在这里。"
                  eyebrow="已发布记录"
                  title="暂无发布记录"
                />
              )}
            </div>
          </section>

          <section className="panel helperPanel">
            <p className="eyebrow">失败反馈</p>
            <h3>失败任务</h3>
            <div className="publishJobList">
              {failedPacks.length > 0 ? (
                failedPacks.map(({ pack, failedJobs: items, queuedCount, publishedCount, failedCount }) => (
                  <div className="publishFailureCard" key={pack.id}>
                    <div className="listItem">
                      <strong>{pack.variants[0]?.title ?? pack.whyNow}</strong>
                      <span className="pill pill-warning">失败 {failedCount} 条</span>
                    </div>
                    <p className="muted">
                      {items[0]?.failureReason ?? "发布执行失败"} · 负责人 {pack.reviewOwner}
                    </p>
                    <div className="publishJobList compactPublishList">
                      {items.slice(0, 2).map((job) => {
                        const variant = pack.variants.find((item) => item.id === job.variantId);
                        return (
                          <div className="publishJobItem compactPublishItem" key={job.id}>
                            <div>
                              <strong>{variant?.title ?? "未命名内容"}</strong>
                              <p className="muted">
                                {platformLabels[job.platform]} · {job.failureReason ?? "未知失败原因"}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="buttonRow">
                      <Link className="buttonLike subtleButton" href={`/review?pack=${pack.id}&variant=${pack.variants[0]?.id ?? ""}`}>
                        回到选题编辑
                      </Link>
                    </div>
                    <PublishActions
                      compact
                      failedCount={failedCount}
                      packId={pack.id}
                      publishedCount={publishedCount}
                      queuedCount={queuedCount}
                    />
                  </div>
                ))
              ) : (
                <EmptyStateCard
                  description="当前没有失败任务。"
                  eyebrow="失败反馈"
                  title="暂无失败任务"
                />
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
