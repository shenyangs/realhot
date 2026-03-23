import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { getPrioritizedHotspots } from "@/lib/data";

export async function GET(request: NextRequest) {
  const access = await requireApiAccess(request, {
    requireWorkspace: true
  });

  if (!access.ok) {
    return access.response;
  }

  return NextResponse.json({
    hotspots: await getPrioritizedHotspots()
  });
}
