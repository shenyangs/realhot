export type PlatformRole = "super_admin";
export type WorkspaceRole = "org_admin" | "operator" | "media_channel" | "approver";
export type AppRole = PlatformRole | WorkspaceRole | "guest" | "trial_guest";

export interface ViewerUser {
  id: string;
  email?: string;
  displayName: string;
  avatarUrl?: string;
  status?: string;
  passwordSetupRequired?: boolean;
}

export interface ViewerWorkspace {
  id: string;
  name: string;
  slug: string;
  planType?: string;
  status?: string;
}

export interface ViewerMembership {
  workspace: ViewerWorkspace;
  role: WorkspaceRole;
  status: string;
}

export interface ManagedAccountSummary {
  login: string;
  email?: string;
}

export interface ViewerContext {
  mode: "demo" | "supabase";
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  platformRole: PlatformRole | null;
  workspaceRole: WorkspaceRole | null;
  effectiveRole: AppRole;
  user: ViewerUser;
  currentWorkspace: ViewerWorkspace | null;
  memberships: ViewerMembership[];
}

export const roleLabels: Record<AppRole, string> = {
  super_admin: "超级管理员",
  org_admin: "组织管理员",
  operator: "热点策划",
  media_channel: "媒介渠道",
  approver: "审核者",
  guest: "未登录",
  trial_guest: "试用访客（只读）"
};
