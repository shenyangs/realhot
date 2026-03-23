import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canGenerateContent } from "@/lib/auth/permissions";
import { generateRewritePromptSuggestions } from "@/lib/services/rewrite-prompt-suggestions";

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
      coverHook?: string;
      angle?: string;
      platformLabel?: string;
      trackLabel?: string;
      whyNow?: string;
      whyUs?: string;
      brandName?: string;
      brandTone?: string[];
      redLines?: string[];
    };

    if (!body.title || !body.body || !body.platformLabel || !body.trackLabel) {
      return NextResponse.json(
        {
          error: "缺少必要的提示生成参数"
        },
        {
          status: 400
        }
      );
    }

    const result = await generateRewritePromptSuggestions({
      title: body.title,
      body: body.body,
      coverHook: body.coverHook ?? "",
      angle: body.angle ?? "",
      platformLabel: body.platformLabel,
      trackLabel: body.trackLabel,
      whyNow: body.whyNow ?? "",
      whyUs: body.whyUs ?? "",
      brandName: body.brandName ?? "品牌内容团队",
      brandTone: body.brandTone ?? [],
      redLines: body.redLines ?? []
    });

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "改稿提示生成失败"
      },
      {
        status: 500
      }
    );
  }
}
