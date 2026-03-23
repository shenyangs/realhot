import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { generatePackPreview } from "@/lib/services/generation-service";

export async function GET(request: NextRequest) {
  const access = await requireApiAccess(request, {
    requireWorkspace: true
  });

  if (!access.ok) {
    return access.response;
  }

  const packId = request.nextUrl.searchParams.get("packId") ?? "pack-1";

  try {
    const preview = await generatePackPreview(packId);
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown generation error"
      },
      {
        status: 400
      }
    );
  }
}
