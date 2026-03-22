import { NextRequest, NextResponse } from "next/server";
import { canExportContent, requireApiViewer } from "@/lib/auth";
import { clearQueuedPublishJobs } from "@/lib/data";

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiViewer({
      allowedRoles: ["org_admin", "approver"]
    });

    if (!auth.ok) {
      return auth.response;
    }

    if (!canExportContent(auth.viewer)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      packId?: string;
    };

    const result = await clearQueuedPublishJobs({
      packId: payload.packId?.trim() || undefined
    });

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Clear queue failed"
      },
      {
        status: 500
      }
    );
  }
}
