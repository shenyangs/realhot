import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readAppSessionToken } from "@/lib/auth/local-session";

const PUBLIC_PATHS = ["/login", "/register"];
const TRIAL_ACCESS_COOKIE = "brand_os_trial_access";
const TRIAL_ALLOWED_PATHS = ["/", "/hotspots", "/account"];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) {
    return true;
  }

  if (pathname.startsWith("/api")) {
    return true;
  }

  if (pathname.startsWith("/_next")) {
    return true;
  }

  return pathname === "/favicon.ico";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasAccessToken = request.cookies.has("brand_os_access_token");
  const hasLocalSession = Boolean(
    await readAppSessionToken(request.cookies.get("brand_os_session")?.value)
  );
  const hasSession = hasAccessToken || hasLocalSession;

  if (hasSession) {
    const isTrialAccess = request.cookies.get(TRIAL_ACCESS_COOKIE)?.value === "1";

    if (isTrialAccess) {
      const allowed = TRIAL_ALLOWED_PATHS.some((path) =>
        path === "/"
          ? pathname === "/"
          : pathname === path || pathname.startsWith(`${path}/`)
      );

      if (!allowed) {
        const redirectUrl = new URL("/", request.url);
        return NextResponse.redirect(redirectUrl);
      }
    }

    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"]
};
