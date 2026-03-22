import { NextRequest, NextResponse } from "next/server";
import { setCurrentWorkspaceBySlug } from "@/lib/auth/repository";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    slug?: string;
  };

  if (!body.slug) {
    return NextResponse.json(
      {
        ok: false,
        error: "workspace_slug_required"
      },
      {
        status: 400
      }
    );
  }

  try {
    const workspace = await setCurrentWorkspaceBySlug(body.slug);

    return NextResponse.json({
      ok: true,
      workspace
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "workspace_switch_failed"
      },
      {
        status: 403
      }
    );
  }
}

