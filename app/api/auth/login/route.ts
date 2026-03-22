import { NextRequest, NextResponse } from "next/server";
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
  const supabase = getSupabaseClient();
  const supabaseServer = getSupabaseServerClient();

  if (!supabase || !supabaseServer) {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };

    if (!body.email || !body.password) {
      return NextResponse.json(
        {
          ok: false,
          error: "email_and_password_required"
        },
        {
          status: 400
        }
      );
    }

    try {
      const result = await loginWithLocalAccount({
        email: body.email,
        password: body.password
      });
      const response = NextResponse.json({
        ok: true,
        hasWorkspace: Boolean(result.workspaceSlug),
        requiresWorkspaceSelection: result.requiresWorkspaceSelection
      });

      response.cookies.set(sessionCookieNames.userId, result.userId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
      response.cookies.delete(sessionCookieNames.demoRole);

      if (result.workspaceSlug) {
        response.cookies.set(sessionCookieNames.workspaceSlug, result.workspaceSlug, {
          httpOnly: true,
          sameSite: "lax",
          path: "/"
        });
      } else {
        response.cookies.delete(sessionCookieNames.workspaceSlug);
      }

      return response;
    } catch (error) {
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

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };

  if (!body.email || !body.password) {
    return NextResponse.json(
      {
        ok: false,
        error: "email_and_password_required"
      },
      {
        status: 400
      }
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password
  });

  if (error || !data.session || !data.user) {
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

  response.cookies.set(sessionCookieNames.accessToken, data.session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  response.cookies.set(sessionCookieNames.refreshToken, data.session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  response.cookies.set(sessionCookieNames.userId, data.user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  response.cookies.delete(sessionCookieNames.demoRole);

  if (workspaceCount === 1 && workspaceRecord?.slug) {
    response.cookies.set(sessionCookieNames.workspaceSlug, workspaceRecord.slug, {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
  } else {
    response.cookies.delete(sessionCookieNames.workspaceSlug);
  }

  return response;
}
