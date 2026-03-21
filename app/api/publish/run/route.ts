import { NextRequest, NextResponse } from "next/server";
import { runPublishQueue } from "@/lib/services/publish-executor";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.PUBLISH_RUNNER_SECRET;

  if (!expected) {
    return true;
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerSecret = request.headers.get("x-runner-secret");

  return bearer === expected || headerSecret === expected;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "Unauthorized"
      },
      {
        status: 401
      }
    );
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as {
      packId?: string;
      limit?: number;
    };

    const result = await runPublishQueue({
      packId: payload.packId,
      limit: payload.limit
    });

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Publish runner failed"
      },
      {
        status: 500
      }
    );
  }
}
