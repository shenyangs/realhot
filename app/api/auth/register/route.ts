import { NextRequest, NextResponse } from "next/server";
import { enforceSameOrigin } from "@/lib/auth/api-guard";
import { APP_SESSION_TTL_SECONDS, createAppSessionToken, getSessionCookieOptions } from "@/lib/auth/local-session";
import { registerWithInviteCode } from "@/lib/auth/repository";
import { sessionCookieNames } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const originError = enforceSameOrigin(request);

  if (originError) {
    return originError;
  }

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
      ok: true
    });

    if (result.mode === "demo") {
      response.cookies.set(
        sessionCookieNames.appSession,
        await createAppSessionToken(result.userId),
        getSessionCookieOptions(APP_SESSION_TTL_SECONDS)
      );
      if (result.workspaceSlug) {
        response.cookies.set(
          sessionCookieNames.workspaceSlug,
          result.workspaceSlug,
          getSessionCookieOptions(APP_SESSION_TTL_SECONDS)
        );
      }
      response.cookies.delete(sessionCookieNames.legacyUserId);
      response.cookies.delete(sessionCookieNames.demoRole);
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
