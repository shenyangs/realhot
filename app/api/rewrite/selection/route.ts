import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canGenerateContent } from "@/lib/auth/permissions";
import { rewriteSelectedText, type SelectionRewriteField } from "@/lib/services/selection-rewrite-assistant";

function isSelectionField(value: string | undefined): value is SelectionRewriteField {
  return value === "title" || value === "body";
}

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
      targetField?: string;
      selectedText?: string;
      userRequest?: string;
      selectionStart?: number;
      selectionEnd?: number;
      currentTitle?: string;
      currentBody?: string;
    };

    if (!isSelectionField(body.targetField) || !body.selectedText?.trim() || !body.userRequest?.trim()) {
      return NextResponse.json(
        {
          error: "缺少必要的选区改稿参数"
        },
        {
          status: 400
        }
      );
    }

    const result = await rewriteSelectedText({
      targetField: body.targetField,
      selectedText: body.selectedText,
      userRequest: body.userRequest,
      selectionStart: typeof body.selectionStart === "number" ? body.selectionStart : undefined,
      selectionEnd: typeof body.selectionEnd === "number" ? body.selectionEnd : undefined,
      currentTitle: body.currentTitle ?? "",
      currentBody: body.currentBody ?? ""
    });

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "选区改稿失败"
      },
      {
        status: 500
      }
    );
  }
}
