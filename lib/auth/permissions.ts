import { ViewerContext } from "@/lib/auth/types";

export function canAccessAdmin(viewer: ViewerContext): boolean {
  return viewer.isPlatformAdmin;
}

export function canManageMembers(viewer: ViewerContext): boolean {
  return viewer.workspaceRole === "org_admin" || viewer.isPlatformAdmin;
}

export function canManageBrands(viewer: ViewerContext): boolean {
  return viewer.workspaceRole === "org_admin" || viewer.isPlatformAdmin;
}

export function canGenerateContent(viewer: ViewerContext): boolean {
  return viewer.workspaceRole === "org_admin" || viewer.workspaceRole === "operator" || viewer.isPlatformAdmin;
}

export function canApproveContent(viewer: ViewerContext): boolean {
  return viewer.workspaceRole === "org_admin" || viewer.workspaceRole === "approver" || viewer.isPlatformAdmin;
}

export function canExportContent(viewer: ViewerContext): boolean {
  return canApproveContent(viewer);
}

