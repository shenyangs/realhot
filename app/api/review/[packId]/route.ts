import { NextRequest, NextResponse } from "next/server";
import { updateHotspotPackReview } from "@/lib/data/repository";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  try {
    const { packId } = await params;
    const payload = (await request.json()) as {
      status?: "pending" | "approved" | "needs-edit";
      note?: string;
      reviewer?: string;
    };

    if (!payload.status) {
      return NextResponse.json(
        {
          error: "status is required"
        },
        {
          status: 400
        }
      );
    }

    const updated = await updateHotspotPackReview(packId, {
      status: payload.status,
      note: payload.note,
      reviewer: payload.reviewer
    });

    return NextResponse.json({
      ok: true,
      pack: updated
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Review update failed"
      },
      {
        status: 500
      }
    );
  }
}
