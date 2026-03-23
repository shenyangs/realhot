import { hashPassword } from "@/lib/auth/passwords";
import { ViewerMembership, ViewerUser, ViewerWorkspace, WorkspaceRole } from "@/lib/auth/types";

export interface DemoWorkspaceMemberRecord {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: string;
  invitedBy?: string;
  joinedAt?: string;
}

export interface DemoWorkspaceInviteRecord {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  token: string;
  invitedBy?: string;
  createdAt: string;
}

export interface DemoWorkspaceInviteCodeRecord {
  id: string;
  workspaceId: string;
  code: string;
  role: WorkspaceRole;
  status: "active" | "disabled" | "used-up";
  maxUses: number;
  usedCount: number;
  createdBy?: string;
  createdAt: string;
}

export interface DemoAuthAccountRecord {
  userId: string;
  email?: string;
  username?: string;
  password: string;
  passwordSetupRequired: boolean;
}

export const DEMO_WORKSPACES: ViewerWorkspace[] = [
  {
    id: "88888888-8888-8888-8888-888888888881",
    name: "SignalStack Demo Workspace",
    slug: "signalstack-demo",
    planType: "trial",
    status: "active"
  },
  {
    id: "88888888-8888-8888-8888-888888888882",
    name: "China Growth Lab",
    slug: "china-growth-lab",
    planType: "pro",
    status: "active"
  }
];

export const DEMO_USERS: Record<"super_admin" | WorkspaceRole, ViewerUser> = {
  super_admin: {
    id: "99999999-9999-9999-9999-999999999991",
    email: "admin@local.dev",
    displayName: "超级管理员",
    status: "active"
  },
  org_admin: {
    id: "99999999-9999-9999-9999-999999999992",
    email: "owner@example.com",
    displayName: "Workspace Owner",
    status: "active"
  },
  operator: {
    id: "99999999-9999-9999-9999-999999999993",
    email: "operator@example.com",
    displayName: "Content Operator",
    status: "active"
  },
  approver: {
    id: "99999999-9999-9999-9999-999999999994",
    email: "approver@example.com",
    displayName: "Content Approver",
    status: "active"
  }
};

export const DEMO_WORKSPACE_MEMBERS: DemoWorkspaceMemberRecord[] = [
  {
    id: "12121212-1212-1212-1212-121212121212",
    workspaceId: DEMO_WORKSPACES[0].id,
    userId: DEMO_USERS.org_admin.id,
    role: "org_admin",
    status: "active",
    invitedBy: DEMO_USERS.super_admin.id,
    joinedAt: "2026-03-22T08:00:00+08:00"
  },
  {
    id: "13131313-1313-1313-1313-131313131313",
    workspaceId: DEMO_WORKSPACES[0].id,
    userId: DEMO_USERS.operator.id,
    role: "operator",
    status: "active",
    invitedBy: DEMO_USERS.org_admin.id,
    joinedAt: "2026-03-22T08:10:00+08:00"
  },
  {
    id: "14141414-1414-1414-1414-141414141414",
    workspaceId: DEMO_WORKSPACES[0].id,
    userId: DEMO_USERS.approver.id,
    role: "approver",
    status: "active",
    invitedBy: DEMO_USERS.org_admin.id,
    joinedAt: "2026-03-22T08:20:00+08:00"
  },
  {
    id: "15151515-1515-1515-1515-151515151515",
    workspaceId: DEMO_WORKSPACES[1].id,
    userId: DEMO_USERS.org_admin.id,
    role: "org_admin",
    status: "active",
    invitedBy: DEMO_USERS.super_admin.id,
    joinedAt: "2026-03-22T09:00:00+08:00"
  },
  {
    id: "16161616-1616-1616-1616-161616161616",
    workspaceId: DEMO_WORKSPACES[1].id,
    userId: DEMO_USERS.approver.id,
    role: "approver",
    status: "active",
    invitedBy: DEMO_USERS.org_admin.id,
    joinedAt: "2026-03-22T09:10:00+08:00"
  }
];

export const DEMO_WORKSPACE_INVITES: DemoWorkspaceInviteRecord[] = [];

export const DEMO_WORKSPACE_INVITE_CODES: DemoWorkspaceInviteCodeRecord[] = [
  {
    id: "17171717-1717-1717-1717-171717171717",
    workspaceId: DEMO_WORKSPACES[0].id,
    code: "SIGNALSTACK-TRIAL-01",
    role: "operator",
    status: "active",
    maxUses: 3,
    usedCount: 0,
    createdBy: DEMO_USERS.super_admin.id,
    createdAt: "2026-03-22T09:20:00+08:00"
  }
];

export const DEMO_AUTH_ACCOUNTS: DemoAuthAccountRecord[] = [
  {
    userId: DEMO_USERS.super_admin.id,
    email: DEMO_USERS.super_admin.email ?? "admin@local.dev",
    username: "admin",
    password: hashPassword("qingman0525"),
    passwordSetupRequired: false
  },
  {
    userId: DEMO_USERS.org_admin.id,
    email: DEMO_USERS.org_admin.email ?? "owner@example.com",
    password: hashPassword("Init@123"),
    passwordSetupRequired: true
  },
  {
    userId: DEMO_USERS.operator.id,
    email: DEMO_USERS.operator.email ?? "operator@example.com",
    password: hashPassword("Init@123"),
    passwordSetupRequired: true
  },
  {
    userId: DEMO_USERS.approver.id,
    email: DEMO_USERS.approver.email ?? "approver@example.com",
    password: hashPassword("Init@123"),
    passwordSetupRequired: true
  }
];

export function getDemoMembershipsForRole(role: WorkspaceRole): ViewerMembership[] {
  const userId = DEMO_USERS[role].id;

  return DEMO_WORKSPACE_MEMBERS.filter((member) => member.userId === userId)
    .map((member) => {
      const workspace = DEMO_WORKSPACES.find((item) => item.id === member.workspaceId);

      if (!workspace) {
        return null;
      }

      return {
        workspace,
        role: member.role,
        status: member.status
      };
    })
    .filter((member): member is ViewerMembership => member !== null);
}
