import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { getHotspotPack } from "@/lib/data";
import { writeAuditLog } from "@/lib/auth/audit";
import { canGenerateContent } from "@/lib/auth/permissions";
import { getLatestProductionJobForPack, updateProductionDraft } from "@/lib/services/production-studio";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  const access = await requireApiAccess(request, {
    requireWorkspace: true
  });

  if (!access.ok) {
    return access.response;
  }

  const { packId } = await params;
  const [pack, job] = await Promise.all([getHotspotPack(packId), getLatestProductionJobForPack(packId)]);

  return NextResponse.json({
    ok: true,
    pack,
    job
  });
}

export async function PATCH(
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
      articleTitle?: string;
      articleBody?: string;
      videoScript?: string;
      voiceoverText?: string;
      subtitleSrt?: string;
    };

    const job = await updateProductionDraft(packId, {
      articleTitle: payload.articleTitle?.trim(),
      articleBody: payload.articleBody?.trim(),
      videoScript: payload.videoScript?.trim(),
      voiceoverText: payload.voiceoverText?.trim(),
      subtitleSrt: payload.subtitleSrt?.trim()
    });

    if (!job) {
      return NextResponse.json(
        {
          ok: false,
          error: "请先执行一键制作"
        },
        {
          status: 404
        }
      );
    }

    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "production_job",
      entityId: job.id,
      action: "production.draft_updated",
      payload: {
        packId,
        articleTitle: payload.articleTitle?.trim(),
        updatedFields: Object.entries(payload)
          .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
          .map(([key]) => key)
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
        error: error instanceof Error ? error.message : "保存失败"
      },
      {
        status: 500
      }
    );
  }
}
