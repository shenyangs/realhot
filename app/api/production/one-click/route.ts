import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canGenerateContent } from "@/lib/auth/permissions";
import { getHotspotPack, getHotspotSignals } from "@/lib/data";
import type { AiProvider } from "@/lib/domain/ai-routing";
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
      provider?: AiProvider;
      model?: string;
      imageProvider?: AiProvider;
      imageModel?: string;
      videoProvider?: AiProvider;
      videoModel?: string;
    };

    const packId = payload.packId?.trim();
    const provider = payload.provider === "gemini" || payload.provider === "minimax" ? payload.provider : undefined;
    const model = payload.model?.trim() || undefined;
    const imageProvider =
      payload.imageProvider === "gemini" || payload.imageProvider === "minimax"
        ? payload.imageProvider
        : undefined;
    const imageModel = payload.imageModel?.trim() || undefined;
    const videoProvider =
      payload.videoProvider === "gemini" || payload.videoProvider === "minimax"
        ? payload.videoProvider
        : undefined;
    const videoModel = payload.videoModel?.trim() || undefined;

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

    const job = await runOneClickProduction(packId, {
      provider,
      model,
      imageProvider,
      imageModel,
      videoProvider,
      videoModel
    });
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
        requestedProvider: provider,
        requestedModel: model,
        effectiveProvider: job.route.effectiveProvider,
        effectiveModel: job.route.effectiveModel,
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
