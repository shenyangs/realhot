import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/session";
import { ViewerContext } from "@/lib/auth/types";

type AuthorizationCheck = (viewer: ViewerContext) => boolean;

interface RequireApiAccessOptions {
  authorize?: AuthorizationCheck;
  unauthenticatedError?: string;
  forbiddenError?: string;
  requireWorkspace?: boolean;
  requireSameOrigin?: boolean;
}

interface ApiAccessSuccess {
  ok: true;
  viewer: ViewerContext;
}

interface ApiAccessFailure {
  ok: false;
  response: NextResponse;
}

function resolveRequestOrigin(request: NextRequest) {
  const originHeader = request.headers.get("origin");

  if (originHeader) {
    return originHeader;
  }

  const referer = request.headers.get("referer");

  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function enforceSameOrigin(request: NextRequest): NextResponse | null {
  const requestOrigin = resolveRequestOrigin(request);

  if (!requestOrigin || requestOrigin !== request.nextUrl.origin) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request_origin"
      },
      {
        status: 403
      }
    );
  }

  return null;
}

export async function requireApiAccess(
  request: NextRequest,
  options: RequireApiAccessOptions = {}
): Promise<ApiAccessSuccess | ApiAccessFailure> {
  const shouldEnforceSameOrigin = options.requireSameOrigin ?? !["GET", "HEAD", "OPTIONS"].includes(request.method);

  if (shouldEnforceSameOrigin) {
    const originError = enforceSameOrigin(request);

    if (originError) {
      return {
        ok: false,
        response: originError
      };
    }
  }

  const viewer = await getCurrentViewer();

  if (!viewer.isAuthenticated) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: options.unauthenticatedError ?? "unauthenticated"
        },
        {
          status: 401
        }
      )
    };
  }

  if (options.requireWorkspace && !viewer.isPlatformAdmin && !viewer.currentWorkspace) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "workspace_required"
        },
        {
          status: 403
        }
      )
    };
  }

  if (options.authorize && !options.authorize(viewer)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: options.forbiddenError ?? "forbidden"
        },
        {
          status: 403
        }
      )
    };
  }

  return {
    ok: true,
    viewer
  };
}
