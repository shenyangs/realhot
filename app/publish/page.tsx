import Link from "next/link";
import { PackDeleteButton } from "@/components/pack-delete-button";
import { PageHero } from "@/components/page-hero";
import { PublishActions } from "@/components/publish-actions";
import { PublishJobDeleteButton } from "@/components/publish-job-delete-button";
import { PublishQueueClearButton } from "@/components/publish-queue-clear-button";
import { getBrandStrategyPack, getPublishJobsForPack, getReviewQueue } from "@/lib/data";
import type { Platform } from "@/lib/domain/types";
import { listProductionJobs } from "@/lib/services/production-studio";

const platformLabels: Record<Platform, string> = {
  xiaohongshu: "小红书",
  wechat: "公众号",
  "video-channel": "视频号",
  douyin: "抖音"
};

function getBodyPreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();

  if (normalized.length <= 88) {
    return normalized;
  }

  return `${normalized.slice(0, 88)}...`;
}

function formatDateTime(value?: string) {
  if (!value) {
    return "未记录";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(parsed);
}

function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "未形成样本";
  }

  if (minutes < 60) {
    return `${Math.round(minutes)} 分钟`;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = Math.round(minutes % 60);

  return `${hours} 小时 ${restMinutes} 分钟`;
}

function getAverageResponseMinutes(items: Array<{ createdAt: string; publishedAt?: string; updatedAt: string }>) {
  const samples = items
    .map((job) => {
      const start = Date.parse(job.createdAt);
      const end = Date.parse(job.publishedAt ?? job.updatedAt);

      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
        return null;
      }

      return (end - start) / 1000 / 60;
    })
    .filter((value): value is number => value !== null);

  if (samples.length === 0) {
    return 0;
  }

  return samples.reduce((sum, current) => sum + current, 0) / samples.length;
}

function getFailureCategory(reason?: string) {
  if (!reason) {
    return "执行异常";
  }

  if (reason.includes("权限") || reason.includes("登录")) {
    return "账号权限";
  }

  if (reason.includes("频率") || reason.includes("限流")) {
    return "频率限制";
  }

  if (reason.includes("内容")) {
    return "内容校验";
  }

  return "执行异常";
}

function getFailureNextStep(reason?: string) {
  if (!reason) {
    return "建议先重试一次，再检查发布账号状态。";
  }

  if (reason.includes("权限") || reason.includes("登录")) {
    return "先检查账号登录态和平台授权，再重新尝试。";
  }

  if (reason.includes("频率") || reason.includes("限流")) {
    return "建议延后执行并降低并发，避免继续触发平台限制。";
  }

  if (reason.includes("内容")) {
    return "先退回编辑区修正文案或素材，再重新发布。";
  }

  return "可以先重试；如果重复失败，再回到编辑区检查内容与配置。";
}

export default async function PublishPage() {
  const [brand, packs, productionJobs] = await Promise.all([getBrandStrategyPack(), getReviewQueue(), listProductionJobs()]);

  const latestProductionJobByPack = new Map<string, (typeof productionJobs)[number]>();

  for (const job of productionJobs) {
    if (!latestProductionJobByPack.has(job.packId)) {
      latestProductionJobByPack.set(job.packId, job);
    }
  }

  const packJobs = await Promise.all(
    packs.map(async (pack) => ({
      pack,
      jobs: await getPublishJobsForPack(pack.id),
      latestProductionJob: latestProductionJobByPack.get(pack.id) ?? null
    }))
  );

  const readyPacks = packJobs.filter(
    ({ pack, latestProductionJob }) => pack.status === "approved" && latestProductionJob?.status === "completed"
  );
  const allJobs = packJobs.flatMap(({ pack, jobs }) =>
    jobs.map((job) => {
      const variant = pack.variants.find((item) => item.id === job.variantId);

      return {
        ...job,
        packId: pack.id,
        reviewOwner: pack.reviewOwner,
        reviewStatus: pack.status,
        variantTitle: variant?.title ?? "未命名内容",
        publishWindow: variant?.publishWindow ?? "未设置",
        platforms: variant?.platforms ?? [job.platform]
      };
    })
  );

  const queuedJobs = allJobs.filter((job) => job.status === "queued");
  const publishedJobs = allJobs.filter((job) => job.status === "published");
  const failedJobs = allJobs.filter((job) => job.status === "failed");
  const latestPublishAction = [...publishedJobs].sort(
    (left, right) => Date.parse(right.publishedAt ?? right.updatedAt) - Date.parse(left.publishedAt ?? left.updatedAt)
  )[0];
  const latestFailedAction = [...failedJobs].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  const averageResponseTime = formatDuration(getAverageResponseMinutes(publishedJobs));

  return (
    <div className="page publishDeskPageV2">
      <PageHero
        actions={
          <>
            <Link className="buttonLike primaryButton" href="#publish-ready">
              去安排发布
            </Link>
            <Link className="buttonLike subtleButton" href="/production-studio">
              回内容制作
            </Link>
            <Link className="buttonLike subtleButton" href="/">
              回工作台
            </Link>
          </>
        }
        context={brand.name}
        description="这里只处理已经完成制作的内容，统一安排排期、执行发布并查看结果。"
        eyebrow="发布中心"
        facts={[
          { label: "今日待发布", value: `${readyPacks.length} 个热点包` },
          { label: "已发布", value: `${publishedJobs.length} 条` },
          { label: "发布失败", value: `${failedJobs.length} 条` },
          { label: "平均响应时长", value: averageResponseTime },
          { label: "最近一次发布", value: latestPublishAction ? formatDateTime(latestPublishAction.publishedAt ?? latestPublishAction.updatedAt) : "未记录" },
          { label: "最近一次失败", value: latestFailedAction ? getFailureCategory(latestFailedAction.failureReason) : "当前无失败" }
        ]}
        title="安排发布并查看结果"
      />

      <section className="panel publishRuntimePanel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">运行总览</p>
            <h2>当前发布状态</h2>
          </div>
        </div>

        <div className="statusFeedGrid">
          <div className="statusFeedItem">
            <span>待执行队列</span>
            <strong>{queuedJobs.length} 条</strong>
          </div>
          <div className="statusFeedItem">
            <span>已发布记录</span>
            <strong>{publishedJobs.length} 条</strong>
          </div>
          <div className="statusFeedItem">
            <span>失败原因</span>
            <strong>{latestFailedAction ? latestFailedAction.failureReason ?? "执行失败" : "当前无失败反馈"}</strong>
          </div>
          <div className="statusFeedItem">
            <span>最近动作</span>
            <strong>
              {latestPublishAction
                ? `${platformLabels[latestPublishAction.platform]} · ${latestPublishAction.variantTitle}`
                : "当前队列空闲"}
            </strong>
          </div>
        </div>
      </section>

      <section className="publishLayoutGrid">
        <main className="publishMainColumn">
          <section className="panel" id="publish-ready">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">待发布内容</p>
                <h2>已完成制作的待发布池</h2>
              </div>
            </div>

            <div className="publishPackList">
              {readyPacks.length > 0 ? (
                readyPacks.map(({ pack, jobs, latestProductionJob }) => {
                  const queuedCount = jobs.filter((job) => job.status === "queued").length;
                  const publishedCount = jobs.filter((job) => job.status === "published").length;
                  const failedCount = jobs.filter((job) => job.status === "failed").length;
                  const defaultVariant = pack.variants[0];

                  return (
                    <article className="publishPackCard publishPackCardStrong" key={pack.id}>
                      <div className="publishPackHeader">
                        <div className="publishPackHeading">
                          <p className="eyebrow">热点包 {pack.id}</p>
                          <h3 className="publishPackTitle">{defaultVariant?.title ?? pack.whyNow}</h3>
                          <p className="muted publishPackSummary">{pack.whyUs}</p>
                        </div>
                        <div className="publishPackHeaderActions">
                          <Link
                            className="buttonLike subtleButton publishPackAction"
                            href={`/review?pack=${pack.id}&variant=${defaultVariant?.id ?? ""}`}
                          >
                            查看详情
                          </Link>
                          <Link className="buttonLike subtleButton publishPackAction" href={`/production-studio/${pack.id}`}>
                            查看制作稿
                          </Link>
                        </div>
                      </div>

                      <div className="publishExecutionGrid">
                        <div className="statusFeedItem">
                          <span>负责人</span>
                          <strong>{pack.reviewOwner}</strong>
                        </div>
                        <div className="statusFeedItem">
                          <span>平台</span>
                          <strong>{Array.from(new Set(pack.variants.flatMap((variant) => variant.platforms.map((platform) => platformLabels[platform])))).join(" / ")}</strong>
                        </div>
                        <div className="statusFeedItem">
                          <span>计划发布时间</span>
                          <strong>{defaultVariant?.publishWindow ?? "未设置"}</strong>
                        </div>
                        <div className="statusFeedItem">
                          <span>制作状态</span>
                          <strong>已完成</strong>
                        </div>
                        <div className="statusFeedItem">
                          <span>最近制作</span>
                          <strong>
                            {latestProductionJob ? formatDateTime(latestProductionJob.updatedAt) : "未记录"}
                          </strong>
                        </div>
                        <div className="statusFeedItem">
                          <span>队列状态</span>
                          <strong>排队 {queuedCount} / 已发 {publishedCount}</strong>
                        </div>
                        <div className="statusFeedItem">
                          <span>异常标签</span>
                          <strong>{failedCount > 0 ? `失败 ${failedCount} 条` : "当前无异常"}</strong>
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

                      <PublishActions
                        failedCount={failedCount}
                        packId={pack.id}
                        publishedCount={publishedCount}
                        queuedCount={queuedCount}
                      />

                      <details className="publishManagementDetails">
                        <summary>管理这条发布任务</summary>
                        <div className="topicDangerBody">
                          <PackDeleteButton label="删除这条内容包" packId={pack.id} redirectHref="/publish" />
                        </div>
                      </details>
                    </article>
                  );
                })
              ) : (
                <div className="systemFeedbackCard">
                  <strong>当前没有完成制作且待发布的内容</strong>
                  <p className="muted">
                    先去内容制作完成首版并推入发布队列；最近一次发布：
                    {latestPublishAction
                      ? ` ${latestPublishAction.variantTitle} · ${formatDateTime(latestPublishAction.publishedAt ?? latestPublishAction.updatedAt)}`
                      : " 尚未形成发布记录"}。
                  </p>
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="publishAsideColumn">
          <section className="panel helperPanel">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">待执行队列</p>
                <h3>真实操作区</h3>
              </div>
              <PublishQueueClearButton label="清空待执行" />
            </div>

            <div className="publishQueueTable">
              {queuedJobs.length > 0 ? (
                queuedJobs.map((job) => (
                  <div className="publishQueueRow" key={job.id}>
                    <div>
                      <strong>{job.variantTitle}</strong>
                      <p className="muted">
                        {platformLabels[job.platform]} · 负责人 {job.reviewOwner}
                      </p>
                    </div>
                    <div className="publishQueueMeta">
                      <span>计划 {job.scheduledAt ? formatDateTime(job.scheduledAt) : job.publishWindow}</span>
                      <span>审核 {job.reviewStatus === "approved" ? "已通过" : "待确认"}</span>
                      <span className="pill pill-neutral">已排队</span>
                      <PublishJobDeleteButton jobId={job.id} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="systemFeedbackCard systemFeedbackCardCompact">
                  <strong>当前队列空闲</strong>
                  <p className="muted">先从左侧已完成制作的内容入队，或去内容制作页推入发布队列。</p>
                </div>
              )}
            </div>
          </section>

          <section className="panel helperPanel">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">已发布记录</p>
                <h3>最近执行回放</h3>
              </div>
            </div>

            <div className="publishQueueTable">
              {publishedJobs.length > 0 ? (
                publishedJobs.slice(0, 6).map((job) => (
                  <div className="publishQueueRow" key={job.id}>
                    <div>
                      <strong>{job.variantTitle}</strong>
                      <p className="muted">{platformLabels[job.platform]} · {job.reviewOwner}</p>
                    </div>
                    <div className="publishQueueMeta">
                      <span>{formatDateTime(job.publishedAt ?? job.updatedAt)}</span>
                      <span className="pill pill-positive">已发布</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="systemFeedbackCard systemFeedbackCardCompact">
                  <strong>尚未形成发布历史</strong>
                  <p className="muted">第一条成功发布后，这里会回放最近动作和处理时长。</p>
                </div>
              )}
            </div>
          </section>

          <section className="panel helperPanel">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">失败任务</p>
                <h3>带诊断的反馈</h3>
              </div>
            </div>

            <div className="publishFailureList">
              {failedJobs.length > 0 ? (
                failedJobs.map((job) => (
                  <article className="publishFailureCard" key={job.id}>
                    <div className="listItem">
                      <strong>{job.variantTitle}</strong>
                      <span className="pill pill-warning">{getFailureCategory(job.failureReason)}</span>
                    </div>
                    <div className="statusFeedList">
                      <div className="statusFeedItem">
                        <span>失败时间</span>
                        <strong>{formatDateTime(job.updatedAt)}</strong>
                      </div>
                      <div className="statusFeedItem">
                        <span>失败原因</span>
                        <strong>{job.failureReason ?? "系统返回执行失败"}</strong>
                      </div>
                      <div className="statusFeedItem">
                        <span>是否可重试</span>
                        <strong>可重试</strong>
                      </div>
                      <div className="statusFeedItem">
                        <span>下一步建议</span>
                        <strong>{getFailureNextStep(job.failureReason)}</strong>
                      </div>
                    </div>
                    <div className="buttonRow">
                      <Link className="buttonLike subtleButton" href={`/review?pack=${job.packId}&variant=${job.variantId}`}>
                        退回修改
                      </Link>
                    </div>
                  </article>
                ))
              ) : (
                <div className="systemFeedbackCard systemFeedbackCardCompact">
                  <strong>当前没有失败任务</strong>
                  <p className="muted">发布链路运行正常。后续异常会在这里给出失败时间、原因分类和下一步建议。</p>
                </div>
              )}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
