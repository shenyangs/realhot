import { ViewerContext } from "@/lib/auth/types";

function hasPlatformOverride(viewer: ViewerContext): boolean {
  return viewer.isPlatformAdmin;
}

export function canAccessAdmin(viewer: ViewerContext): boolean {
  return hasPlatformOverride(viewer);
}

export function canManageMembers(viewer: ViewerContext): boolean {
  return viewer.workspaceRole === "org_admin" || hasPlatformOverride(viewer);
}

export function canManageBrands(viewer: ViewerContext): boolean {
  return viewer.workspaceRole === "org_admin" || hasPlatformOverride(viewer);
}

export function canGenerateContent(viewer: ViewerContext): boolean {
  return (
    hasPlatformOverride(viewer) ||
    viewer.workspaceRole === "org_admin" ||
    viewer.workspaceRole === "operator" ||
    viewer.workspaceRole === "media_channel"
  );
}

export function canUseHotspotInsight(viewer: ViewerContext): boolean {
  return canGenerateContent(viewer) || viewer.effectiveRole === "trial_guest";
}

export function canApproveContent(viewer: ViewerContext): boolean {
  return hasPlatformOverride(viewer) || viewer.workspaceRole === "org_admin" || viewer.workspaceRole === "approver";
}

export function canExportContent(viewer: ViewerContext): boolean {
  return canApproveContent(viewer);
}
