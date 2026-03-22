import { NextRequest, NextResponse } from "next/server";
import { sessionCookieNames } from "@/lib/auth/session";

const validRoles = new Set(["super_admin", "org_admin", "operator", "approver"]);

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    role?: string;
    workspaceSlug?: string;
  };

  const role = body.role;

  if (!role || !validRoles.has(role)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_role"
      },
      {
        status: 400
      }
    );
  }

  const response = NextResponse.json({
    ok: true,
    role
  });

  response.cookies.set(sessionCookieNames.demoRole, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  if (body.workspaceSlug) {
    response.cookies.set(sessionCookieNames.workspaceSlug, body.workspaceSlug, {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
  } else {
    response.cookies.delete(sessionCookieNames.workspaceSlug);
  }

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({
    ok: true
  });

  response.cookies.delete(sessionCookieNames.demoRole);
  response.cookies.delete(sessionCookieNames.userId);
  response.cookies.delete(sessionCookieNames.workspaceSlug);

  return response;
}
