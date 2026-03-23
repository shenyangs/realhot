import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { AI_PROVIDERS, AiProvider } from "@/lib/domain/ai-routing";
import { testAiProviderConnection } from "@/lib/services/model-router";

export async function POST(request: NextRequest) {
  const access = await requireApiAccess(request, {
    authorize: canAccessAdmin
  });

  if (!access.ok) {
    return access.response;
  }

  const { viewer } = access;
  const body = (await request.json().catch(() => ({}))) as {
    provider?: string;
  };

  if (!body.provider || !AI_PROVIDERS.includes(body.provider as AiProvider)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_ai_provider"
      },
      { status: 400 }
    );
  }

  try {
    const result = await testAiProviderConnection(body.provider as AiProvider);

    await writeAuditLog({
      actorUserId: viewer.user.id,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "platform_ai_provider",
      entityId: result.provider,
      action: "platform.ai_provider_connection_tested",
      payload: {
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        outputPreview: result.outputPreview
      }
    });

    return NextResponse.json({
      ok: true,
      result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "ai_provider_connection_test_failed"
      },
      { status: 400 }
    );
  }
}
