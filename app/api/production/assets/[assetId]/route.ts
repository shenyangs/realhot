import { NextRequest, NextResponse } from "next/server";
import { requireApiViewer } from "@/lib/auth";
import { getProductionAssetById, updateProductionAsset } from "@/lib/services/production-jobs";

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{
      assetId: string;
    }>;
  }
) {
  const auth = await requireApiViewer({
    allowedRoles: ["org_admin", "approver"]
  });

  if (!auth.ok) {
    return auth.response;
  }

  const { assetId } = await context.params;
  const current = await getProductionAssetById(assetId);

  if (!current) {
    return NextResponse.json({ ok: false, error: "asset_not_found" }, { status: 404 });
  }

  if (!auth.viewer.isPlatformAdmin && auth.viewer.currentWorkspace?.id !== current.workspaceId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    previewUrl?: string;
    textContent?: string;
    jsonContent?: string;
    status?: "ready" | "failed";
    errorMessage?: string;
  };

  const updated = await updateProductionAsset(assetId, {
    name: body.name?.trim() || undefined,
    previewUrl: body.previewUrl?.trim() || undefined,
    textContent: body.textContent?.trim() || undefined,
    jsonContent: body.jsonContent?.trim() || undefined,
    status: body.status,
    errorMessage: body.errorMessage?.trim() || undefined
  });

  if (!updated) {
    return NextResponse.json({ ok: false, error: "asset_update_failed" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    asset: updated
  });
}
