import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canApproveContent } from "@/lib/auth/permissions";
import { updateHotspotPackReview } from "@/lib/data";
import type { ReviewStatus } from "@/lib/domain/types";

function revalidateReviewRelatedPages(packIds: string[]) {
  revalidatePath("/");
  revalidatePath("/hotspots");
  revalidatePath("/review");
  revalidatePath("/production-studio");
  revalidatePath("/publish");

  packIds.forEach((packId) => {
    revalidatePath(`/production-studio/${packId}`);
  });
}

function normalizePackIds(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return Array.from(
    new Set(
      input
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0)
    )
  );
}

function isBatchStatus(input: unknown): input is Exclude<ReviewStatus, "pending"> {
  return input === "approved" || input === "needs-edit";
}

function formatBatchError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const message = "message" in error ? error.message : null;

    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  }

  return "unknown_error";
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireApiAccess(request, {
      authorize: canApproveContent,
      requireWorkspace: true
    });

    if (!access.ok) {
      return access.response;
    }

    const { viewer } = access;
    const payload = (await request.json().catch(() => null)) as
      | {
          packIds?: unknown;
          status?: unknown;
          note?: string;
          reviewer?: string;
        }
      | null;

    const packIds = normalizePackIds(payload?.packIds);
    const status = payload?.status;

    if (packIds.length === 0) {
      return NextResponse.json({ ok: false, error: "packIds is required" }, { status: 400 });
    }

    if (!isBatchStatus(status)) {
      return NextResponse.json({ ok: false, error: "status must be approved or needs-edit" }, { status: 400 });
    }

    const reviewerName = payload?.reviewer?.trim() || viewer.user.displayName;
    const note = payload?.note?.trim() || undefined;
    const updatedIds: string[] = [];
    const failedIds: string[] = [];
    const failedReasons: Record<string, string> = {};

    for (const packId of packIds) {
      try {
        const updated = await updateHotspotPackReview(packId, {
          status,
          note,
          reviewer: reviewerName
        });

        if (updated) {
          updatedIds.push(updated.id);
        } else {
          failedIds.push(packId);
          failedReasons[packId] = "not_found_or_no_access";
        }
      } catch (error) {
        failedIds.push(packId);
        failedReasons[packId] = formatBatchError(error);
      }
    }

    if (updatedIds.length > 0) {
      await writeAuditLog({
        workspaceId: viewer.currentWorkspace?.id,
        actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
        actorDisplayName: viewer.user.displayName,
        actorEmail: viewer.user.email,
        entityType: "hotspot_pack",
        entityId: updatedIds[0],
        action: "review.batch_status_updated",
        payload: {
          status,
          reviewer: reviewerName,
          note,
          updatedIds,
          failedIds
        }
      });

      revalidateReviewRelatedPages(updatedIds);
    }

    if (updatedIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "批量审核未生效，请重试",
          updatedCount: 0,
          updatedIds,
          failedIds,
          failedReasons
        },
        {
          status: 409
        }
      );
    }

    return NextResponse.json({
      ok: true,
      updatedCount: updatedIds.length,
      updatedIds,
      failedIds,
      failedReasons
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Batch review update failed"
      },
      {
        status: 500
      }
    );
  }
}
