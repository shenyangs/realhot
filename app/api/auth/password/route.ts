import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { changePassword } from "@/lib/auth/repository";

export async function POST(request: NextRequest) {
  const access = await requireApiAccess(request);

  if (!access.ok) {
    return access.response;
  }

  const { viewer } = access;

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
