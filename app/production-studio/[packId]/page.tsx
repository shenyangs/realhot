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
import { getLatestProductionJobForPack } from "@/lib/services/production-studio";

export const dynamic = "force-dynamic";

export default async function ProductionStudioDetailPage({
  params
}: {
  params: Promise<{ packId: string }>;
}) {
  const { packId } = await params;
  const viewer = await getCurrentViewer();
  const [brand, pack, latestJob, aiRoutingConfig] = await Promise.all([
    getBrandStrategyPack(),
    getHotspotPack(packId),
    getLatestProductionJobForPack(packId),
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
          { label: "制作状态", value: latestJob ? "已生成首版" : "尚未制作" },
          { label: "负责人", value: pack.reviewOwner }
        ]}
        title="把通过的方案做成最终稿"
      />

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
