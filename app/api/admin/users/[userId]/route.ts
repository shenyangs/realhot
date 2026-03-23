import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { setDemoUserStatus, setPlatformUserStatus } from "@/lib/auth/repository";

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      userId: string;
    }>;
  }
) {
  const access = await requireApiAccess(request, {
    authorize: canAccessAdmin
  });

  if (!access.ok) {
    return access.response;
  }

  const { viewer } = access;

  const { userId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: "active" | "disabled";
  };

  if (!body.status || !["active", "disabled"].includes(body.status)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_status"
      },
      {
        status: 400
      }
    );
  }

  if (userId === viewer.user.id && body.status === "disabled") {
    return NextResponse.json(
      {
        ok: false,
        error: "cannot_disable_self"
      },
      {
        status: 400
      }
    );
  }

  try {
    const result =
      viewer.mode === "demo"
        ? await setDemoUserStatus({
            userId,
            status: body.status
          })
        : await setPlatformUserStatus({
            userId,
            status: body.status
          });

    return NextResponse.json({
      ok: true,
      user: result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "user_status_update_failed"
      },
      {
        status: 400
      }
    );
  }
}
