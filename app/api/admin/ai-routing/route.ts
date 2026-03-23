import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { writeAuditLog } from "@/lib/auth/audit";
import { canAccessAdmin } from "@/lib/auth/permissions";
import {
  buildEffectiveFeatureRoutes,
  getAiRoutingConfig,
  normalizeAiRoutingConfig,
  updateAiRoutingConfig
} from "@/lib/services/ai-routing-config";

export async function GET(request: NextRequest) {
  const access = await requireApiAccess(request, {
    authorize: canAccessAdmin
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const config = await getAiRoutingConfig();

    return NextResponse.json({
      ok: true,
      config,
      effectiveRoutes: buildEffectiveFeatureRoutes(config)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "ai_routing_load_failed"
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireApiAccess(request, {
    authorize: canAccessAdmin
  });

  if (!access.ok) {
    return access.response;
  }

  const { viewer } = access;

  const body = (await request.json().catch(() => ({}))) as {
    defaultProvider?: string;
    featureProviderOverrides?: Record<string, string>;
    featureModelOverrides?: Record<string, string>;
  };

  try {
    const current = await getAiRoutingConfig();
    const next = normalizeAiRoutingConfig({
      defaultProvider: body.defaultProvider ?? current.defaultProvider,
      featureProviderOverrides: body.featureProviderOverrides ?? current.featureProviderOverrides,
      featureModelOverrides: body.featureModelOverrides ?? current.featureModelOverrides
    });
    const config = await updateAiRoutingConfig(next, {
      actorUserId: viewer.user.id
    });

    await writeAuditLog({
      actorUserId: viewer.user.id,
      actorDisplayName: viewer.user.displayName,
      actorEmail: viewer.user.email,
      entityType: "platform_ai_routing_config",
      action: "platform.ai_routing_updated",
      payload: {
        defaultProvider: config.defaultProvider,
        featureProviderOverrides: config.featureProviderOverrides,
        featureModelOverrides: config.featureModelOverrides
      }
    });

    return NextResponse.json({
      ok: true,
      config,
      effectiveRoutes: buildEffectiveFeatureRoutes(config)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "ai_routing_update_failed"
      },
      { status: 400 }
    );
  }
}
