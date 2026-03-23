import Link from "next/link";
import { EmptyStateCard } from "@/components/empty-state-card";
import { OneClickProductionButton } from "@/components/one-click-production-button";
import { PageHero } from "@/components/page-hero";
import { getBrandStrategyPack, getReviewQueue } from "@/lib/data";
import { listProductionJobs } from "@/lib/services/production-studio";

function jobStatusLabel(status?: string) {
  if (status === "completed") {
    return "已完成";
  }

  if (status === "failed") {
    return "失败";
  }

  if (status === "running") {
    return "执行中";
  }

  if (status === "queued") {
    return "排队中";
  }

  return "未制作";
}

function jobStatusTone(status?: string) {
  if (status === "completed") {
    return "positive";
  }

  if (status === "failed") {
    return "warning";
  }

  return "neutral";
}

export default async function ProductionStudioPage() {
  const [brand, packs, jobs] = await Promise.all([getBrandStrategyPack(), getReviewQueue(), listProductionJobs()]);

  const latestJobByPack = new Map<string, (typeof jobs)[number]>();

  for (const job of jobs) {
    if (!latestJobByPack.has(job.packId)) {
      latestJobByPack.set(job.packId, job);
    }
  }

  const approvedPacks = packs.filter((pack) => pack.status === "approved");

  return (
    <div className="page productionStudioPage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="/review">
              回到选题详情台
            </Link>
            <Link className="buttonLike subtleButton" href="/publish">
              查看发布执行台
            </Link>
          </>
        }
        context={brand.name}
        description="审核通过后可一键生成图文、视频、口播与字幕，再在本页完成最终微调。"
        eyebrow="内容深度制作"
        facts={[
          { label: "可执行选题", value: `${approvedPacks.length} 条` },
          { label: "已制作", value: `${jobs.filter((job) => job.status === "completed").length} 条` },
          { label: "制作失败", value: `${jobs.filter((job) => job.status === "failed").length} 条` },
          { label: "模式", value: "可演示流水线" }
        ]}
        title="最终热点运营平台"
      />

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">一键制作入口</p>
            <h3>按选题进入深度制作</h3>
          </div>
        </div>

        {packs.length > 0 ? (
          <div className="productionPackList">
            {packs.map((pack) => {
              const latestJob = latestJobByPack.get(pack.id);

              return (
                <article className="productionPackCard" key={pack.id}>
                  <div className="listItem">
                    <strong>{pack.variants[0]?.title ?? pack.whyNow}</strong>
                    <span className={`pill pill-${jobStatusTone(latestJob?.status)}`}>
                      {jobStatusLabel(latestJob?.status)}
                    </span>
                  </div>

                  <p className="muted">{pack.whyUs}</p>

                  <div className="definitionList compactDefinitionList">
                    <div>
                      <span>审核状态</span>
                      <strong>{pack.status === "approved" ? "已通过" : pack.status === "pending" ? "待审核" : "待改稿"}</strong>
                    </div>
                    <div>
                      <span>负责人</span>
                      <strong>{pack.reviewOwner}</strong>
                    </div>
                    <div>
                      <span>最近制作</span>
                      <strong>{latestJob ? new Date(latestJob.updatedAt).toLocaleString("zh-CN") : "暂无"}</strong>
                    </div>
                  </div>

                  <OneClickProductionButton
                    compact
                    disabled={pack.status !== "approved"}
                    disabledReason="当前选题未通过审核，不能执行一键制作。"
                    packId={pack.id}
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyStateCard
            actionLabel="去热点看板补题"
            description="当前没有选题。先生成选题包，再来做一键制作。"
            eyebrow="内容深度制作"
            href="/hotspots"
            title="暂无可制作选题"
          />
        )}
      </section>
    </div>
  );
}
