import { listQueuedProductionJobs, runProductionJob, updateProductionJob } from "@/lib/services/production-jobs";

export interface ProductionRunResult {
  scanned: number;
  processed: number;
  completed: number;
  failed: number;
  jobs: Array<{
    id: string;
    status: "completed" | "failed";
    reason?: string;
  }>;
}

export async function runProductionQueue(input?: {
  workspaceId?: string;
  jobId?: string;
  limit?: number;
}): Promise<ProductionRunResult> {
  const defaultLimit = Number.parseInt(process.env.PRODUCTION_RUN_BATCH_SIZE ?? "5", 10);
  const limit = input?.limit && input.limit > 0 ? input.limit : defaultLimit;
  const queued = await listQueuedProductionJobs({
    workspaceId: input?.workspaceId,
    jobId: input?.jobId,
    limit
  });

  const jobs: ProductionRunResult["jobs"] = [];
  let completed = 0;
  let failed = 0;

  for (const job of queued) {
    const result = await runProductionJob({
      jobId: job.id
    }).catch((error) => ({
      error: error instanceof Error ? error.message : "production_run_failed"
    }));

    if ("error" in result) {
      failed += 1;
      jobs.push({
        id: job.id,
        status: "failed",
        reason: result.error
      });
      await updateProductionJob(job.id, {
        status: "failed",
        errorMessage: result.error
      });
      continue;
    }

    completed += 1;
    jobs.push({
      id: job.id,
      status: "completed"
    });
  }

  return {
    scanned: queued.length,
    processed: queued.length,
    completed,
    failed,
    jobs
  };
}
