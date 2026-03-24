import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canAccessAdmin, canManageMembers } from "@/lib/auth/permissions";
import { updateWorkspace } from "@/lib/auth/repository";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      workspaceId: string;
    }>;
  }
) {
  const access = await requireApiAccess(request);

  if (!access.ok) {
    return access.response;
  }

  const { viewer } = access;
  const { workspaceId } = await context.params;

  const canManageCurrentWorkspace =
    canManageMembers(viewer) && viewer.currentWorkspace?.id === workspaceId;

  if (!canAccessAdmin(viewer) && !canManageCurrentWorkspace) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    slug?: string;
    planType?: string;
    status?: string;
  };

  try {
    const workspace = await updateWorkspace({
      workspaceId,
      name: body.name,
      slug: body.slug,
      planType: body.planType,
      status: body.status
    });

    return NextResponse.json({
      ok: true,
      workspace
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "workspace_update_failed"
      },
      { status: 400 }
    );
  }
}
