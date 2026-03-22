import { NextResponse } from "next/server";
import { pushProductionBundleToPublish } from "@/lib/services/production-studio";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  try {
    const { packId } = await params;
    const result = await pushProductionBundleToPublish(packId);

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "推送发布队列失败"
      },
      {
        status: 500
      }
    );
  }
}
