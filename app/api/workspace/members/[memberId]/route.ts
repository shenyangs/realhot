import { NextRequest, NextResponse } from "next/server";
import { canManageMembers } from "@/lib/auth";
import { updateWorkspaceMember } from "@/lib/auth/repository";
import { getCurrentViewer } from "@/lib/auth/session";

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      memberId: string;
    }>;
  }
) {
  const viewer = await getCurrentViewer();

  if (!canManageMembers(viewer)) {
    return NextResponse.json(
      {
        ok: false,
        error: "forbidden"
      },
      {
        status: 403
      }
    );
  }

  const { memberId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    role?: "org_admin" | "operator" | "approver";
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
