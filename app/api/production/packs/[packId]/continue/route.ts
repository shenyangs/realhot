import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canGenerateContent } from "@/lib/auth/permissions";
import type { AiProvider } from "@/lib/domain/ai-routing";
import { continueProductionJob } from "@/lib/services/production-studio";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  try {
    const access = await requireApiAccess(request, {
      authorize: canGenerateContent,
      requireWorkspace: true
    });

    if (!access.ok) {
      return access.response;
    }

    const { viewer } = access;
    const { packId } = await params;
    const payload = (await request.json().catch(() => ({}))) as {
      provider?: AiProvider;
      model?: string;
      imageProvider?: AiProvider;
      imageModel?: string;
    };
    const provider = payload.provider === "minimax" ? payload.provider : undefined;
    const model = payload.model?.trim() || undefined;
    const imageProvider = payload.imageProvider === "minimax" ? payload.imageProvider : undefined;
    const imageModel = payload.imageModel?.trim() || undefined;

    const job = await continueProductionJob(packId, {
      provider,
      model,
      imageProvider,
      imageModel
    });

    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "production_job",
      entityId: job.id,
      action: "production.article_continued",
      payload: {
        packId,
        requestedProvider: provider,
        requestedModel: model,
        effectiveProvider: job.route.effectiveProvider,
        effectiveModel: job.route.effectiveModel,
        articlePhase: job.outputs.draftProgress.articlePhase
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
        error: error instanceof Error ? error.message : "补全后半段失败"
      },
      {
        status: 500
      }
    );
  }
}
