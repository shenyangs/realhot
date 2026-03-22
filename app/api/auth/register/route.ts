import { NextRequest, NextResponse } from "next/server";
import { registerWithInviteCode } from "@/lib/auth/repository";
import { sessionCookieNames } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    email?: string;
    displayName?: string;
    password?: string;
  };

  try {
    const result = await registerWithInviteCode({
      code: body.code ?? "",
      email: body.email ?? "",
      displayName: body.displayName ?? "",
      password: body.password ?? ""
    });

    const response = NextResponse.json({
      ok: true,
      needsEmailConfirm: result.mode === "supabase" ? result.needsEmailConfirm : false,
      requiresWorkspaceSelection: false
    });

    if (result.mode === "demo") {
      response.cookies.set(sessionCookieNames.userId, result.userId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
      response.cookies.delete(sessionCookieNames.demoRole);
      if (result.workspaceSlug) {
        response.cookies.set(sessionCookieNames.workspaceSlug, result.workspaceSlug, {
          httpOnly: true,
          sameSite: "lax",
          path: "/"
        });
      } else {
        response.cookies.delete(sessionCookieNames.workspaceSlug);
      }
    }

    if (result.mode === "supabase" && result.accessToken && result.refreshToken) {
      response.cookies.set(sessionCookieNames.accessToken, result.accessToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
      response.cookies.set(sessionCookieNames.refreshToken, result.refreshToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
      response.cookies.set(sessionCookieNames.userId, result.userId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
      response.cookies.delete(sessionCookieNames.demoRole);

      if (result.workspaceSlug) {
        response.cookies.set(sessionCookieNames.workspaceSlug, result.workspaceSlug, {
          httpOnly: true,
          sameSite: "lax",
          path: "/"
        });
      } else {
        response.cookies.delete(sessionCookieNames.workspaceSlug);
      }
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "registration_failed"
      },
      {
        status: 400
      }
    );
  }
}
