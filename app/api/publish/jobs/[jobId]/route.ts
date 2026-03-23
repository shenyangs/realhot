import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canApproveContent } from "@/lib/auth/permissions";
import { deletePublishJob, getQueuedPublishJobs } from "@/lib/data";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const access = await requireApiAccess(request, {
      authorize: canApproveContent,
      requireWorkspace: true
    });

    if (!access.ok) {
      return access.response;
    }

    const { viewer } = access;
    const { jobId } = await params;
    const queuedJobs = await getQueuedPublishJobs();
    const job = queuedJobs.find((item) => item.id === jobId);
    const removed = await deletePublishJob(jobId);

    if (removed) {
      await writeAuditLog({
        workspaceId: viewer.currentWorkspace?.id,
        actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
        actorDisplayName: viewer.user.displayName,
        actorEmail: viewer.user.email,
        entityType: "publish_job",
        entityId: jobId,
        action: "publish.job_deleted",
        payload: {
          variantTitle: job?.variantTitle,
          platform: job?.platform
        }
      });
    }

    return NextResponse.json({
      ok: true,
      removed
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Delete publish job failed"
      },
      {
        status: 500
      }
    );
  }
}
