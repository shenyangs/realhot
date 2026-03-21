import Link from "next/link";
import { PublishActions } from "@/components/publish-actions";
import { getBrandStrategyPack, getPublishJobsForPack, getReviewQueue } from "@/lib/data";
import type { Platform } from "@/lib/domain/types";

const platformLabels: Record<Platform, string> = {
  xiaohongshu: "小红书",
  wechat: "公众号",
  "video-channel": "视频号",
  douyin: "抖音"
};

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
      <section className="publishHero panel">
        <div className="publishHeroCopy">
          <p className="eyebrow">发布台</p>
          <h2>把已经改好、审好的内容集中送到真正的出口，而不是继续卡在编辑页里。</h2>
          <p className="muted heroText">
            这里专门处理待发布内容、发布队列和结果反馈。编辑台负责把稿子改顺，发布台负责把出口管理清楚。
          </p>
          <div className="buttonRow">
            <Link className="buttonLike primaryButton" href="/review">
              回到选题库
            </Link>
            <Link className="buttonLike subtleButton" href="/">
              回到今日选题台
            </Link>
          </div>
        </div>

        <div className="publishHeroMeta">
          <div className="metaPill">
            <span>当前品牌</span>
            <strong>{brand.name}</strong>
          </div>
          <div className="metaPill">
            <span>待发布选题</span>
            <strong>{readyPacks.length} 个热点包</strong>
          </div>
          <div className="metaPill">
            <span>队列状态</span>
            <strong>{queuedJobs.length} 条待执行，{publishedJobs.length} 条已发布</strong>
          </div>
        </div>
      </section>

      <section className="summaryGrid">
        <article className="panel summaryCard">
          <p className="eyebrow">待发布</p>
          <h3>{readyPacks.length} 个</h3>
          <p className="muted">这些内容包已经通过审核，可以在这里统一排队、导出或立即执行。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">队列中</p>
          <h3>{queuedJobs.length} 条</h3>
          <p className="muted">这里看的是已经进入队列但还没真正发出的任务，方便集中盯住节奏。</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">异常反馈</p>
          <h3>{failedJobs.length} 条</h3>
          <p className="muted">发布失败会回到这里，方便你快速判断是重试、导出，还是回到编辑台再修。</p>
        </article>
      </section>

      <div className="publishDeskLayout">
        <main className="publishMainColumn">
          <section className="panel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">待发布内容</p>
              <h3>这些选题任务已经可以进入发布台</h3>
            </div>
          </div>

            <div className="publishPackList">
              {readyPacks.length > 0 ? (
                readyPacks.map(({ pack, jobs }) => {
                  const queuedCount = jobs.filter((job) => job.status === "queued").length;
                  const publishedCount = jobs.filter((job) => job.status === "published").length;
                  const failedCount = jobs.filter((job) => job.status === "failed").length;

                  return (
                    <article className="publishPackCard" key={pack.id}>
                      <div className="panelHeader sectionTitle">
                        <div>
                          <p className="eyebrow">热点包 {pack.id}</p>
                          <h3>{pack.variants[0]?.title ?? pack.whyNow}</h3>
                          <p className="muted">{pack.whyUs}</p>
                        </div>
                        <Link className="sectionLink" href={`/review?pack=${pack.id}&variant=${pack.variants[0]?.id ?? ""}`}>
                          进入选题编辑
                        </Link>
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
                      </div>

                      <div className="publishVariantList">
                        {pack.variants.map((variant) => (
                          <div className="publishVariantItem" key={variant.id}>
                            <div>
                              <strong>{variant.title}</strong>
                              <p className="muted">{variant.angle}</p>
                            </div>
                            <span className="muted">{variant.platforms.map((platform) => platformLabels[platform]).join(" / ")}</span>
                          </div>
                        ))}
                      </div>

                      <PublishActions
                        packId={pack.id}
                        failedCount={failedCount}
                        publishedCount={publishedCount}
                        queuedCount={queuedCount}
                      />
                    </article>
                  );
                })
              ) : (
                <p className="emptyState">
                  当前还没有已通过审核的热点包进入发布台。你可以先去选题库把内容改到可审、可发状态。
                </p>
              )}
            </div>
          </section>
        </main>

        <aside className="publishAsideColumn">
          <section className="panel helperPanel">
            <p className="eyebrow">队列中任务</p>
            <h3>已经排队，等待执行</h3>
            <div className="publishJobList">
              {queuedJobs.length > 0 ? (
                queuedJobs.map((job) => (
                  <div className="publishJobItem" key={job.id}>
                    <div>
                      <strong>{job.variantTitle}</strong>
                      <p className="muted">{platformLabels[job.platform]} · {job.publishWindow}</p>
                    </div>
                    <span className="pill pill-neutral">已排队</span>
                  </div>
                ))
              ) : (
                <p className="emptyState">当前没有排队中的发布任务，可以先把已通过选题送进发布台。</p>
              )}
            </div>
          </section>

          <section className="panel helperPanel">
            <p className="eyebrow">已发布记录</p>
            <h3>已经成功送出的内容</h3>
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
                <p className="emptyState">当前还没有发布成功的记录。</p>
              )}
            </div>
          </section>

          <section className="panel helperPanel">
            <p className="eyebrow">失败反馈</p>
            <h3>失败后下一步该怎么处理</h3>
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
                <p className="emptyState">当前没有失败任务，发布出口比较干净。</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
