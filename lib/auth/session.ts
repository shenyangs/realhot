import { cookies } from "next/headers";
import { DEMO_USERS } from "@/lib/auth/demo-data";
import { APP_SESSION_COOKIE_NAME, readAppSessionToken } from "@/lib/auth/local-session";
import { ViewerContext, ViewerMembership, ViewerWorkspace, WorkspaceRole } from "@/lib/auth/types";
import { readLocalDataStore } from "@/lib/data/local-store";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getSupabaseServerClient } from "@/lib/supabase/client";

const DEMO_ROLE_COOKIE = "brand_os_demo_role";
const LEGACY_USER_ID_COOKIE = "brand_os_user_id";
const WORKSPACE_SLUG_COOKIE = "brand_os_workspace_slug";
const ACCESS_TOKEN_COOKIE = "brand_os_access_token";
const REFRESH_TOKEN_COOKIE = "brand_os_refresh_token";
const TRIAL_ACCESS_COOKIE = "brand_os_trial_access";

interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  status: string;
}

interface PlatformAdminRow {
  user_id: string;
}

interface WorkspaceMembershipRow {
  role: WorkspaceRole;
  status: string;
  workspaces:
    | {
        id: string;
        name: string;
        slug: string;
        plan_type: string | null;
        status: string | null;
      }
    | {
        id: string;
        name: string;
        slug: string;
        plan_type: string | null;
        status: string | null;
      }[]
    | null;
}

function normalizeWorkspace(input: WorkspaceMembershipRow["workspaces"]): ViewerWorkspace | null {
  const workspace = Array.isArray(input) ? input[0] : input;

  if (!workspace) {
    return null;
  }

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    planType: workspace.plan_type ?? undefined,
    status: workspace.status ?? undefined
  };
}

async function buildLocalViewerFromUserId(userId: string, workspaceSlug?: string | null): Promise<ViewerContext | null> {
  const store = await readLocalDataStore();
  const profile = store.profiles.find((item) => item.id === userId);

  if (!profile || profile.status === "disabled") {
    return null;
  }

  const account = store.authAccounts.find((item) => item.userId === userId);
  const memberships = store.workspaceMembers
    .filter((member) => member.userId === userId)
    .map((member) => {
      const workspace = store.workspaces.find((item) => item.id === member.workspaceId);

      if (!workspace) {
        return null;
      }

      return {
        workspace,
        role: member.role,
        status: member.status
      };
    })
    .filter((member): member is ViewerMembership => member !== null && member.status !== "disabled");
  const matchedWorkspace = memberships.find((membership) => membership.workspace.slug === workspaceSlug)?.workspace;
  const currentWorkspace =
    matchedWorkspace ?? (memberships.length === 1 ? memberships[0]?.workspace ?? null : null);
  const currentMembership =
    currentWorkspace ? memberships.find((membership) => membership.workspace.id === currentWorkspace.id) ?? null : null;
  const isPlatformAdmin = userId === DEMO_USERS.super_admin.id;

  return {
    mode: "demo",
    isAuthenticated: true,
    isPlatformAdmin,
    platformRole: isPlatformAdmin ? "super_admin" : null,
    workspaceRole: currentMembership?.role ?? null,
    effectiveRole: isPlatformAdmin ? "super_admin" : currentMembership?.role ?? "guest",
    user: {
      ...profile,
      passwordSetupRequired: account?.passwordSetupRequired ?? false
    },
    currentWorkspace,
    memberships
  };
}

async function resolveViewerFromSupabase(userId: string, workspaceSlug?: string | null): Promise<ViewerContext | null> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  let profile: ProfileRow | null = null;
  let platformAdmin: PlatformAdminRow | null = null;
  let memberships: WorkspaceMembershipRow[] | null = null;

  try {
    [{ data: profile }, { data: platformAdmin }, { data: memberships }] = await Promise.all([
      supabase.from("profiles").select("id, email, display_name, avatar_url, status").eq("id", userId).maybeSingle<ProfileRow>(),
      supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle<PlatformAdminRow>(),
      supabase
        .from("workspace_members")
        .select("role, status, workspaces(id, name, slug, plan_type, status)")
        .eq("user_id", userId)
        .returns<WorkspaceMembershipRow[]>()
    ]);
  } catch (error) {
    console.error("[auth] Failed to resolve viewer from Supabase", error);
    return null;
  }

  if (!profile) {
    return null;
  }

  if (profile.status === "disabled") {
    return null;
  }

  const normalizedMemberships = (memberships ?? [])
    .map((membership) => {
      const workspace = normalizeWorkspace(membership.workspaces);

      if (!workspace) {
        return null;
      }

      return {
        workspace,
        role: membership.role,
        status: membership.status
      };
    })
    .filter((membership): membership is ViewerMembership => membership !== null && membership.status === "active");

  const currentMembership =
    normalizedMemberships.find((membership) => membership.workspace.slug === workspaceSlug) ??
    (normalizedMemberships.length === 1 ? normalizedMemberships[0] : null);

  if (platformAdmin) {
    return {
      mode: "supabase",
      isAuthenticated: true,
      isPlatformAdmin: true,
      platformRole: "super_admin",
      workspaceRole: currentMembership?.role ?? null,
      effectiveRole: "super_admin",
      user: {
        id: profile.id,
        email: profile.email ?? undefined,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url ?? undefined
      },
      currentWorkspace: currentMembership?.workspace ?? null,
      memberships: normalizedMemberships
    };
  }

  if (!currentMembership) {
    return null;
  }

  return {
    mode: "supabase",
    isAuthenticated: true,
    isPlatformAdmin: false,
    platformRole: null,
    workspaceRole: currentMembership.role,
    effectiveRole: currentMembership.role,
    user: {
      id: profile.id,
      email: profile.email ?? undefined,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url ?? undefined
    },
    currentWorkspace: currentMembership.workspace,
    memberships: normalizedMemberships
  };
}

function buildGuestViewer(): ViewerContext {
  return {
    mode: "supabase",
    isAuthenticated: false,
    isPlatformAdmin: false,
    platformRole: null,
    workspaceRole: null,
    effectiveRole: "guest",
    user: {
      id: "guest",
      displayName: "未登录用户"
    },
    currentWorkspace: null,
    memberships: []
  };
}

function applyTrialViewerOverride(viewer: ViewerContext): ViewerContext {
  if (!viewer.isAuthenticated || !viewer.currentWorkspace || viewer.isPlatformAdmin) {
    return viewer;
  }

  return {
    ...viewer,
    workspaceRole: null,
    effectiveRole: "trial_guest"
  };
}

export async function getCurrentViewer(): Promise<ViewerContext> {
  const cookieStore = await cookies();
  const appSession = await readAppSessionToken(cookieStore.get(APP_SESSION_COOKIE_NAME)?.value);
  const workspaceSlug = cookieStore.get(WORKSPACE_SLUG_COOKIE)?.value;
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const isTrialAccess = cookieStore.get(TRIAL_ACCESS_COOKIE)?.value === "1";

  if (accessToken) {
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { data } = await supabase.auth.getUser(accessToken);

        if (data.user?.id) {
          const viewer = await resolveViewerFromSupabase(data.user.id, workspaceSlug);

          if (viewer) {
            return isTrialAccess ? applyTrialViewerOverride(viewer) : viewer;
          }
        }
      } catch (error) {
        console.error("[auth] Failed to read current Supabase user", error);
      }
    }
  }

  if (appSession?.userId) {
    const viewer = await resolveViewerFromSupabase(appSession.userId, workspaceSlug);

    if (viewer) {
      return isTrialAccess ? applyTrialViewerOverride(viewer) : viewer;
    }

    const localViewer = await buildLocalViewerFromUserId(appSession.userId, workspaceSlug);

    if (localViewer) {
      return isTrialAccess ? applyTrialViewerOverride(localViewer) : localViewer;
    }

    return buildGuestViewer();
  }

  return buildGuestViewer();
}

export async function getCurrentWorkspaceSlug(): Promise<string | null> {
  const viewer = await getCurrentViewer();
  return viewer.currentWorkspace?.slug ?? null;
}

export async function getCurrentUserId(): Promise<string> {
  const viewer = await getCurrentViewer();
  return viewer.user.id;
}

export const sessionCookieNames = {
  appSession: APP_SESSION_COOKIE_NAME,
  demoRole: DEMO_ROLE_COOKIE,
  legacyUserId: LEGACY_USER_ID_COOKIE,
  workspaceSlug: WORKSPACE_SLUG_COOKIE,
  accessToken: ACCESS_TOKEN_COOKIE,
  refreshToken: REFRESH_TOKEN_COOKIE,
  trialAccess: TRIAL_ACCESS_COOKIE
};
