import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canApproveContent } from "@/lib/auth/permissions";
import { clearQueuedPublishJobs } from "@/lib/data";

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireApiAccess(request, {
      authorize: canApproveContent,
      requireWorkspace: true
    });

    if (!access.ok) {
      return access.response;
    }

    const { viewer } = access;
    const payload = (await request.json().catch(() => ({}))) as {
      packId?: string;
    };

    const result = await clearQueuedPublishJobs({
      packId: payload.packId?.trim() || undefined
    });

    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "publish_queue",
      entityId: payload.packId?.trim() || undefined,
      action: "publish.queue_cleared",
      payload: {
        removedCount: result.removedCount,
        scope: payload.packId?.trim() ? "single-pack" : "all-packs"
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
        error: error instanceof Error ? error.message : "Clear queue failed"
      },
      {
        status: 500
      }
    );
  }
}
