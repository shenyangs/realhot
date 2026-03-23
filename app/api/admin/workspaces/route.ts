import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { createWorkspace } from "@/lib/auth/repository";

export async function POST(request: NextRequest) {
  const access = await requireApiAccess(request, {
    authorize: canAccessAdmin
  });

  if (!access.ok) {
    return access.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    slug?: string;
    planType?: string;
    status?: string;
  };

  try {
    const workspace = await createWorkspace({
      name: body.name ?? "",
      slug: body.slug ?? "",
      planType: body.planType,
      status: body.status
    });

    return NextResponse.json({
      ok: true,
      workspace
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "workspace_create_failed"
      },
      { status: 400 }
    );
  }
}
