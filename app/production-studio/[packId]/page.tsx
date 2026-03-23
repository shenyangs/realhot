import Link from "next/link";
import { notFound } from "next/navigation";
import { OneClickProductionButton } from "@/components/one-click-production-button";
import { PageHero } from "@/components/page-hero";
import { ProductionStudioEditor } from "@/components/production-studio-editor";
import { writeAuditLog } from "@/lib/auth/audit";
import { getCurrentViewer } from "@/lib/auth/session";
import { getBrandStrategyPack, getHotspotPack } from "@/lib/data";
import { getAiRoutingConfig } from "@/lib/services/ai-routing-config";
import { resolveFeatureProviderConfig } from "@/lib/services/model-router";
import { getLatestProductionJobForPack, getLatestProductionJobForPackByType } from "@/lib/services/production-studio";

export const dynamic = "force-dynamic";

type ProductionJobType = "article" | "video" | "one_click";

const jobTypeLabels: Record<ProductionJobType, string> = {
  article: "图文",
  video: "视频",
  one_click: "一键全做"
};

const jobTypeDescriptions: Record<ProductionJobType, string> = {
  article: "适合先完成公众号 / 图文首版",
  video: "适合单独推进短视频与口播",
  one_click: "适合一次性产出整套首版"
};

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

function getJobUpdatedAtLabel(job?: Awaited<ReturnType<typeof getLatestProductionJobForPack>>) {
  return job ? new Date(job.updatedAt).toLocaleString("zh-CN") : "暂无记录";
}

export default async function ProductionStudioDetailPage({
  params
}: {
  params: Promise<{ packId: string }>;
}) {
  const { packId } = await params;
  const viewer = await getCurrentViewer();
  const [brand, pack, latestJob, latestArticleJob, latestVideoJob, latestOneClickJob, aiRoutingConfig] = await Promise.all([
    getBrandStrategyPack(),
    getHotspotPack(packId),
    getLatestProductionJobForPack(packId),
    getLatestProductionJobForPackByType(packId, "article"),
    getLatestProductionJobForPackByType(packId, "video"),
    getLatestProductionJobForPackByType(packId, "one_click"),
    getAiRoutingConfig()
  ]);

  if (!pack) {
    notFound();
  }

  const canRun = pack.status === "approved";
  const productionRoute = resolveFeatureProviderConfig("production-generation", aiRoutingConfig);

  if (viewer.isAuthenticated) {
    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.user.id,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "production_job",
      entityId: latestJob?.id ?? pack.id,
      action: "production.pack_viewed",
      payload: {
        packId: pack.id,
        variantTitle: pack.variants[0]?.title,
        status: pack.status,
        hasGeneratedDraft: Boolean(latestJob)
      }
    });
  }

  return (
    <div className="page productionStudioDetailPage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="/production-studio">
              返回制作列表
            </Link>
            <Link className="buttonLike subtleButton" href={`/review?pack=${pack.id}&variant=${pack.variants[0]?.id ?? ""}`}>
              回审核台
            </Link>
            <Link className="buttonLike subtleButton" href="/publish">
              去发布中心
            </Link>
          </>
        }
        context={pack.variants[0]?.title ?? pack.whyNow}
        description="这里负责把通过审核的方案做成最终稿，再推入发布。"
        eyebrow="内容制作"
        facts={[
          { label: "当前品牌", value: brand.name },
          { label: "审核状态", value: canRun ? "已通过" : pack.status === "pending" ? "待审核" : "待改稿" },
          { label: "图文任务", value: jobStatusLabel(latestArticleJob?.status) },
          { label: "视频任务", value: jobStatusLabel(latestVideoJob?.status) },
          { label: "一键全做", value: jobStatusLabel(latestOneClickJob?.status) },
          { label: "负责人", value: pack.reviewOwner }
        ]}
        title="把通过的方案做成最终稿"
      />

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">任务状态</p>
            <h3>图文与视频分开看</h3>
          </div>
        </div>

        <div className="summaryGrid productionStatusGrid">
          {(
            [
              ["article", latestArticleJob],
              ["video", latestVideoJob],
              ["one_click", latestOneClickJob]
            ] as Array<[ProductionJobType, typeof latestJob]>
          ).map(([jobType, job]) => (
            <article className="summaryCard productionStatusCard" key={jobType}>
              <div className="statusCardLabelRow">
                <span className={`statusDot statusDot-${jobStatusTone(job?.status)}`} />
                <p className="eyebrow">{jobTypeLabels[jobType]}</p>
              </div>
              <h3>{jobStatusLabel(job?.status)}</h3>
              <p className="muted">{jobTypeDescriptions[jobType]}</p>
              <span className={`pill pill-${jobStatusTone(job?.status)}`}>{getJobUpdatedAtLabel(job)}</span>
            </article>
          ))}
        </div>

        <p className="muted">
          最近一次更新：{latestJob ? new Date(latestJob.updatedAt).toLocaleString("zh-CN") : "暂无制作记录"}
        </p>
      </section>

      <section className="panel">
        <OneClickProductionButton
          disabled={!canRun}
          disabledReason="这条选题还没审核通过；先在审核台点通过，再回这里一键制作。"
          defaultModel={productionRoute.model}
          defaultProvider={productionRoute.provider}
          packId={pack.id}
        />
      </section>

      <ProductionStudioEditor
        canRun={canRun}
        defaultModel={productionRoute.model}
        defaultProvider={productionRoute.provider}
        initialJob={latestJob}
        packId={pack.id}
      />
    </div>
  );
}
