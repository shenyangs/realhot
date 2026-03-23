import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canApproveContent } from "@/lib/auth/permissions";
import { deleteHotspotPack, getHotspotPack, getHotspotSignals, updateHotspotPackReview } from "@/lib/data";

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
    const payload = (await request.json()) as {
      status?: "pending" | "approved" | "needs-edit";
      note?: string;
      reviewer?: string;
    };

    if (!payload.status) {
      return NextResponse.json(
        {
          error: "status is required"
        },
        {
          status: 400
        }
      );
    }

    const updated = await updateHotspotPackReview(packId, {
      status: payload.status,
      note: payload.note,
      reviewer: payload.reviewer
    });

    const hotspot = updated ? (await getHotspotSignals()).find((item) => item.id === updated.hotspotId) : null;

    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "hotspot_pack",
      entityId: packId,
      action: "review.status_updated",
      payload: {
        hotspotTitle: hotspot?.title,
        status: updated?.status ?? payload.status,
        reviewer: payload.reviewer,
        note: payload.note,
        variantTitles: updated?.variants.map((variant) => variant.title)
      }
    });

    return NextResponse.json({
      ok: true,
      pack: updated
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Review update failed"
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
    const removed = await deleteHotspotPack(packId);

    if (removed) {
      await writeAuditLog({
        workspaceId: viewer.currentWorkspace?.id,
        actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
        actorDisplayName: viewer.user.displayName,
        actorEmail: viewer.user.email,
        entityType: "hotspot_pack",
        entityId: packId,
        action: "review.pack_deleted",
        payload: {
          hotspotTitle: hotspot?.title,
          variantTitles: pack?.variants.map((variant) => variant.title)
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
        error: error instanceof Error ? error.message : "Delete pack failed"
      },
      {
        status: 500
      }
    );
  }
}
