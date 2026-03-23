import { getQueuedPublishJobs, updatePublishJobStatus } from "@/lib/data";
import { getLatestProductionJobForPack } from "@/lib/services/production-studio";

export interface PublishRunResult {
  scanned: number;
  processed: number;
  published: number;
  failed: number;
  jobs: Array<{
    id: string;
    status: "published" | "failed";
    reason?: string;
  }>;
}

function shouldFailJob(jobId: string): boolean {
  const failRate = Number.parseFloat(process.env.PUBLISH_SIM_FAIL_RATE ?? "0");

  if (Number.isNaN(failRate) || failRate <= 0) {
    return false;
  }

  const normalized = Math.max(0, Math.min(1, failRate));
  const hashBase = Array.from(jobId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const score = (hashBase % 1000) / 1000;

  return score < normalized;
}

export async function runPublishQueue(input?: {
  packId?: string;
  limit?: number;
}): Promise<PublishRunResult> {
  const defaultLimit = Number.parseInt(process.env.PUBLISH_RUN_BATCH_SIZE ?? "20", 10);
  const limit = input?.limit && input.limit > 0 ? input.limit : defaultLimit;
  const queued = await getQueuedPublishJobs({
    packId: input?.packId,
    limit
  });

  const results: PublishRunResult["jobs"] = [];
  let published = 0;
  let failed = 0;

  for (const job of queued) {
    const latestProductionJob = await getLatestProductionJobForPack(job.packId);

    if (!latestProductionJob || latestProductionJob.status !== "completed") {
      await updatePublishJobStatus(job.id, {
        status: "failed",
        failureReason: "未完成内容深度制作，已阻止发布"
      });
      failed += 1;
      results.push({
        id: job.id,
        status: "failed",
        reason: "未完成内容深度制作"
      });
      continue;
    }

    const failedBySimulation = shouldFailJob(job.id);

    if (failedBySimulation) {
      await updatePublishJobStatus(job.id, {
        status: "failed",
        failureReason: "模拟发布失败（可通过 PUBLISH_SIM_FAIL_RATE 调整）"
      });
      failed += 1;
      results.push({
        id: job.id,
        status: "failed",
        reason: "模拟发布失败"
      });
      continue;
    }

    await updatePublishJobStatus(job.id, {
      status: "published",
      publishedAt: new Date().toISOString()
    });
    published += 1;
    results.push({
      id: job.id,
      status: "published"
    });
  }

  return {
    scanned: queued.length,
    processed: queued.length,
    published,
    failed,
    jobs: results
  };
}
