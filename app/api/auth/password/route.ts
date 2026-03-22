import { NextRequest, NextResponse } from "next/server";
import { changePassword } from "@/lib/auth/repository";
import { getCurrentViewer } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const viewer = await getCurrentViewer();

  if (!viewer.isAuthenticated) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthenticated"
      },
      {
        status: 401
      }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    currentPassword?: string;
    nextPassword?: string;
  };

  try {
    await changePassword({
      userId: viewer.user.id,
      currentPassword: body.currentPassword,
      nextPassword: body.nextPassword ?? ""
    });

    return NextResponse.json({
      ok: true
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "password_change_failed"
      },
      {
        status: 400
      }
    );
  }
}
