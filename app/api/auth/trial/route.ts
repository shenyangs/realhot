import { NextRequest, NextResponse } from "next/server";
import { enforceSameOrigin } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { DEMO_USERS, DEMO_WORKSPACES } from "@/lib/auth/demo-data";
import { APP_SESSION_TTL_SECONDS, createAppSessionToken, getSessionCookieOptions } from "@/lib/auth/local-session";
import { sessionCookieNames } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const originError = enforceSameOrigin(request);

  if (originError) {
    return originError;
  }

  const trialUser = DEMO_USERS.operator;
  const trialWorkspace = DEMO_WORKSPACES[0];

  const response = NextResponse.json({
    ok: true,
    mode: "trial"
  });

  response.cookies.set(
    sessionCookieNames.appSession,
    await createAppSessionToken(trialUser.id),
    getSessionCookieOptions(APP_SESSION_TTL_SECONDS)
  );
  response.cookies.set(
    sessionCookieNames.workspaceSlug,
    trialWorkspace.slug,
    getSessionCookieOptions(APP_SESSION_TTL_SECONDS)
  );
  response.cookies.set(
    sessionCookieNames.trialAccess,
    "1",
    getSessionCookieOptions(APP_SESSION_TTL_SECONDS)
  );
  response.cookies.delete(sessionCookieNames.accessToken);
  response.cookies.delete(sessionCookieNames.refreshToken);
  response.cookies.delete(sessionCookieNames.legacyUserId);
  response.cookies.delete(sessionCookieNames.demoRole);

  await writeAuditLog({
    workspaceId: trialWorkspace.id,
    actorUserId: trialUser.id,
    actorDisplayName: "试用访客",
    actorEmail: trialUser.email,
    entityType: "auth_session",
    entityId: trialUser.id,
    action: "auth.trial_access",
    payload: {
      workspaceSlug: trialWorkspace.slug
    }
  });

  return response;
}
