import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canExportContent } from "@/lib/auth/permissions";
import { getContentPackExportBundle } from "@/lib/services/export-pack";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  const access = await requireApiAccess(request, {
    authorize: canExportContent,
    requireWorkspace: true
  });

  if (!access.ok) {
    return access.response;
  }

  const { viewer } = access;
  const { packId } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "markdown";
  const bundle = await getContentPackExportBundle(packId);

  if (!bundle) {
    return NextResponse.json(
      {
        error: "Content pack not found"
      },
      {
        status: 404
      }
    );
  }

  const hotspotTitle = bundle.hotspot ? bundle.hotspot.title : bundle.pack.hotspotId;

  await writeAuditLog({
    workspaceId: viewer.currentWorkspace?.id,
    actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
    actorDisplayName: viewer.user.displayName,
    actorEmail: viewer.user.email,
    entityType: "hotspot_pack",
    entityId: packId,
    action: "content.pack_exported",
    payload: {
      format,
      hotspotTitle,
      variantTitles: bundle.pack.variants.map((variant) => variant.title)
    }
  });

  if (format === "json") {
    return NextResponse.json({
      pack: bundle.pack,
      hotspot: bundle.hotspot,
      brandName: bundle.brandName
    });
  }

  return new NextResponse(bundle.markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${bundle.filename}"`
    }
  });
}
