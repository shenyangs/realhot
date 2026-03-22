import { NextResponse } from "next/server";
import { deletePublishJob } from "@/lib/data";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const removed = await deletePublishJob(jobId);

    return NextResponse.json({
      ok: true,
      removed
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Delete publish job failed"
      },
      {
        status: 500
      }
    );
  }
}
