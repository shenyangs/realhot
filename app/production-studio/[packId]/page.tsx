import Link from "next/link";
import { notFound } from "next/navigation";
import { OneClickProductionButton } from "@/components/one-click-production-button";
import { PageHero } from "@/components/page-hero";
import { ProductionStudioEditor } from "@/components/production-studio-editor";
import { getBrandStrategyPack, getHotspotPack } from "@/lib/data";
import { getLatestProductionJobForPack } from "@/lib/services/production-studio";

export default async function ProductionStudioDetailPage({
  params
}: {
  params: Promise<{ packId: string }>;
}) {
  const { packId } = await params;
  const [brand, pack, latestJob] = await Promise.all([
    getBrandStrategyPack(),
    getHotspotPack(packId),
    getLatestProductionJobForPack(packId)
  ]);

  if (!pack) {
    notFound();
  }

  const canRun = pack.status === "approved";

  return (
    <div className="page productionStudioDetailPage">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="/production-studio">
              返回制作列表
            </Link>
            <Link className="buttonLike subtleButton" href={`/review?pack=${pack.id}&variant=${pack.variants[0]?.id ?? ""}`}>
              回到选题详情台
            </Link>
            <Link className="buttonLike subtleButton" href="/publish">
              去发布执行台
            </Link>
          </>
        }
        context={pack.variants[0]?.title ?? pack.whyNow}
        description="一键生成后的图文、口播、字幕都可以在这里统一微调并推入发布。"
        eyebrow="内容深度制作"
        facts={[
          { label: "当前品牌", value: brand.name },
          { label: "审核状态", value: canRun ? "已通过" : pack.status === "pending" ? "待审核" : "待改稿" },
          { label: "制作状态", value: latestJob ? "已生成首版" : "尚未制作" },
          { label: "负责人", value: pack.reviewOwner }
        ]}
        title="最终内容工作台"
      />

      <section className="panel">
        <OneClickProductionButton
          disabled={!canRun}
          disabledReason="这条选题还没审核通过；先在选题详情台点通过，再回这里一键制作。"
          packId={pack.id}
        />
      </section>

      <ProductionStudioEditor canRun={canRun} initialJob={latestJob} packId={pack.id} />
    </div>
  );
}
