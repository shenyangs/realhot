import { NextRequest, NextResponse } from "next/server";
import { generateContentPackForHotspot } from "@/lib/services/content-pack-generator";

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

  return "Content pack generation failed";
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      hotspotId?: string;
    };

    if (!payload.hotspotId) {
      return NextResponse.json(
        {
          error: "hotspotId is required"
        },
        {
          status: 400
        }
      );
    }

    const result = await generateContentPackForHotspot(payload.hotspotId);

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
