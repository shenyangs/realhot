import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canManageMembers } from "@/lib/auth";
import { createWorkspaceInvite } from "@/lib/auth/repository";

export async function POST(request: NextRequest) {
  const access = await requireApiAccess(request, {
    authorize: canManageMembers,
    requireWorkspace: true
  });

  if (!access.ok) {
    return access.response;
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
