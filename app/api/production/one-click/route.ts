import { NextRequest, NextResponse } from "next/server";
import { requireApiViewer } from "@/lib/auth";
import { getHotspotPack } from "@/lib/data";
import { createProductionJob, listProductionJobsByPack } from "@/lib/services/production-jobs";

export async function POST(request: NextRequest) {
  const auth = await requireApiViewer({
    allowedRoles: ["org_admin", "approver"]
  });

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    packId?: string;
  };

  const packId = body.packId?.trim();

  if (!packId) {
    return NextResponse.json({ ok: false, error: "pack_id_required" }, { status: 400 });
  }

  const pack = await getHotspotPack(packId);

  if (!pack) {
    return NextResponse.json({ ok: false, error: "pack_not_found" }, { status: 404 });
  }

  if (pack.status !== "approved") {
    return NextResponse.json({ ok: false, error: "pack_not_approved" }, { status: 400 });
  }

  const workspaceId = auth.viewer.currentWorkspace?.id ?? pack.workspaceId;

  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspace_context_required" }, { status: 400 });
  }

  const existing = (await listProductionJobsByPack(pack.id)).find(
    (job) => job.workspaceId === workspaceId && (job.status === "queued" || job.status === "running")
  );
  const job = existing
    ? existing
    : await createProductionJob({
        workspaceId,
        packId: pack.id,
        createdBy: auth.viewer.user.id
      });

  return NextResponse.json({
    ok: true,
    job,
    studioUrl: `/production-studio/${pack.id}?job=${job.id}`
  });
}
