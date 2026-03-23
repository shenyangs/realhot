import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canApproveContent } from "@/lib/auth/permissions";
import { clearQueuedPublishJobs, getHotspotPack, getHotspotSignals, queuePublishJobs } from "@/lib/data";

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
    const payload = (await request.json().catch(() => ({}))) as {
      scheduledAt?: string;
    };

    const result = await queuePublishJobs(packId, {
      scheduledAt: payload.scheduledAt,
      queueSource: "manual"
    });
    const pack = await getHotspotPack(packId);
    const hotspot = pack ? (await getHotspotSignals()).find((item) => item.id === pack.hotspotId) : null;

    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "publish_queue",
      entityId: packId,
      action: "publish.jobs_queued",
      payload: {
        hotspotTitle: hotspot?.title,
        scheduledAt: payload.scheduledAt,
        queuedCount: result.jobs.length,
        platforms: Array.from(new Set(result.jobs.map((job) => job.platform)))
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
        error: error instanceof Error ? error.message : "Queue publish failed"
      },
      {
        status: 500
      }
    );
  }
}

export async function DELETE(
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
    const pack = await getHotspotPack(packId);
    const hotspot = pack ? (await getHotspotSignals()).find((item) => item.id === pack.hotspotId) : null;
    const result = await clearQueuedPublishJobs({
      packId
    });

    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "publish_queue",
      entityId: packId,
      action: "publish.queue_cleared",
      payload: {
        hotspotTitle: hotspot?.title,
        removedCount: result.removedCount
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
        error: error instanceof Error ? error.message : "Clear publish queue failed"
      },
      {
        status: 500
      }
    );
  }
}
