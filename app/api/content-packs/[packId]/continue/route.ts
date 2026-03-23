import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canGenerateContent } from "@/lib/auth/permissions";
import { continueContentPackGeneration } from "@/lib/services/content-pack-generator";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "补全剩余平台方案失败";
}

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
    const result = await continueContentPackGeneration(packId);

    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "hotspot_pack",
      entityId: result.pack.id,
      action: "content.pack_continued",
      payload: {
        hotspotId: result.pack.hotspotId,
        whyNow: result.pack.whyNow,
        variantTitles: result.pack.variants.map((variant) => variant.title),
        variantCount: result.pack.variants.length
      }
    });

    revalidatePath("/hotspots");
    revalidatePath("/review");
    revalidatePath(`/review?pack=${result.pack.id}`);

    return NextResponse.json({
      ok: true,
      ...result
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
