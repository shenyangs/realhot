import { NextRequest, NextResponse } from "next/server";
import { runProductionQueue } from "@/lib/services/production-executor";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.PRODUCTION_RUNNER_SECRET;

  if (!expected) {
    return true;
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerSecret = request.headers.get("x-production-secret");

  return bearer === expected || headerSecret === expected;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthorized"
      },
      {
        status: 401
      }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    workspaceId?: string;
    jobId?: string;
    limit?: number;
  };

  const result = await runProductionQueue({
    workspaceId: body.workspaceId?.trim() || undefined,
    jobId: body.jobId?.trim() || undefined,
    limit: body.limit
  }).catch((error) => ({
    error: error instanceof Error ? error.message : "production_runner_failed"
  }));

  if ("error" in result) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error
      },
      {
        status: 500
      }
    );
  }

  return NextResponse.json({
    ok: true,
    ...result
  });
}
