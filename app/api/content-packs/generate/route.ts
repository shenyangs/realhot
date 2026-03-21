import { NextRequest, NextResponse } from "next/server";
import { generateContentPackForHotspot } from "@/lib/services/content-pack-generator";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      hotspotId?: string;
    };

    if (!payload.hotspotId) {
      return NextResponse.json(
        {
          error: "hotspotId is required"
        },
        {
          status: 400
        }
      );
    }

    const result = await generateContentPackForHotspot(payload.hotspotId);

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Content pack generation failed"
      },
      {
        status: 500
      }
    );
  }
}
