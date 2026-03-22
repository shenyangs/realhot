import { NextRequest, NextResponse } from "next/server";
import { clearQueuedPublishJobs, queuePublishJobs } from "@/lib/data";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  try {
    const { packId } = await params;
    const payload = (await request.json().catch(() => ({}))) as {
      scheduledAt?: string;
    };

    const result = await queuePublishJobs(packId, {
      scheduledAt: payload.scheduledAt,
      queueSource: "manual"
    });

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Queue publish failed"
      },
      {
        status: 500
      }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  try {
    const { packId } = await params;
    const result = await clearQueuedPublishJobs({
      packId
    });

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Clear publish queue failed"
      },
      {
        status: 500
      }
    );
  }
}
