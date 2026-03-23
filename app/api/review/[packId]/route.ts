import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canApproveContent } from "@/lib/auth/permissions";
import { deleteHotspotPack, getHotspotPack, getHotspotSignals, updateHotspotPackReview } from "@/lib/data";

function formatReviewRouteError(error: unknown) {
  if (error instanceof Error) {
    const cause = error.cause;
    const code = cause && typeof cause === "object" && "code" in cause ? cause.code : null;
    const causeMessage = cause && typeof cause === "object" && "message" in cause ? cause.message : null;
    const details = [code, causeMessage].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    return details.length > 0 ? `${error.message} (${details.join(": ")})` : error.message;
  }

  if (error && typeof error === "object") {
    const message = "message" in error ? error.message : null;
    const details = "details" in error ? error.details : null;
    const hint = "hint" in error ? error.hint : null;
    const code = "code" in error ? error.code : null;
    const parts = [message, details, hint, code].filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    );

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return "Review update failed";
}

function revalidateReviewRelatedPages(packId: string) {
  revalidatePath("/");
  revalidatePath("/hotspots");
  revalidatePath("/review");
  revalidatePath("/production-studio");
  revalidatePath(`/production-studio/${packId}`);
  revalidatePath("/publish");
}

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
    const reviewerName = payload.reviewer?.trim() || viewer.user.displayName;

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
      reviewer: reviewerName
    });

    if (!updated) {
      return NextResponse.json(
        {
          ok: false,
          error: "审核状态未更新，请刷新后重试（记录不存在或无权限）"
        },
        {
          status: 404
        }
      );
    }

    const hotspot = (await getHotspotSignals()).find((item) => item.id === updated.hotspotId);

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
        status: updated.status,
        reviewer: reviewerName,
        note: payload.note,
        variantTitles: updated.variants.map((variant) => variant.title)
      }
    });

    revalidateReviewRelatedPages(updated.id);

    return NextResponse.json({
      ok: true,
      pack: updated,
      nextWorkflowPath: updated.status === "approved" ? `/production-studio/${updated.id}` : null
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: formatReviewRouteError(error)
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

      revalidateReviewRelatedPages(packId);
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
