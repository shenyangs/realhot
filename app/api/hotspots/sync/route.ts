import { NextRequest, NextResponse } from "next/server";
import { syncHotspots } from "@/lib/services/hotspot-sync";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.HOTSPOT_SYNC_SECRET;

  if (!expected) {
    return true;
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerSecret = request.headers.get("x-sync-secret");

  return bearer === expected || headerSecret === expected;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "Unauthorized"
      },
      {
        status: 401
      }
    );
  }

  try {
    const result = await syncHotspots();

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Hotspot sync failed"
      },
      {
        status: 500
      }
    );
  }
}
