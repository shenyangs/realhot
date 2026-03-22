import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { DemoWorkspaceInviteRecord, DemoWorkspaceMemberRecord, DEMO_USERS } from "@/lib/auth/demo-data";
import { getCurrentViewer, sessionCookieNames } from "@/lib/auth/session";
import { ViewerUser, ViewerWorkspace, WorkspaceRole } from "@/lib/auth/types";
import { readLocalDataStore, updateLocalDataStore } from "@/lib/data/local-store";
import { getSupabaseClient, getSupabaseServerClient } from "@/lib/supabase/client";

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  plan_type: string | null;
  status: string | null;
}

interface WorkspaceMemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  status: string;
  joined_at: string | null;
  profiles:
    | {
        id: string;
        email: string | null;
        display_name: string;
        avatar_url: string | null;
      }
    | {
        id: string;
        email: string | null;
        display_name: string;
        avatar_url: string | null;
      }[]
    | null;
}

interface WorkspaceInviteRow {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  created_at: string;
}

interface WorkspaceInviteCodeRow {
  id: string;
  workspace_id: string;
  code: string;
  role: WorkspaceRole;
  status: "active" | "disabled" | "used-up";
  max_uses: number;
  used_count: number;
  created_at: string;
}

export interface WorkspaceMemberRecord {
  id: string;
  user: ViewerUser;
  workspaceId: string;
  role: WorkspaceRole;
  status: string;
  joinedAt?: string;
}

export interface WorkspaceInviteRecord {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  createdAt: string;
}

export interface PlatformUserRecord {
  id: string;
  displayName: string;
  email?: string;
  status: string;
  isPlatformAdmin: boolean;
  workspaceCount: number;
  workspaceNames: string[];
}

export interface PlatformWorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
  planType?: string;
  memberCount: number;
}

export interface WorkspaceInviteCodeRecord {
  id: string;
  workspaceId: string;
  code: string;
  role: WorkspaceRole;
  status: "active" | "disabled" | "used-up";
  maxUses: number;
  usedCount: number;
  createdAt: string;
}

interface SupabaseAuthProfileInput {
  id: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

function normalizeProfile(input: WorkspaceMemberRow["profiles"]): ViewerUser | null {
  const profile = Array.isArray(input) ? input[0] : input;

  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    email: profile.email ?? undefined,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url ?? undefined
  };
}

function mapWorkspaceRow(row: WorkspaceRow): ViewerWorkspace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    planType: row.plan_type ?? undefined,
    status: row.status ?? undefined
  };
}

export async function isSupabaseSessionAvailable(): Promise<boolean> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(sessionCookieNames.accessToken)?.value;
  const supabase = getSupabaseClient();

  if (!accessToken || !supabase) {
    return false;
  }

  const { data } = await supabase.auth.getUser(accessToken);
  return Boolean(data.user);
}

export async function listAvailableWorkspaces() {
  const viewer = await getCurrentViewer();

  if (viewer.mode === "demo") {
    const store = await readLocalDataStore();

    return viewer.memberships
      .map((membership) => store.workspaces.find((workspace) => workspace.id === membership.workspace.id))
      .filter((workspace): workspace is ViewerWorkspace => workspace !== undefined);
  }

  return viewer.memberships.map((membership) => membership.workspace);
}

export async function loginWithLocalAccount(input: {
  email: string;
  password: string;
}) {
  const store = await readLocalDataStore();
  const normalizedEmail = input.email.trim().toLowerCase();
  const account = store.authAccounts.find(
    (item) => item.email.toLowerCase() === normalizedEmail && item.password === input.password
  );

  if (!account) {
    throw new Error("invalid_credentials");
  }

  const profile = store.profiles.find((item) => item.id === account.userId);

  if (!profile || profile.status === "disabled") {
    throw new Error("account_disabled");
  }

  const memberships = store.workspaceMembers.filter(
    (member) => member.userId === account.userId && member.status !== "disabled"
  );

  return {
    userId: account.userId,
    requiresWorkspaceSelection: memberships.length > 1,
    workspaceSlug:
      memberships.length === 1
        ? store.workspaces.find((workspace) => workspace.id === memberships[0].workspaceId)?.slug ?? null
        : null
  };
}

export async function setCurrentWorkspaceBySlug(slug: string) {
  const viewer = await getCurrentViewer();
  const membership = viewer.memberships.find((item) => item.workspace.slug === slug);

  if (!membership) {
    throw new Error("workspace_not_allowed");
  }

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieNames.workspaceSlug, slug, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  return membership.workspace;
}

function buildDemoMemberRecord(
  member: DemoWorkspaceMemberRecord,
  profiles: ViewerUser[]
): WorkspaceMemberRecord | null {
  const user = profiles.find((profile) => profile.id === member.userId);

  if (!user) {
    return null;
  }

  return {
    id: member.id,
    user,
    workspaceId: member.workspaceId,
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt
  };
}

function buildDemoInviteRecord(invite: DemoWorkspaceInviteRecord): WorkspaceInviteRecord {
  return {
    id: invite.id,
    workspaceId: invite.workspaceId,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    createdAt: invite.createdAt
  };
}

export async function listWorkspaceMembers(): Promise<WorkspaceMemberRecord[]> {
  const viewer = await getCurrentViewer();
  const workspaceId = viewer.currentWorkspace?.id;

  if (!workspaceId) {
    return [];
  }

  if (viewer.mode === "demo") {
    const store = await readLocalDataStore();
    const members: WorkspaceMemberRecord[] = [];

    for (const member of store.workspaceMembers) {
      if (member.workspaceId !== workspaceId) {
        continue;
      }

      const record = buildDemoMemberRecord(member, store.profiles);

      if (!record) {
        continue;
      }

      members.push(record);
    }

    return members;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("workspace_members")
    .select("id, workspace_id, user_id, role, status, joined_at, profiles(id, email, display_name, avatar_url)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .returns<WorkspaceMemberRow[]>();

  if (error || !data) {
    return [];
  }

  const members: WorkspaceMemberRecord[] = [];

  for (const row of data) {
    const user = normalizeProfile(row.profiles);

    if (!user) {
      continue;
    }

    members.push({
      id: row.id,
      user,
      workspaceId: row.workspace_id,
      role: row.role,
      status: row.status,
      joinedAt: row.joined_at ?? undefined
    });
  }

  return members;
}

export async function updateWorkspaceMember(
  memberId: string,
  input: {
    role?: WorkspaceRole;
    status?: string;
  }
): Promise<WorkspaceMemberRecord> {
  const viewer = await getCurrentViewer();
  const workspaceId = viewer.currentWorkspace?.id;

  if (!workspaceId) {
    throw new Error("workspace_required");
  }

  if (viewer.mode === "demo") {
    await updateLocalDataStore((store) => {
      const nextMembers = store.workspaceMembers.map((member) => {
        if (member.id !== memberId || member.workspaceId !== workspaceId) {
          return member;
        }

        return {
          ...member,
          role: input.role ?? member.role,
          status: input.status ?? member.status
        };
      });

      return {
        ...store,
        workspaceMembers: nextMembers
      };
    });

    const store = await readLocalDataStore();
    const updated = store.workspaceMembers.find((member) => member.id === memberId && member.workspaceId === workspaceId);

    if (!updated) {
      throw new Error("member_not_found");
    }

    const record = buildDemoMemberRecord(updated, store.profiles);

    if (!record) {
      throw new Error("member_profile_missing");
    }

    return record;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("supabase_not_configured");
  }

  const payload: Record<string, string> = {};

  if (input.role) {
    payload.role = input.role;
  }

  if (input.status) {
    payload.status = input.status;
  }

  const { data, error } = await supabase
    .from("workspace_members")
    .update(payload)
    .eq("id", memberId)
    .eq("workspace_id", workspaceId)
    .select("id, workspace_id, user_id, role, status, joined_at, profiles(id, email, display_name, avatar_url)")
    .maybeSingle<WorkspaceMemberRow>();

  if (error || !data) {
    throw new Error("member_update_failed");
  }

  const user = normalizeProfile(data.profiles);

  if (!user) {
    throw new Error("member_profile_missing");
  }

  return {
    id: data.id,
    user,
    workspaceId: data.workspace_id,
    role: data.role,
    status: data.status,
    joinedAt: data.joined_at ?? undefined
  };
}

export async function listWorkspaceInvites(): Promise<WorkspaceInviteRecord[]> {
  const viewer = await getCurrentViewer();
  const workspaceId = viewer.currentWorkspace?.id;

  if (!workspaceId) {
    return [];
  }

  if (viewer.mode === "demo") {
    const store = await readLocalDataStore();
    return store.workspaceInvites
      .filter((invite) => invite.workspaceId === workspaceId)
      .map(buildDemoInviteRecord);
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("workspace_invites")
    .select("id, workspace_id, email, role, status, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .returns<WorkspaceInviteRow[]>();

  if (error || !data) {
    return [];
  }

  return data.map((invite) => ({
    id: invite.id,
    workspaceId: invite.workspace_id,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    createdAt: invite.created_at
  }));
}

export async function listWorkspaceInviteCodes(): Promise<WorkspaceInviteCodeRecord[]> {
  const viewer = await getCurrentViewer();
  const workspaceId = viewer.currentWorkspace?.id;

  if (!workspaceId) {
    return [];
  }

  if (viewer.mode === "demo") {
    const store = await readLocalDataStore();
    return store.workspaceInviteCodes
      .filter((code) => code.workspaceId === workspaceId)
      .map((code) => ({
        id: code.id,
        workspaceId: code.workspaceId,
        code: code.code,
        role: code.role,
        status: code.status,
        maxUses: code.maxUses,
        usedCount: code.usedCount,
        createdAt: code.createdAt
      }));
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("workspace_invite_codes")
    .select("id, workspace_id, code, role, status, max_uses, used_count, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .returns<WorkspaceInviteCodeRow[]>();

  if (error || !data) {
    return [];
  }

  return data.map((code) => ({
    id: code.id,
    workspaceId: code.workspace_id,
    code: code.code,
    role: code.role,
    status: code.status,
    maxUses: code.max_uses,
    usedCount: code.used_count,
    createdAt: code.created_at
  }));
}

export async function listInviteCodesForWorkspace(workspaceId: string): Promise<WorkspaceInviteCodeRecord[]> {
  const viewer = await getCurrentViewer();

  if (viewer.mode === "demo") {
    const store = await readLocalDataStore();
    return store.workspaceInviteCodes
      .filter((code) => code.workspaceId === workspaceId)
      .map((code) => ({
        id: code.id,
        workspaceId: code.workspaceId,
        code: code.code,
        role: code.role,
        status: code.status,
        maxUses: code.maxUses,
        usedCount: code.usedCount,
        createdAt: code.createdAt
      }));
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("workspace_invite_codes")
    .select("id, workspace_id, code, role, status, max_uses, used_count, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .returns<WorkspaceInviteCodeRow[]>();

  if (error || !data) {
    return [];
  }

  return data.map((code) => ({
    id: code.id,
    workspaceId: code.workspace_id,
    code: code.code,
    role: code.role,
    status: code.status,
    maxUses: code.max_uses,
    usedCount: code.used_count,
    createdAt: code.created_at
  }));
}

export async function createWorkspaceInvite(input: {
  email: string;
  role: WorkspaceRole;
  displayName?: string;
}): Promise<WorkspaceInviteRecord> {
  const viewer = await getCurrentViewer();
  const workspaceId = viewer.currentWorkspace?.id;

  if (!workspaceId) {
    throw new Error("workspace_required");
  }

  const normalizedEmail = input.email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("email_required");
  }

  if (viewer.mode === "demo") {
    const createdAt = new Date().toISOString();
    const inviteId = randomUUID();

    await updateLocalDataStore((store) => {
      const existingInvite = store.workspaceInvites.find(
        (invite) => invite.workspaceId === workspaceId && invite.email.toLowerCase() === normalizedEmail && invite.status === "pending"
      );

      if (existingInvite) {
        throw new Error("invite_already_exists");
      }

      const existingProfile = store.profiles.find((profile) => profile.email?.toLowerCase() === normalizedEmail);
      const userId = existingProfile?.id ?? randomUUID();
      const displayName = input.displayName?.trim() || normalizedEmail.split("@")[0] || "New Member";
      const nextProfiles = existingProfile
        ? store.profiles
        : [
            ...store.profiles,
            {
              id: userId,
              email: normalizedEmail,
              displayName
            }
          ];

      const memberExists = store.workspaceMembers.some(
        (member) => member.workspaceId === workspaceId && member.userId === userId
      );

      const nextMembers = memberExists
        ? store.workspaceMembers
        : [
            ...store.workspaceMembers,
            {
              id: randomUUID(),
              workspaceId,
              userId,
              role: input.role,
              status: "invited",
              invitedBy: viewer.user.id
            }
          ];

      return {
        ...store,
        profiles: nextProfiles,
        workspaceMembers: nextMembers,
        workspaceInvites: [
          ...store.workspaceInvites,
          {
            id: inviteId,
            workspaceId,
            email: normalizedEmail,
            role: input.role,
            status: "pending",
            token: randomUUID(),
            invitedBy: viewer.user.id,
            createdAt
          }
        ]
      };
    });

    return {
      id: inviteId,
      workspaceId,
      email: normalizedEmail,
      role: input.role,
      status: "pending",
      createdAt
    };
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("supabase_not_configured");
  }

  const { data: existingInvite } = await supabase
    .from("workspace_invites")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle<{ id: string }>();

  if (existingInvite) {
    throw new Error("invite_already_exists");
  }

  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      email: normalizedEmail,
      role: input.role,
      token: randomUUID(),
      status: "pending",
      invited_by: viewer.user.id
    })
    .select("id, workspace_id, email, role, status, created_at")
    .maybeSingle<WorkspaceInviteRow>();

  if (error || !data) {
    throw new Error("invite_create_failed");
  }

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    email: data.email,
    role: data.role,
    status: data.status,
    createdAt: data.created_at
  };
}

function generateInviteCode(prefix: string) {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}

export async function createWorkspaceInviteCodes(input: {
  workspaceId: string;
  role: WorkspaceRole;
  quantity: number;
  maxUses: number;
}): Promise<WorkspaceInviteCodeRecord[]> {
  const viewer = await getCurrentViewer();
  const quantity = Math.max(1, Math.min(20, input.quantity));
  const maxUses = Math.max(1, Math.min(100, input.maxUses));

  if (viewer.mode === "demo") {
    const store = await readLocalDataStore();
    const workspace = store.workspaces.find((item) => item.id === input.workspaceId);

    if (!workspace) {
      throw new Error("workspace_not_found");
    }

    const createdAt = new Date().toISOString();
    const createdCodes: WorkspaceInviteCodeRecord[] = Array.from({ length: quantity }, () => ({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      code: generateInviteCode(workspace.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "INVITE"),
      role: input.role,
      status: "active",
      maxUses,
      usedCount: 0,
      createdAt
    }));

    await updateLocalDataStore((current) => ({
      ...current,
      workspaceInviteCodes: [
        ...current.workspaceInviteCodes,
        ...createdCodes.map((code) => ({
          ...code,
          createdBy: viewer.user.id
        }))
      ]
    }));

    return createdCodes;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("supabase_not_configured");
  }

  const workspace = await getWorkspaceById(input.workspaceId);

  if (!workspace) {
    throw new Error("workspace_not_found");
  }

  const rows = Array.from({ length: quantity }, () => ({
    workspace_id: input.workspaceId,
    code: generateInviteCode(workspace.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "INVITE"),
    role: input.role,
    status: "active",
    max_uses: maxUses,
    used_count: 0,
    created_by: viewer.user.id
  }));

  const { data, error } = await supabase
    .from("workspace_invite_codes")
    .insert(rows)
    .select("id, workspace_id, code, role, status, max_uses, used_count, created_at")
    .returns<WorkspaceInviteCodeRow[]>();

  if (error || !data) {
    throw new Error("invite_code_create_failed");
  }

  return data.map((code) => ({
    id: code.id,
    workspaceId: code.workspace_id,
    code: code.code,
    role: code.role,
    status: code.status,
    maxUses: code.max_uses,
    usedCount: code.used_count,
    createdAt: code.created_at
  }));
}

export async function registerWithInviteCode(input: {
  code: string;
  email: string;
  displayName: string;
  password: string;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedCode = input.code.trim().toUpperCase();

  if (!normalizedCode || !normalizedEmail || !input.password.trim()) {
    throw new Error("registration_fields_required");
  }

  const supabase = getSupabaseClient();
  const supabaseServer = getSupabaseServerClient();

  if (!supabase || !supabaseServer) {
    const store = await readLocalDataStore();
    const inviteCode = store.workspaceInviteCodes.find(
      (item) =>
        item.code.toUpperCase() === normalizedCode &&
        item.status === "active" &&
        item.usedCount < item.maxUses
    );

    if (!inviteCode) {
      throw new Error("invite_code_invalid");
    }

    if (store.authAccounts.some((account) => account.email.toLowerCase() === normalizedEmail)) {
      throw new Error("email_already_registered");
    }

    const userId = randomUUID();

    await updateLocalDataStore((current) => ({
      ...current,
      profiles: [
        ...current.profiles,
        {
          id: userId,
          email: normalizedEmail,
          displayName: input.displayName.trim() || normalizedEmail.split("@")[0],
          status: "active",
          passwordSetupRequired: false
        }
      ],
      authAccounts: [
        ...current.authAccounts,
        {
          userId,
          email: normalizedEmail,
          password: input.password,
          passwordSetupRequired: false
        }
      ],
      workspaceMembers: [
        ...current.workspaceMembers,
        {
          id: randomUUID(),
          workspaceId: inviteCode.workspaceId,
          userId,
          role: inviteCode.role,
          status: "active",
          joinedAt: new Date().toISOString()
        }
      ],
      workspaceInviteCodes: current.workspaceInviteCodes.map((item) => {
        if (item.id !== inviteCode.id) {
          return item;
        }

        const usedCount = item.usedCount + 1;
        return {
          ...item,
          usedCount,
          status: usedCount >= item.maxUses ? "used-up" : item.status
        };
      })
    }));

    const workspaceSlug = store.workspaces.find((workspace) => workspace.id === inviteCode.workspaceId)?.slug ?? null;

    return {
      mode: "demo" as const,
      userId,
      workspaceId: inviteCode.workspaceId,
      workspaceSlug
    };
  }

  const { data: inviteCode, error: inviteCodeError } = await supabaseServer
    .from("workspace_invite_codes")
    .select("id, workspace_id, code, role, status, max_uses, used_count, created_at")
    .eq("code", normalizedCode)
    .eq("status", "active")
    .maybeSingle<WorkspaceInviteCodeRow>();

  if (inviteCodeError || !inviteCode || inviteCode.used_count >= inviteCode.max_uses) {
    throw new Error("invite_code_invalid");
  }

  const { data: workspace } = await supabaseServer
    .from("workspaces")
    .select("id, slug")
    .eq("id", inviteCode.workspace_id)
    .maybeSingle<{ id: string; slug: string }>();

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: input.password,
    options: {
      data: {
        display_name: input.displayName.trim()
      }
    }
  });

  if (signUpError || !authData.user) {
    throw new Error(signUpError?.message ?? "registration_failed");
  }

  await bootstrapSupabaseProfile({
    id: authData.user.id,
    email: normalizedEmail,
    displayName: input.displayName
  });

  const { error: memberError } = await supabaseServer.from("workspace_members").insert({
    workspace_id: inviteCode.workspace_id,
    user_id: authData.user.id,
    role: inviteCode.role,
    status: "active",
    joined_at: new Date().toISOString()
  });

  if (memberError) {
    throw new Error("workspace_join_failed");
  }

  const nextUsedCount = inviteCode.used_count + 1;
  const { error: codeUpdateError } = await supabaseServer
    .from("workspace_invite_codes")
    .update({
      used_count: nextUsedCount,
      status: nextUsedCount >= inviteCode.max_uses ? "used-up" : "active"
    })
    .eq("id", inviteCode.id);

  if (codeUpdateError) {
    throw new Error("invite_code_update_failed");
  }

  return {
    mode: "supabase" as const,
    userId: authData.user.id,
    workspaceId: inviteCode.workspace_id,
    workspaceSlug: workspace?.slug ?? null,
    accessToken: authData.session?.access_token,
    refreshToken: authData.session?.refresh_token,
    needsEmailConfirm: !authData.session
  };
}

export async function listPlatformUsers(): Promise<PlatformUserRecord[]> {
  const viewer = await getCurrentViewer();

  if (viewer.mode === "demo") {
    const store = await readLocalDataStore();

    return store.profiles.map((profile) => {
      const memberships = store.workspaceMembers.filter((member) => member.userId === profile.id);
      const workspaceNames = memberships
        .map((member) => store.workspaces.find((workspace) => workspace.id === member.workspaceId)?.name)
        .filter((name): name is string => Boolean(name));

      return {
        id: profile.id,
        displayName: profile.displayName,
        email: profile.email,
        status: profile.status ?? (memberships.some((member) => member.status === "disabled") ? "disabled" : "active"),
        isPlatformAdmin: profile.id === DEMO_USERS.super_admin.id,
        workspaceCount: workspaceNames.length,
        workspaceNames
      };
    });
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const [{ data: profiles }, { data: admins }, { data: members }, { data: workspaces }] = await Promise.all([
    supabase.from("profiles").select("id, email, display_name, status").returns<Array<{ id: string; email: string | null; display_name: string; status: string }>>(),
    supabase.from("platform_admins").select("user_id").returns<Array<{ user_id: string }>>(),
    supabase.from("workspace_members").select("user_id, workspace_id, status").returns<Array<{ user_id: string; workspace_id: string; status: string }>>(),
    supabase.from("workspaces").select("id, name").returns<Array<{ id: string; name: string }>>()
  ]);

  const adminSet = new Set((admins ?? []).map((admin) => admin.user_id));
  const workspaceMap = new Map((workspaces ?? []).map((workspace) => [workspace.id, workspace.name]));

  return (profiles ?? []).map((profile) => {
    const memberships = (members ?? []).filter((member) => member.user_id === profile.id);
    const workspaceNames = memberships
      .map((member) => workspaceMap.get(member.workspace_id))
      .filter((name): name is string => Boolean(name));

    return {
      id: profile.id,
      displayName: profile.display_name,
      email: profile.email ?? undefined,
      status: profile.status,
      isPlatformAdmin: adminSet.has(profile.id),
      workspaceCount: workspaceNames.length,
      workspaceNames
    };
  });
}

export async function listPlatformWorkspaces(): Promise<PlatformWorkspaceRecord[]> {
  const viewer = await getCurrentViewer();

  if (viewer.mode === "demo") {
    const store = await readLocalDataStore();
    return store.workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      status: workspace.status ?? "active",
      planType: workspace.planType,
      memberCount: store.workspaceMembers.filter((member) => member.workspaceId === workspace.id).length
    }));
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const [{ data: workspaces }, { data: members }] = await Promise.all([
    supabase.from("workspaces").select("id, name, slug, status, plan_type").returns<Array<{ id: string; name: string; slug: string; status: string | null; plan_type: string | null }>>(),
    supabase.from("workspace_members").select("workspace_id").returns<Array<{ workspace_id: string }>>()
  ]);

  return (workspaces ?? []).map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    status: workspace.status ?? "active",
    planType: workspace.plan_type ?? undefined,
    memberCount: (members ?? []).filter((member) => member.workspace_id === workspace.id).length
  }));
}

export async function getWorkspaceById(id: string) {
  const viewer = await getCurrentViewer();

  if (viewer.mode === "demo") {
    const store = await readLocalDataStore();
    return store.workspaces.find((workspace) => workspace.id === id) ?? null;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("workspaces")
    .select("id, name, slug, plan_type, status")
    .eq("id", id)
    .maybeSingle<WorkspaceRow>();

  return data ? mapWorkspaceRow(data) : null;
}

export async function updateWorkspace(input: {
  workspaceId: string;
  name?: string;
  slug?: string;
  planType?: string;
  status?: string;
}) {
  const viewer = await getCurrentViewer();

  if (input.workspaceId.trim().length === 0) {
    throw new Error("workspace_required");
  }

  if (input.name && input.name.trim().length === 0) {
    throw new Error("workspace_name_required");
  }

  if (viewer.mode === "demo") {
    const store = await readLocalDataStore();
    const workspace = store.workspaces.find((item) => item.id === input.workspaceId);

    if (!workspace) {
      throw new Error("workspace_not_found");
    }

    await updateLocalDataStore((current) => ({
      ...current,
      workspaces: current.workspaces.map((item) =>
        item.id !== input.workspaceId
          ? item
          : {
              ...item,
              name: input.name?.trim() || item.name,
              slug: input.slug?.trim() || item.slug,
              planType: input.planType?.trim() || item.planType,
              status: input.status?.trim() || item.status
            }
      )
    }));

    const nextStore = await readLocalDataStore();
    return nextStore.workspaces.find((item) => item.id === input.workspaceId) ?? null;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("supabase_not_configured");
  }

  const payload: Record<string, string> = {};

  if (input.name) payload.name = input.name.trim();
  if (input.slug) payload.slug = input.slug.trim();
  if (input.planType) payload.plan_type = input.planType.trim();
  if (input.status) payload.status = input.status.trim();

  const { data, error } = await supabase
    .from("workspaces")
    .update(payload)
    .eq("id", input.workspaceId)
    .select("id, name, slug, plan_type, status")
    .maybeSingle<WorkspaceRow>();

  if (error || !data) {
    throw new Error("workspace_update_failed");
  }

  return mapWorkspaceRow(data);
}

export async function bootstrapSupabaseProfile(input: SupabaseAuthProfileInput) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("supabase_not_configured");
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: input.id,
        email: input.email ?? null,
        display_name: input.displayName?.trim() || input.email?.split("@")[0] || "New User",
        avatar_url: input.avatarUrl ?? null,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "id"
      }
    )
    .select("id, email, display_name, avatar_url, status")
    .maybeSingle<{ id: string; email: string | null; display_name: string; avatar_url: string | null; status: string }>();

  if (error || !data) {
    throw new Error("profile_bootstrap_failed");
  }

  return data;
}

export async function reconcilePendingInvitesForUser(input: {
  userId: string;
  email?: string | null;
}) {
  const normalizedEmail = input.email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return [];
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("supabase_not_configured");
  }

  const { data: pendingInvites, error: inviteError } = await supabase
    .from("workspace_invites")
    .select("id, workspace_id, email, role, status, created_at")
    .eq("email", normalizedEmail)
    .eq("status", "pending")
    .returns<WorkspaceInviteRow[]>();

  if (inviteError || !pendingInvites || pendingInvites.length === 0) {
    return [];
  }

  for (const invite of pendingInvites) {
    const { data: existingMembership } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", invite.workspace_id)
      .eq("user_id", input.userId)
      .maybeSingle<{ id: string }>();

    if (!existingMembership) {
      const { error: memberError } = await supabase.from("workspace_members").insert({
        workspace_id: invite.workspace_id,
        user_id: input.userId,
        role: invite.role,
        status: "active",
        joined_at: new Date().toISOString()
      });

      if (memberError) {
        throw new Error("invite_membership_create_failed");
      }
    }

    const { error: inviteUpdateError } = await supabase
      .from("workspace_invites")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString()
      })
      .eq("id", invite.id);

    if (inviteUpdateError) {
      throw new Error("invite_accept_failed");
    }
  }

  return pendingInvites;
}

export async function setPlatformUserStatus(input: {
  userId: string;
  status: "active" | "disabled";
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("supabase_not_configured");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      status: input.status,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.userId)
    .select("id, email, display_name, status")
    .maybeSingle<{ id: string; email: string | null; display_name: string; status: string }>();

  if (error || !data) {
    throw new Error("user_status_update_failed");
  }

  return data;
}

export async function setDemoUserStatus(input: {
  userId: string;
  status: "active" | "disabled";
}) {
  await updateLocalDataStore((store) => {
    const nextProfiles = store.profiles.map((profile) => {
      if (profile.id !== input.userId) {
        return profile;
      }

      return {
        ...profile,
        status: input.status
      };
    });

    const nextMembers = store.workspaceMembers.map((member) => {
      if (member.userId !== input.userId) {
        return member;
      }

      return {
        ...member,
        status: input.status
      };
    });

    return {
      ...store,
      profiles: nextProfiles,
      workspaceMembers: nextMembers
    };
  });

  const store = await readLocalDataStore();
  const profile = store.profiles.find((item) => item.id === input.userId);

  if (!profile) {
    throw new Error("user_not_found");
  }

  return {
    id: profile.id,
    email: profile.email ?? null,
    display_name: profile.displayName,
    status: input.status
  };
}

export async function changePassword(input: {
  userId: string;
  currentPassword?: string;
  nextPassword: string;
}) {
  if (!input.nextPassword.trim()) {
    throw new Error("next_password_required");
  }

  const supabase = getSupabaseClient();
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(sessionCookieNames.accessToken)?.value;
  const refreshToken = cookieStore.get(sessionCookieNames.refreshToken)?.value;

  if (supabase && accessToken && refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    if (sessionError) {
      throw new Error(sessionError.message);
    }

    const { error } = await supabase.auth.updateUser({
      password: input.nextPassword
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      mode: "supabase" as const
    };
  }

  const store = await readLocalDataStore();
  const account = store.authAccounts.find((item) => item.userId === input.userId);

  if (!account) {
    throw new Error("account_not_found");
  }

  if (input.currentPassword && account.password !== input.currentPassword) {
    throw new Error("current_password_invalid");
  }

  await updateLocalDataStore((current) => ({
    ...current,
    authAccounts: current.authAccounts.map((item) =>
      item.userId !== input.userId
        ? item
        : {
            ...item,
            password: input.nextPassword,
            passwordSetupRequired: false
          }
    ),
    profiles: current.profiles.map((profile) =>
      profile.id !== input.userId
        ? profile
        : {
            ...profile,
            passwordSetupRequired: false
          }
    )
  }));

  return {
    mode: "demo" as const
  };
}

export async function getLoginMode() {
  const requiredEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
  ] as const;
  const missingEnv = requiredEnv.filter((key) => !process.env[key]);
  const supabasePublicClient = getSupabaseClient();
  const supabaseServerClient = getSupabaseServerClient();

  return {
    supportsSupabaseLogin: Boolean(supabasePublicClient && supabaseServerClient && missingEnv.length === 0),
    missingEnv,
    demoAccounts: [
      {
        role: "super_admin" as const,
        label: "超级管理员",
        email: DEMO_USERS.super_admin.email ?? ""
      },
      {
        role: "org_admin" as const,
        label: "组织管理员",
        email: DEMO_USERS.org_admin.email ?? ""
      },
      {
        role: "operator" as const,
        label: "内容操盘手",
        email: DEMO_USERS.operator.email ?? ""
      },
      {
        role: "approver" as const,
        label: "审核者",
        email: DEMO_USERS.approver.email ?? ""
      }
    ]
  };
}

export async function getWorkspaceBySlug(slug: string) {
  const viewer = await getCurrentViewer();

  if (viewer.mode === "demo") {
    const store = await readLocalDataStore();
    return store.workspaces.find((workspace) => workspace.slug === slug) ?? null;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase.from("workspaces").select("id, name, slug, plan_type, status").eq("slug", slug).maybeSingle<WorkspaceRow>();
  return data ? mapWorkspaceRow(data) : null;
}
