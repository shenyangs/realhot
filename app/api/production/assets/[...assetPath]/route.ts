import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import {
  getProductionAssetContentType,
  readProductionAssetBuffer
} from "@/lib/services/production-assets";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetPath: string[] }> }
) {
  const access = await requireApiAccess(request, {
    requireWorkspace: true
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const { assetPath } = await params;
    const relativePath = assetPath.join("/");
    const buffer = await readProductionAssetBuffer(relativePath);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": getProductionAssetContentType(relativePath),
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "asset_not_found"
      },
      {
        status: 404
      }
    );
  }
}
