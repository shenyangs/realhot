import { NextRequest, NextResponse } from "next/server";
import { getHotspotPack } from "@/lib/data";
import { getLatestProductionJobForPack, updateProductionDraft } from "@/lib/services/production-studio";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  const { packId } = await params;
  const [pack, job] = await Promise.all([getHotspotPack(packId), getLatestProductionJobForPack(packId)]);

  return NextResponse.json({
    ok: true,
    pack,
    job
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  try {
    const { packId } = await params;
    const payload = (await request.json().catch(() => ({}))) as {
      articleTitle?: string;
      articleBody?: string;
      videoScript?: string;
      voiceoverText?: string;
      subtitleSrt?: string;
    };

    const job = await updateProductionDraft(packId, {
      articleTitle: payload.articleTitle?.trim(),
      articleBody: payload.articleBody?.trim(),
      videoScript: payload.videoScript?.trim(),
      voiceoverText: payload.voiceoverText?.trim(),
      subtitleSrt: payload.subtitleSrt?.trim()
    });

    if (!job) {
      return NextResponse.json(
        {
          ok: false,
          error: "请先执行一键制作"
        },
        {
          status: 404
        }
      );
    }

    return NextResponse.json({
      ok: true,
      job
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "保存失败"
      },
      {
        status: 500
      }
    );
  }
}
