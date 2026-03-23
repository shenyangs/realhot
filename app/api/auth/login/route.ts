import { NextRequest, NextResponse } from "next/server";
import { enforceSameOrigin } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { APP_SESSION_TTL_SECONDS, createAppSessionToken, getSessionCookieOptions } from "@/lib/auth/local-session";
import { bootstrapSupabaseProfile, loginWithLocalAccount, reconcilePendingInvitesForUser } from "@/lib/auth/repository";
import { getSupabaseClient, getSupabaseServerClient } from "@/lib/supabase/client";
import { sessionCookieNames } from "@/lib/auth/session";

interface MembershipWorkspaceRow {
  workspaces:
    | {
        slug: string;
      }
    | {
        slug: string;
      }[]
    | null;
}

export async function POST(request: NextRequest) {
  const originError = enforceSameOrigin(request);

  if (originError) {
    return originError;
  }

  const body = (await request.json().catch(() => ({}))) as {
    identifier?: string;
    email?: string;
    password?: string;
  };
  const identifier = body.identifier ?? body.email;
  const supabase = getSupabaseClient();
  const supabaseServer = getSupabaseServerClient();
  if (!identifier || !body.password) {
    return NextResponse.json(
      {
        ok: false,
        error: "identifier_and_password_required"
      },
      {
        status: 400
      }
    );
  }

  if (!supabase || !supabaseServer) {
    try {
      const result = await loginWithLocalAccount({
        identifier,
        password: body.password
      });
      await writeAuditLog({
        actorUserId: result.userId,
        actorDisplayName: identifier,
        entityType: "auth_session",
        entityId: result.userId,
        action: "auth.login_success",
        payload: {
          identifier,
          mode: "local"
        }
      });
      const response = NextResponse.json({
        ok: true,
        hasWorkspace: Boolean(result.workspaceSlug),
        requiresWorkspaceSelection: result.requiresWorkspaceSelection
      });

      response.cookies.set(
        sessionCookieNames.appSession,
        await createAppSessionToken(result.userId),
        getSessionCookieOptions(APP_SESSION_TTL_SECONDS)
      );
      response.cookies.delete(sessionCookieNames.accessToken);
      response.cookies.delete(sessionCookieNames.refreshToken);
      response.cookies.delete(sessionCookieNames.legacyUserId);
      response.cookies.delete(sessionCookieNames.demoRole);
      response.cookies.delete(sessionCookieNames.trialAccess);

      if (result.workspaceSlug) {
        response.cookies.set(
          sessionCookieNames.workspaceSlug,
          result.workspaceSlug,
          getSessionCookieOptions(APP_SESSION_TTL_SECONDS)
        );
      } else {
        response.cookies.delete(sessionCookieNames.workspaceSlug);
      }

      return response;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "invalid_credentials") {
        return NextResponse.json(
          {
            ok: false,
            error: error instanceof Error ? error.message : "login_failed"
          },
          {
            status: 401
          }
        );
      }
    }

    await writeAuditLog({
      actorDisplayName: identifier,
      entityType: "auth_session",
      action: "auth.login_failed",
      payload: {
        identifier,
        mode: "local"
      }
    });

    return NextResponse.json(
      {
        ok: false,
        error: "invalid_credentials"
      },
      {
        status: 401
      }
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: identifier,
    password: body.password
  });

  if (error || !data.session || !data.user) {
    await writeAuditLog({
      actorDisplayName: identifier,
      entityType: "auth_session",
      action: "auth.login_failed",
      payload: {
        identifier,
        mode: "supabase"
      }
    });

    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "login_failed"
      },
      {
        status: 401
      }
    );
  }

  const profile = await bootstrapSupabaseProfile({
    id: data.user.id,
    email: data.user.email,
    displayName:
      typeof data.user.user_metadata?.display_name === "string"
        ? data.user.user_metadata.display_name
        : typeof data.user.user_metadata?.name === "string"
          ? data.user.user_metadata.name
          : undefined,
    avatarUrl:
      typeof data.user.user_metadata?.avatar_url === "string"
        ? data.user.user_metadata.avatar_url
        : undefined
  });

  if (profile.status === "disabled") {
    return NextResponse.json(
      {
        ok: false,
        error: "account_disabled"
      },
      {
        status: 403
      }
    );
  }

  await reconcilePendingInvitesForUser({
    userId: data.user.id,
    email: data.user.email
  });

  await writeAuditLog({
    actorUserId: data.user.id,
    actorDisplayName: profile.display_name,
    actorEmail: profile.email ?? undefined,
    entityType: "auth_session",
    entityId: data.user.id,
    action: "auth.login_success",
    payload: {
      identifier,
      mode: "supabase"
    }
  });

  const { data: memberships } = await supabaseServer
    .from("workspace_members")
    .select("workspaces(slug)")
    .eq("user_id", data.user.id)
    .eq("status", "active")
    .returns<MembershipWorkspaceRow[]>();

  const workspaceCount = memberships?.length ?? 0;
  const workspaceRecord = Array.isArray(memberships?.[0]?.workspaces)
    ? memberships?.[0]?.workspaces[0]
    : memberships?.[0]?.workspaces;

  const response = NextResponse.json({
    ok: true,
    hasWorkspace: Boolean(workspaceRecord?.slug),
    requiresWorkspaceSelection: workspaceCount > 1
  });
  const accessTokenMaxAge = Math.max(data.session.expires_in ?? 3600, 60);

  response.cookies.set(sessionCookieNames.accessToken, data.session.access_token, getSessionCookieOptions(accessTokenMaxAge));
  response.cookies.set(
    sessionCookieNames.refreshToken,
    data.session.refresh_token,
    getSessionCookieOptions(APP_SESSION_TTL_SECONDS)
  );
  response.cookies.set(
    sessionCookieNames.appSession,
    await createAppSessionToken(data.user.id),
    getSessionCookieOptions(APP_SESSION_TTL_SECONDS)
  );
  response.cookies.delete(sessionCookieNames.legacyUserId);
  response.cookies.delete(sessionCookieNames.demoRole);
  response.cookies.delete(sessionCookieNames.trialAccess);

  if (workspaceCount === 1 && workspaceRecord?.slug) {
    response.cookies.set(
      sessionCookieNames.workspaceSlug,
      workspaceRecord.slug,
      getSessionCookieOptions(APP_SESSION_TTL_SECONDS)
    );
  } else {
    response.cookies.delete(sessionCookieNames.workspaceSlug);
  }

  return response;
}
