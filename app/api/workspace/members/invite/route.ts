import { NextRequest, NextResponse } from "next/server";
import { canManageMembers } from "@/lib/auth";
import { createWorkspaceInvite } from "@/lib/auth/repository";
import { getCurrentViewer } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
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

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    displayName?: string;
    role?: "org_admin" | "operator" | "approver";
  };

  if (!body.email || !body.role) {
    return NextResponse.json(
      {
        ok: false,
        error: "email_and_role_required"
      },
      {
        status: 400
      }
    );
  }

  try {
    const invite = await createWorkspaceInvite({
      email: body.email,
      displayName: body.displayName,
      role: body.role
    });

    return NextResponse.json({
      ok: true,
      invite
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "invite_create_failed"
      },
      {
        status: 400
      }
    );
  }
}
