import { NextRequest, NextResponse } from "next/server";
import { runOneClickProduction } from "@/lib/services/production-studio";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "一键制作失败";
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      packId?: string;
    };

    const packId = payload.packId?.trim();

    if (!packId) {
      return NextResponse.json(
        {
          ok: false,
          error: "packId is required"
        },
        {
          status: 400
        }
      );
    }

    const job = await runOneClickProduction(packId);

    return NextResponse.json({
      ok: true,
      job
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
