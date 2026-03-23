import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canUseHotspotInsight } from "@/lib/auth/permissions";
import { generateHotspotInsightPreview } from "@/lib/services/hotspot-insight";

export async function POST(request: NextRequest) {
  try {
    const access = await requireApiAccess(request, {
      authorize: canUseHotspotInsight,
      requireWorkspace: true
    });

    if (!access.ok) {
      return access.response;
    }

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

    const preview = await generateHotspotInsightPreview(body.hotspotId);

    return NextResponse.json({
      ok: true,
      preview
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "生成快速判断失败"
      },
      {
        status: 500
      }
    );
  }
}
