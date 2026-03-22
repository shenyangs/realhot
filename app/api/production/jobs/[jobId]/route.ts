import { NextRequest, NextResponse } from "next/server";
import { requireApiViewer } from "@/lib/auth";
import { ProductionJobStage } from "@/lib/domain/types";
import { getProductionJobById, getProductionJobDetail, runProductionJob, updateProductionJob } from "@/lib/services/production-jobs";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      jobId: string;
    }>;
  }
) {
  const auth = await requireApiViewer();

  if (!auth.ok) {
    return auth.response;
  }

  const { jobId } = await context.params;
  const detail = await getProductionJobDetail({ jobId }).catch(() => null);

  if (!detail?.job) {
    return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  }

  if (!auth.viewer.isPlatformAdmin && auth.viewer.currentWorkspace?.id !== detail.job.workspaceId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    ...detail
  });
}

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      jobId: string;
    }>;
  }
) {
  const auth = await requireApiViewer({
    allowedRoles: ["org_admin", "approver"]
  });

  if (!auth.ok) {
    return auth.response;
  }

  const { jobId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "start" | "retry" | "rerun_stage";
    stage?: ProductionJobStage;
  };

  if (!body.action || (body.action !== "start" && body.action !== "retry" && body.action !== "rerun_stage")) {
    return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
  }

  const current = await getProductionJobById(jobId);

  if (!current) {
    return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  }

  if (!auth.viewer.isPlatformAdmin && auth.viewer.currentWorkspace?.id !== current.workspaceId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  if (body.action === "start" && current.status === "running") {
    return NextResponse.json({
      ok: true,
      job: current
    });
  }

  if (body.action === "start") {
    const queued = await updateProductionJob(jobId, {
      status: "queued",
      stage: current.stage,
      errorMessage: "",
      retryCount: current.retryCount
    });

    return NextResponse.json({
      ok: true,
      job: queued ?? current
    });
  }

  const restartStage: ProductionJobStage =
    body.action === "retry"
      ? "script"
      : body.stage === "image" || body.stage === "video" || body.stage === "voice" || body.stage === "subtitle"
        ? body.stage
        : "script";

  const nextRetryCount = current.retryCount + 1;

  await updateProductionJob(jobId, {
    status: "queued",
    stage: restartStage,
    errorMessage: "",
    retryCount: nextRetryCount
  });

  const executed = await runProductionJob({
    jobId,
    fromStage: restartStage
  }).catch((error) => ({
    error: error instanceof Error ? error.message : "production_job_failed"
  }));

  const job = await getProductionJobById(jobId);

  return NextResponse.json({
    ok: true,
    job,
    runError: "error" in executed ? executed.error : undefined
  });
}
