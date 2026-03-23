import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canGenerateContent } from "@/lib/auth/permissions";
import { rewriteVariantDraft } from "@/lib/services/rewrite-assistant";

export async function POST(request: NextRequest) {
  const access = await requireApiAccess(request, {
    authorize: canGenerateContent,
    requireWorkspace: true
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const body = (await request.json()) as {
      title?: string;
      body?: string;
      angle?: string;
      platformLabel?: string;
      trackLabel?: string;
      whyNow?: string;
      whyUs?: string;
      reviewNote?: string;
      sourceTitle?: string;
      sourceExcerpt?: string;
      sourceUrl?: string;
      sourceFetchedAt?: string;
      brandName?: string;
      brandTone?: string[];
      redLines?: string[];
      userRequest?: string;
      mode?: "direct" | "suggest";
    };

    if (!body.title || !body.body || !body.userRequest || !body.platformLabel || !body.trackLabel) {
      return NextResponse.json(
        {
          error: "缺少必要的改稿参数"
        },
        {
          status: 400
        }
      );
    }

    const result = await rewriteVariantDraft({
      title: body.title,
      body: body.body,
      angle: body.angle ?? "",
      platformLabel: body.platformLabel,
      trackLabel: body.trackLabel,
      whyNow: body.whyNow ?? "",
      whyUs: body.whyUs ?? "",
      reviewNote: body.reviewNote ?? "",
      sourceTitle: body.sourceTitle ?? "",
      sourceExcerpt: body.sourceExcerpt ?? "",
      sourceUrl: body.sourceUrl ?? "",
      sourceFetchedAt: body.sourceFetchedAt ?? "",
      brandName: body.brandName ?? "品牌内容团队",
      brandTone: body.brandTone ?? [],
      redLines: body.redLines ?? [],
      userRequest: body.userRequest,
      mode: body.mode ?? "direct"
    });

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "改稿失败"
      },
      {
        status: 500
      }
    );
  }
}
