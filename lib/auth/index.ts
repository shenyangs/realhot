export { canAccessAdmin, canApproveContent, canExportContent, canGenerateContent, canManageBrands, canManageMembers } from "@/lib/auth/permissions";
export { getCurrentUserId, getCurrentViewer, getCurrentWorkspaceSlug, sessionCookieNames } from "@/lib/auth/session";
export { requireApiViewer, requireAuthenticatedPageViewer, requireWorkspacePageViewer } from "@/lib/auth/guards";
export type { AppRole, PlatformRole, ViewerContext, ViewerMembership, ViewerUser, ViewerWorkspace, WorkspaceRole } from "@/lib/auth/types";
export { roleLabels } from "@/lib/auth/types";
