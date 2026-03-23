import { NextRequest, NextResponse } from "next/server";
import { buildHealthReport } from "@/lib/services/health-report";

export async function GET(request: NextRequest) {
  const probe = request.nextUrl.searchParams.get("probe") === "1";
  const report = await buildHealthReport(probe);

  return NextResponse.json(report, {
    status: report.status === "fail" ? 503 : 200
  });
}
