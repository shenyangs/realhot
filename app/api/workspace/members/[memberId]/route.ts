import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canManageMembers } from "@/lib/auth";
import { updateWorkspaceMember } from "@/lib/auth/repository";

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      memberId: string;
    }>;
  }
) {
  const access = await requireApiAccess(request, {
    authorize: canManageMembers,
    requireWorkspace: true
  });

  if (!access.ok) {
    return access.response;
  }

  const { memberId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    role?: "org_admin" | "operator" | "media_channel" | "approver";
    status?: string;
  };

  try {
    const member = await updateWorkspaceMember(memberId, {
      role: body.role,
      status: body.status
    });

    return NextResponse.json({
      ok: true,
      member
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "member_update_failed"
      },
      {
        status: 400
      }
    );
  }
}
