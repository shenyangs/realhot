import { NextResponse } from "next/server";
import { sessionCookieNames } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({
    ok: true
  });

  response.cookies.delete(sessionCookieNames.accessToken);
  response.cookies.delete(sessionCookieNames.refreshToken);
  response.cookies.delete(sessionCookieNames.userId);
  response.cookies.delete(sessionCookieNames.workspaceSlug);
  response.cookies.delete(sessionCookieNames.demoRole);

  return response;
}

