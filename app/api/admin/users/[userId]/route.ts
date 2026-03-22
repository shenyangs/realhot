import { NextRequest, NextResponse } from "next/server";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { getCurrentViewer } from "@/lib/auth/session";
import { setDemoUserStatus, setPlatformUserStatus } from "@/lib/auth/repository";

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      userId: string;
    }>;
  }
) {
  const viewer = await getCurrentViewer();

  if (!canAccessAdmin(viewer)) {
    return NextResponse.json(
      {
        ok: false,
        error: "forbidden"
      },
      {
        status: 403
      }
    );
  }

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
