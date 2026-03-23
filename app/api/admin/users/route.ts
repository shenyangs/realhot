import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { createManagedUserAccount } from "@/lib/auth/repository";

export async function POST(request: NextRequest) {
  const access = await requireApiAccess(request, {
    authorize: canAccessAdmin
  });

  if (!access.ok) {
    return access.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    login?: string;
    email?: string;
    displayName?: string;
    password?: string;
    workspaceId?: string;
    role?: "org_admin" | "operator" | "media_channel" | "approver";
  };

  if (!body.role) {
    return NextResponse.json({ ok: false, error: "role_required" }, { status: 400 });
  }

  try {
    const user = await createManagedUserAccount({
      login: body.login ?? "",
      email: body.email,
      displayName: body.displayName ?? "",
      password: body.password ?? "",
      workspaceId: body.workspaceId ?? "",
      role: body.role
    });

    return NextResponse.json({
      ok: true,
      user
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "user_create_failed"
      },
      {
        status: 400
      }
    );
  }
}
