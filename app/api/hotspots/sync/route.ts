import { NextRequest, NextResponse } from "next/server";
import { requireApiViewer } from "@/lib/auth";
import { syncHotspots } from "@/lib/services/hotspot-sync";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    const maybeDetails = (error as { details?: unknown }).details;
    const maybeHint = (error as { hint?: unknown }).hint;
    const parts = [maybeMessage, maybeDetails, maybeHint]
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return "Hotspot sync failed";
}

function hasValidSyncSecret(request: NextRequest): boolean {
  const expected = process.env.HOTSPOT_SYNC_SECRET;

  if (!expected) {
    return false;
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerSecret = request.headers.get("x-sync-secret");

  return bearer === expected || headerSecret === expected;
}

async function resolveAuthorizationError(request: NextRequest) {
  if (!process.env.HOTSPOT_SYNC_SECRET) {
    return null;
  }

  if (hasValidSyncSecret(request)) {
    return null;
  }

  const auth = await requireApiViewer();

  if (!auth.ok) {
    return auth.response;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const authError = await resolveAuthorizationError(request);

  if (authError) {
    return authError;
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
        error: getErrorMessage(error)
      },
      {
        status: 500
      }
    );
  }
}
