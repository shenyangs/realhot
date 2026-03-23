import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canGenerateContent } from "@/lib/auth/permissions";
import { getHotspotPack, getHotspotSignals } from "@/lib/data";
import { runOneClickProduction } from "@/lib/services/production-studio";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "一键制作失败";
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireApiAccess(request, {
      authorize: canGenerateContent,
      requireWorkspace: true
    });

    if (!access.ok) {
      return access.response;
    }

    const { viewer } = access;
    const payload = (await request.json().catch(() => ({}))) as {
      packId?: string;
    };

    const packId = payload.packId?.trim();

    if (!packId) {
      return NextResponse.json(
        {
          ok: false,
          error: "packId is required"
        },
        {
          status: 400
        }
      );
    }

    const job = await runOneClickProduction(packId);
    const pack = await getHotspotPack(packId);
    const hotspot = pack ? (await getHotspotSignals()).find((item) => item.id === pack.hotspotId) : null;

    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "production_job",
      entityId: job.id,
      action: "production.one_click_generated",
      payload: {
        packId,
        hotspotTitle: hotspot?.title,
        articleTitle: job.outputs.articleTitle,
        videoHook: job.outputs.videoHook
      }
    });

    return NextResponse.json({
      ok: true,
      job
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error)
      },
      {
        status: 500
      }
    );
  }
}
