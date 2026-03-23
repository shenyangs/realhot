import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canUseHotspotInsight } from "@/lib/auth/permissions";
import { getHotspotSignals } from "@/lib/data";
import { generateHotspotInsight } from "@/lib/services/hotspot-insight";

export async function POST(request: NextRequest) {
  try {
    const access = await requireApiAccess(request, {
      authorize: canUseHotspotInsight,
      requireWorkspace: true
    });

    if (!access.ok) {
      return access.response;
    }

    const { viewer } = access;
    const body = (await request.json()) as {
      hotspotId?: string;
    };

    if (!body.hotspotId) {
      return NextResponse.json(
        {
          error: "缺少热点 ID"
        },
        {
          status: 400
        }
      );
    }

    const insight = await generateHotspotInsight(body.hotspotId);
    const hotspot = (await getHotspotSignals()).find((item) => item.id === body.hotspotId);

    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "hotspot",
      entityId: body.hotspotId,
      action: "hotspot.insight_generated",
      payload: {
        hotspotTitle: hotspot?.title,
        source: hotspot?.source,
        recommendedFormat: insight.recommendedFormat,
        planningScore: insight.planningScore
      }
    });

    return NextResponse.json({
      ok: true,
      insight
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "生成深挖建议失败"
      },
      {
        status: 500
      }
    );
  }
}
