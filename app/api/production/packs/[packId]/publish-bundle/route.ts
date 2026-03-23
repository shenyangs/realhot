import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canApproveContent } from "@/lib/auth/permissions";
import { pushProductionBundleToPublish } from "@/lib/services/production-studio";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
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
    const { packId } = await params;
    const result = await pushProductionBundleToPublish(packId);

    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "production_job",
      entityId: result.jobId ?? packId,
      action: "production.bundle_pushed",
      payload: {
        packId,
        queuedCount: result.queuedCount,
        jobId: result.jobId
      }
    });

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "推送发布队列失败"
      },
      {
        status: 500
      }
    );
  }
}
