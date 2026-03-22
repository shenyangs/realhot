import { NextRequest, NextResponse } from "next/server";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { createWorkspaceInviteCodes } from "@/lib/auth/repository";
import { getCurrentViewer } from "@/lib/auth/session";

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      workspaceId: string;
    }>;
  }
) {
  const viewer = await getCurrentViewer();

  if (!canAccessAdmin(viewer)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { workspaceId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    role?: "org_admin" | "operator" | "approver";
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
