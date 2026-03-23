import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canManageBrands } from "@/lib/auth/permissions";
import { updateBrandStrategyPack } from "@/lib/data";
import { autofillBrandStrategy } from "@/lib/services/brand-autofill";

export async function POST(request: NextRequest) {
  const access = await requireApiAccess(request, {
    authorize: canManageBrands,
    requireWorkspace: true
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const body = (await request.json()) as {
      brandName?: string;
    };

    if (!body.brandName?.trim()) {
      return NextResponse.json(
        {
          error: "请先填写品牌名称"
        },
        {
          status: 400
        }
      );
    }

    const result = await autofillBrandStrategy(body.brandName);
    const strategy = await updateBrandStrategyPack(result.strategy);

    revalidatePath("/");
    revalidatePath("/brands");
    revalidatePath("/onboarding");

    return NextResponse.json({
      ok: true,
      ...result,
      strategy
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "品牌深度填写失败"
      },
      {
        status: 500
      }
    );
  }
}
