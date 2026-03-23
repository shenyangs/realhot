export {
  canAccessAdmin,
  canApproveContent,
  canExportContent,
  canGenerateContent,
  canManageBrands,
  canManageMembers,
  canUseHotspotInsight
} from "@/lib/auth/permissions";
export { getCurrentUserId, getCurrentViewer, getCurrentWorkspaceSlug, sessionCookieNames } from "@/lib/auth/session";
export type { AppRole, PlatformRole, ViewerContext, ViewerMembership, ViewerUser, ViewerWorkspace, WorkspaceRole } from "@/lib/auth/types";
export { roleLabels } from "@/lib/auth/types";
