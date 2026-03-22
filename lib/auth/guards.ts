import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/session";
import { ViewerContext, WorkspaceRole } from "@/lib/auth/types";

export type GuardRole = WorkspaceRole | "super_admin";

function hasAnyRole(viewer: ViewerContext, allowedRoles: GuardRole[]): boolean {
  if (viewer.isPlatformAdmin) {
    return true;
  }

  if (!viewer.workspaceRole) {
    return false;
  }

  return allowedRoles.includes(viewer.workspaceRole);
}

export async function requireAuthenticatedPageViewer(): Promise<ViewerContext> {
  const viewer = await getCurrentViewer();

  if (!viewer.isAuthenticated) {
    redirect("/login");
  }

  return viewer;
}

export async function requireWorkspacePageViewer(): Promise<ViewerContext> {
  const viewer = await requireAuthenticatedPageViewer();

  if (viewer.isPlatformAdmin) {
    redirect("/admin");
  }

  if (viewer.memberships.length > 1 && !viewer.currentWorkspace) {
    redirect("/select-workspace");
  }

  if (!viewer.currentWorkspace) {
    redirect("/select-workspace");
  }

  return viewer;
}

export async function requireApiViewer(options?: {
  requireWorkspace?: boolean;
  allowedRoles?: GuardRole[];
}): Promise<
  | {
      ok: true;
      viewer: ViewerContext;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  const viewer = await getCurrentViewer();

  if (!viewer.isAuthenticated) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "unauthenticated"
        },
        { status: 401 }
      )
    };
  }

  const requireWorkspace = options?.requireWorkspace ?? true;

  if (requireWorkspace && !viewer.isPlatformAdmin && !viewer.currentWorkspace) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "workspace_required"
        },
        { status: 403 }
      )
    };
  }

  if (options?.allowedRoles && !hasAnyRole(viewer, options.allowedRoles)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "forbidden"
        },
        { status: 403 }
      )
    };
  }

  return {
    ok: true,
    viewer
  };
}
