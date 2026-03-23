import { NextRequest, NextResponse } from "next/server";
import { requireApiViewer } from "@/lib/auth";
import { getHotspotPack } from "@/lib/data";
import { getProductionDraftByPack, saveProductionDraft } from "@/lib/services/production-jobs";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      packId: string;
    }>;
  }
) {
  const auth = await requireApiViewer();

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

  const draft = await getProductionDraftByPack(packId, workspaceId);

  return NextResponse.json({
    ok: true,
    draft
  });
}

export async function PATCH(
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
    title?: string;
    body?: string;
    subtitles?: string;
    coverAssetId?: string;
    videoAssetId?: string;
    voiceAssetId?: string;
  };

  const draft = await saveProductionDraft({
    workspaceId,
    packId,
    title: body.title?.trim() || pack.variants[0]?.title || pack.whyNow,
    body: body.body?.trim() || pack.variants[0]?.body || pack.whyUs,
    subtitles: body.subtitles?.trim() || "",
    coverAssetId: body.coverAssetId,
    videoAssetId: body.videoAssetId,
    voiceAssetId: body.voiceAssetId,
    updatedBy: auth.viewer.user.id
  });

  return NextResponse.json({
    ok: true,
    draft
  });
}
