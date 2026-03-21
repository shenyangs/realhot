import { PublishActions } from "@/components/publish-actions";
import { ReviewActions } from "@/components/review-actions";
import { SectionHeader } from "@/components/section-header";
import { getPublishJobsForPack } from "@/lib/data";
import { getReviewQueue, summarizeGenerationContext } from "@/lib/services/content-packs";

export default async function ReviewPage() {
  const packs = await getReviewQueue();
  const [contexts, publishState] = await Promise.all([
    Promise.all(
      packs.map(async (pack) => ({
        id: pack.id,
        summary: await summarizeGenerationContext(pack)
      }))
    ),
    Promise.all(
      packs.map(async (pack) => ({
        id: pack.id,
        jobs: await getPublishJobsForPack(pack.id)
      }))
    )
  ]);

  return (
    <div className="page">
      <SectionHeader
        title="审核台"
        description="按热点包审核 2 条快反和 2 条观点内容，系统先给平台建议。"
      />

      <div className="stack">
        {packs.map((pack) => (
          <article className="panel" key={pack.id}>
            <div className="panelHeader">
              <div>
                <p className="eyebrow">{pack.id}</p>
                <h3>{pack.whyNow}</h3>
              </div>
              <span className="pill pill-warning">{pack.status}</span>
            </div>

            <div className="reviewMeta">
              <div>
                <strong>为什么是现在</strong>
                <p className="muted">{pack.whyNow}</p>
              </div>
              <div>
                <strong>为什么和品牌相关</strong>
                <p className="muted">{pack.whyUs}</p>
              </div>
              <div>
                <strong>生成上下文</strong>
                <pre>{contexts.find((item) => item.id === pack.id)?.summary}</pre>
              </div>
            </div>

            <div className="grid grid-2">
              <div className="subPanel">
                <strong>审核记录</strong>
                <p className="muted">审核人：{pack.reviewedBy ?? "未记录"}</p>
                <p className="muted">审核时间：{pack.reviewedAt ?? "未记录"}</p>
                <p className="muted">审核备注：{pack.reviewNote || "暂无"}</p>
              </div>
              <ReviewActions
                packId={pack.id}
                currentStatus={pack.status}
                currentNote={pack.reviewNote}
                defaultReviewer={pack.reviewedBy ?? pack.reviewOwner}
              />
            </div>

            <div className="grid grid-2">
              {(() => {
                const jobs = publishState.find((item) => item.id === pack.id)?.jobs ?? [];
                const queuedCount = jobs.filter((job) => job.status === "queued").length;
                const publishedCount = jobs.filter((job) => job.status === "published").length;
                const failedCount = jobs.filter((job) => job.status === "failed").length;

                return (
                  <PublishActions
                    packId={pack.id}
                    queuedCount={queuedCount}
                    publishedCount={publishedCount}
                    failedCount={failedCount}
                  />
                );
              })()}
              <div className="subPanel">
                <strong>发布状态</strong>
                <p className="muted">
                  当前支持“加入发布队列 + 内容包导出”链路，后续会接入平台真实代发。
                </p>
                <p className="muted">
                  导出可用于人工终审与跨平台协同；入队用于后续统一发布调度。
                </p>
              </div>
            </div>

            <div className="grid grid-2">
              {pack.variants.map((variant) => (
                <section className="subPanel" key={variant.id}>
                  <div className="listItem">
                    <strong>{variant.title}</strong>
                    <span className="pill pill-neutral">{variant.track}</span>
                  </div>
                  <p className="muted">{variant.angle}</p>
                  <p>{variant.body}</p>
                  <div className="stack compactStack">
                    <small>封面钩子：{variant.coverHook}</small>
                    <small>建议平台：{variant.platforms.join(" / ")}</small>
                    <small>发布时间：{variant.publishWindow}</small>
                  </div>
                </section>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
