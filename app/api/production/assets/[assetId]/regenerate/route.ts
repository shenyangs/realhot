import { NextRequest, NextResponse } from "next/server";
import { requireApiViewer } from "@/lib/auth";
import { getProductionAssetById, regenerateProductionAsset } from "@/lib/services/production-jobs";

export async function POST(
  _request: NextRequest,
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

  const result = await regenerateProductionAsset({
    assetId,
    requestedBy: auth.viewer.user.id
  }).catch((error) => ({
    error: error instanceof Error ? error.message : "asset_regenerate_failed"
  }));

  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    ...result
  });
}
