import { NextRequest, NextResponse } from "next/server";
import { enforceSameOrigin } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { getCurrentViewer } from "@/lib/auth/session";
import { sessionCookieNames } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const originError = enforceSameOrigin(request);

  if (originError) {
    return originError;
  }

  const viewer = await getCurrentViewer();

  if (viewer.isAuthenticated) {
    await writeAuditLog({
      workspaceId: viewer.currentWorkspace?.id,
      actorUserId: viewer.user.id,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "auth_session",
      entityId: viewer.user.id,
      action: "auth.logout",
      payload: {}
    });
  }

  const response = NextResponse.json({
    ok: true
  });

  response.cookies.delete(sessionCookieNames.accessToken);
  response.cookies.delete(sessionCookieNames.refreshToken);
  response.cookies.delete(sessionCookieNames.appSession);
  response.cookies.delete(sessionCookieNames.legacyUserId);
  response.cookies.delete(sessionCookieNames.workspaceSlug);
  response.cookies.delete(sessionCookieNames.demoRole);
  response.cookies.delete(sessionCookieNames.trialAccess);

  return response;
}
