import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { getVercelUsageSummary } from "@/lib/services/vercel-usage";

export async function GET(request: NextRequest) {
  const access = await requireApiAccess(request, {
    authorize: canAccessAdmin
  });

  if (!access.ok) {
    return access.response;
  }

  const rawDays = Number(request.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(rawDays) ? rawDays : 30;

  try {
    const summary = await getVercelUsageSummary({
      days
    });

    return NextResponse.json({
      ok: true,
      summary
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "vercel_usage_load_failed"
      },
      {
        status: 500
      }
    );
  }
}
