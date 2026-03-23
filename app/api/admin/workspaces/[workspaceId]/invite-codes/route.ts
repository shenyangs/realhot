import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { createWorkspaceInviteCodes } from "@/lib/auth/repository";

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      workspaceId: string;
    }>;
  }
) {
  const access = await requireApiAccess(request, {
    authorize: canAccessAdmin
  });

  if (!access.ok) {
    return access.response;
  }

  const { workspaceId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    role?: "org_admin" | "operator" | "media_channel" | "approver";
    quantity?: number;
    maxUses?: number;
  };

  if (!body.role) {
    return NextResponse.json({ ok: false, error: "role_required" }, { status: 400 });
  }

  try {
    const codes = await createWorkspaceInviteCodes({
      workspaceId,
      role: body.role,
      quantity: body.quantity ?? 1,
      maxUses: body.maxUses ?? 1
    });

    return NextResponse.json({
      ok: true,
      codes
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "invite_code_create_failed"
      },
      { status: 400 }
    );
  }
}
