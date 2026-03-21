import { NextRequest, NextResponse } from "next/server";
import { getContentPackExportBundle } from "@/lib/services/export-pack";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
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
