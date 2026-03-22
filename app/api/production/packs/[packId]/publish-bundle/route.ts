import { NextRequest, NextResponse } from "next/server";
import { requireApiViewer } from "@/lib/auth";
import { getHotspotPack, queuePublishJobs } from "@/lib/data";
import { buildProductionPublishBundle } from "@/lib/services/production-jobs";

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      packId: string;
    }>;
  }
) {
  const auth = await requireApiViewer({
    allowedRoles: ["org_admin", "approver"]
  });

  if (!auth.ok) {
    return auth.response;
  }

  const { packId } = await context.params;
  const pack = await getHotspotPack(packId);

  if (!pack) {
    return NextResponse.json({ ok: false, error: "pack_not_found" }, { status: 404 });
  }

  const workspaceId = auth.viewer.currentWorkspace?.id ?? pack.workspaceId;

  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspace_context_required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    queue?: boolean;
    scheduledAt?: string;
    forceQueue?: boolean;
  };

  const bundle = await buildProductionPublishBundle({
    packId,
    workspaceId
  });

  if (body.queue && !body.forceQueue && !bundle.qualityReport.passed) {
    return NextResponse.json(
      {
        ok: false,
        error: "quality_gate_blocked",
        qualityReport: bundle.qualityReport
      },
      {
        status: 400
      }
    );
  }

  let queued = null;

  if (body.queue) {
    queued = await queuePublishJobs(packId, {
      scheduledAt: body.scheduledAt,
      queueSource: "manual"
    });
  }

  return NextResponse.json({
    ok: true,
    bundle: bundle.bundle,
    qualityReport: bundle.qualityReport,
    queued
  });
}
