import { NextRequest, NextResponse } from "next/server";
import { clearQueuedPublishJobs } from "@/lib/data";

export async function DELETE(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      packId?: string;
    };

    const result = await clearQueuedPublishJobs({
      packId: payload.packId?.trim() || undefined
    });

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Clear queue failed"
      },
      {
        status: 500
      }
    );
  }
}
