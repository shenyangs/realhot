import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canApproveContent } from "@/lib/auth/permissions";
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
  let actor:
    | {
        userId?: string;
        displayName: string;
        email?: string;
        workspaceId?: string;
      }
    | undefined;

  if (!isAuthorized(request)) {
    const access = await requireApiAccess(request, {
      authorize: canApproveContent,
      requireWorkspace: true
    });

    if (!access.ok) {
      return access.response;
    }

    actor = {
      userId: access.viewer.user.id,
      displayName: access.viewer.user.displayName,
      email: access.viewer.user.email,
      workspaceId: access.viewer.currentWorkspace?.id
    };
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

    await writeAuditLog({
      workspaceId: actor?.workspaceId,
      entityType: "publish_runner",
      entityId: payload.packId,
      action: "publish.queue_run_completed",
      actorUserId: actor?.userId,
      actorDisplayName: actor?.displayName ?? "发布执行器",
      actorEmail: actor?.email,
      payload: {
        packId: payload.packId,
        scanned: result.scanned,
        published: result.published,
        failed: result.failed,
        jobs: result.jobs
      }
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
