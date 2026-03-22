import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspacePageViewer } from "@/lib/auth";
import { ProductionStudioConsole } from "@/components/production-studio-console";
import { getHotspotPack } from "@/lib/data";
import {
  getProductionDraftByPack,
  getProductionJobById,
  getProductionJobDetail,
  listProductionAssetsByPack,
  listProductionJobsByPack
} from "@/lib/services/production-jobs";

type SearchParams = Promise<{
  job?: string;
}>;

export default async function ProductionStudioPage({
  params,
  searchParams
}: {
  params: Promise<{ packId: string }>;
  searchParams?: SearchParams;
}) {
  const viewer = await requireWorkspacePageViewer();
  const { packId } = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const [pack, jobs] = await Promise.all([getHotspotPack(packId), listProductionJobsByPack(packId)]);

  if (!pack) {
    notFound();
  }

  const workspaceId = viewer.currentWorkspace?.id ?? pack.workspaceId;
  const scopedJobs = jobs.filter((job) => viewer.isPlatformAdmin || job.workspaceId === workspaceId);
  const selectedJobId = resolvedSearch?.job;
  const queriedJob = selectedJobId ? await getProductionJobById(selectedJobId) : null;
  const selectedJob =
    queriedJob && (viewer.isPlatformAdmin || queriedJob.workspaceId === workspaceId)
      ? queriedJob
      : scopedJobs[0] ?? null;

  const [jobDetail, packAssets, draft] = await Promise.all([
    selectedJob ? getProductionJobDetail({ jobId: selectedJob.id }).catch(() => null) : Promise.resolve(null),
    listProductionAssetsByPack(pack.id),
    workspaceId ? getProductionDraftByPack(pack.id, workspaceId) : Promise.resolve(null)
  ]);

  const scopedAssets = packAssets.filter((asset) => viewer.isPlatformAdmin || asset.workspaceId === workspaceId);
  const initialAssets = jobDetail?.assets ?? scopedAssets;
  const initialDraft = jobDetail?.draft ?? draft;
  const imageCount = initialAssets.filter((asset) => asset.kind === "image").length;
  const videoCount = initialAssets.filter((asset) => asset.kind === "video").length;
  const voiceCount = initialAssets.filter((asset) => asset.kind === "voice").length;
  const subtitleCount = initialAssets.filter((asset) => asset.kind === "subtitle").length;

  return (
    <div className="page">
      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">Production Studio</p>
            <h1>最终内容工作台</h1>
          </div>
          <Link className="buttonLike subtleButton" href={`/review?pack=${pack.id}`}>
            返回审核台
          </Link>
        </div>
        <p className="muted">这里会统一承接一键制作后的图文、视频、口播与字幕产物，先做可视化与可重试骨架。</p>
      </section>

      <section className="summaryGrid">
        <article className="panel summaryCard">
          <p className="eyebrow">当前选题</p>
          <h3>{pack.variants[0]?.title ?? pack.whyNow}</h3>
          <p className="muted">{pack.whyUs}</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">作业状态</p>
          <h3>{selectedJob?.status ?? "未创建"}</h3>
          <p className="muted">阶段：{selectedJob?.stage ?? "等待触发"}</p>
        </article>
        <article className="panel summaryCard">
          <p className="eyebrow">工作区</p>
          <h3>{viewer.currentWorkspace?.name ?? "未选择"}</h3>
          <p className="muted">作业数：{jobs.filter((job) => job.workspaceId === viewer.currentWorkspace?.id).length}</p>
        </article>
      </section>

      <section className="brandInfoGrid">
        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">素材树</p>
              <h3>图文 / 视频 / 口播 / 字幕</h3>
            </div>
          </div>
          <ul className="simpleList">
            <li>图片资产：{imageCount > 0 ? `${imageCount} 份` : "未生成"}</li>
            <li>视频资产：{videoCount > 0 ? `${videoCount} 份` : "未生成"}</li>
            <li>口播资产：{voiceCount > 0 ? `${voiceCount} 份` : "未生成"}</li>
            <li>字幕资产：{subtitleCount > 0 ? `${subtitleCount} 份` : "未生成"}</li>
            <li>最终草稿：{initialDraft ? "已保存" : "未保存"}</li>
          </ul>
        </article>

        <ProductionStudioConsole
          initialAssets={initialAssets}
          initialBody={pack.variants[0]?.body ?? ""}
          initialDraft={initialDraft}
          initialJob={selectedJob}
          initialTitle={pack.variants[0]?.title ?? pack.whyNow}
          packId={pack.id}
        />
      </section>

      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">作业历史</p>
            <h3>最近一键制作任务</h3>
          </div>
        </div>
        {jobs.length > 0 ? (
          <div className="stack">
            {jobs
              .filter((job) => viewer.isPlatformAdmin || job.workspaceId === viewer.currentWorkspace?.id)
              .map((job) => (
                <article className="subPanel" key={job.id}>
                  <div className="listItem">
                    <strong>{job.id.slice(0, 8)}</strong>
                    <span className="pill pill-neutral">
                      {job.status} / {job.stage}
                    </span>
                  </div>
                  <p className="muted">
                    创建于 {new Date(job.createdAt).toLocaleString("zh-CN")} · 重试 {job.retryCount} 次
                  </p>
                </article>
              ))}
          </div>
        ) : (
          <p className="muted">当前还没有一键制作作业记录。</p>
        )}
      </section>
    </div>
  );
}
