import { NextRequest, NextResponse } from "next/server";
import { generateHotspotInsight } from "@/lib/services/hotspot-insight";

export async function POST(request: NextRequest) {
  try {
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
