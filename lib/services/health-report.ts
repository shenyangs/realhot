import { getQueuedPublishJobs } from "@/lib/data";
import type { AiFeature } from "@/lib/domain/ai-routing";
import { getAiRoutingConfig } from "@/lib/services/ai-routing-config";
import { listProviderConfigs, resolveFeatureProviderConfig, testAiProviderConnection } from "@/lib/services/model-router";
import { getSupabaseServerClient } from "@/lib/supabase/client";

export type HealthLevel = "pass" | "warn" | "fail";

export interface HealthCheck<T = Record<string, unknown>> {
  level: HealthLevel;
  summary: string;
  details?: T;
}

export interface HealthReport {
  ok: boolean;
  status: HealthLevel;
  app: string;
  checkedAt: string;
  mode: "config" | "probe";
  env: {
    nodeEnv: string;
    vercelEnv: string | null;
    commitSha: string | null;
  };
  checks: {
    auth: HealthCheck;
    supabase: HealthCheck;
    ai: HealthCheck;
    automation: HealthCheck;
  };
}

function isNonEmpty(value: string | undefined | null) {
  return Boolean(value && value.trim());
}

function isDefaultSessionSecret(value: string | undefined | null) {
  return value === "brand-os-local-session-dev-secret" || value === "change-me";
}

function getOverallLevel(checks: HealthCheck[]) {
  if (checks.some((item) => item.level === "fail")) {
    return "fail" as const;
  }

  if (checks.some((item) => item.level === "warn")) {
    return "warn" as const;
  }

  return "pass" as const;
}

async function buildSupabaseCheck(probe: boolean): Promise<HealthCheck> {
  const hasUrl = isNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnon = isNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasServiceRole = isNonEmpty(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const configured = hasUrl && hasAnon && hasServiceRole;

  if (!configured) {
    return {
      level: "warn",
      summary: "Supabase 未完整配置，当前会退回本地存储模式。",
      details: {
        configured,
        hasUrl,
        hasAnon,
        hasServiceRole
      }
    };
  }

  if (!probe) {
    return {
      level: "pass",
      summary: "Supabase 环境变量已就绪。",
      details: {
        configured,
        probeSkipped: true
      }
    };
  }

  try {
    const supabase = getSupabaseServerClient();

    if (!supabase) {
      throw new Error("server_client_unavailable");
    }

    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      throw error;
    }

    return {
      level: "pass",
      summary: "Supabase 连接正常。",
      details: {
        configured,
        probed: true
      }
    };
  } catch (error) {
    return {
      level: "fail",
      summary: "Supabase 连接异常。",
      details: {
        configured,
        probed: true,
        error: error instanceof Error ? error.message : "unknown_supabase_error"
      }
    };
  }
}

async function buildAiCheck(probe: boolean): Promise<HealthCheck> {
  const config = await getAiRoutingConfig();
  const features: AiFeature[] = ["content-generation", "brand-autofill", "production-generation"];
  const routes = features.map((feature) => {
    const resolved = resolveFeatureProviderConfig(feature, config);

    return {
      feature,
      provider: resolved.provider,
      model: resolved.model,
      available: resolved.available,
      missingEnvKey: resolved.missingEnvKey
    };
  });

  const configuredProviders = listProviderConfigs("content-generation").map((item) => ({
    provider: item.provider,
    available: item.available,
    missingEnvKey: item.missingEnvKey,
    model: item.model
  }));

  if (routes.every((item) => !item.available)) {
    return {
      level: "fail",
      summary: "AI 模型不可用，当前会回退到模板输出。",
      details: {
        routes,
        providers: configuredProviders
      }
    };
  }

  if (!probe) {
    return {
      level: routes.some((item) => !item.available) ? "warn" : "pass",
      summary: routes.some((item) => !item.available)
        ? "AI 路由已配置，但存在部分特性依赖缺失。"
        : "AI 路由和密钥配置已就绪。",
      details: {
        routes,
        providers: configuredProviders,
        probeSkipped: true
      }
    };
  }

  const providerChecks = await Promise.all(
    configuredProviders.map(async (provider) => {
      if (!provider.available) {
        return {
          provider: provider.provider,
          ok: false,
          skipped: true,
          error: provider.missingEnvKey ?? "provider_not_available"
        };
      }

      try {
        const result = await testAiProviderConnection(provider.provider);
        return {
          provider: provider.provider,
          ok: true,
          latencyMs: result.latencyMs,
          model: result.model,
          preview: result.outputPreview
        };
      } catch (error) {
        return {
          provider: provider.provider,
          ok: false,
          error: error instanceof Error ? error.message : "unknown_ai_probe_error"
        };
      }
    })
  );

  const hasProbeFailure = providerChecks.some((item) => !item.ok && !("skipped" in item && item.skipped));

  return {
    level: hasProbeFailure ? "fail" : routes.some((item) => !item.available) ? "warn" : "pass",
    summary: hasProbeFailure
      ? "AI 上游探测失败，至少有一个供应商无法正常响应。"
      : routes.some((item) => !item.available)
        ? "AI 路由部分可用，建议补齐缺失供应商密钥。"
        : "AI 路由和上游探测均正常。",
    details: {
      routes,
      providers: configuredProviders,
      probes: providerChecks
    }
  };
}

async function buildAutomationCheck(): Promise<HealthCheck> {
  const appUrl = process.env.APP_URL?.trim() ?? "";
  const hotspotSyncSecret = process.env.HOTSPOT_SYNC_SECRET?.trim() ?? "";
  const publishRunnerSecret = process.env.PUBLISH_RUNNER_SECRET?.trim() ?? "";
  const hasAppUrl = Boolean(appUrl);
  const appUrlLooksLocal = /^http:\/\/(localhost|127\.0\.0\.1)/.test(appUrl);
  const queuedJobs = await getQueuedPublishJobs().catch(() => []);
  const issues: string[] = [];

  if (!hasAppUrl) {
    issues.push("缺少 APP_URL");
  } else if (process.env.NODE_ENV === "production" && appUrlLooksLocal) {
    issues.push("APP_URL 仍是本地地址");
  }

  if (!hotspotSyncSecret) {
    issues.push("缺少 HOTSPOT_SYNC_SECRET");
  }

  if (!publishRunnerSecret) {
    issues.push("缺少 PUBLISH_RUNNER_SECRET");
  }

  return {
    level: issues.length === 0 ? "pass" : "warn",
    summary: issues.length === 0 ? "同步与发布执行器环境已就绪。" : "同步 / 发布自动化仍有未补齐项。",
    details: {
      appUrl: hasAppUrl ? appUrl : null,
      hasHotspotSyncSecret: Boolean(hotspotSyncSecret),
      hasPublishRunnerSecret: Boolean(publishRunnerSecret),
      queuedPublishJobs: queuedJobs.length,
      issues
    }
  };
}

function buildAuthCheck(): HealthCheck {
  const localSessionSecret =
    process.env.LOCAL_SESSION_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  const configured = isNonEmpty(localSessionSecret);
  const usingDefaultSecret = isDefaultSessionSecret(localSessionSecret);

  if (!configured) {
    return {
      level: "fail",
      summary: "未配置会话签名密钥。",
      details: {
        configured,
        usingDefaultSecret
      }
    };
  }

  if (usingDefaultSecret) {
    return {
      level: process.env.NODE_ENV === "production" ? "fail" : "warn",
      summary: "会话签名仍使用默认或示例密钥。",
      details: {
        configured,
        usingDefaultSecret
      }
    };
  }

  return {
    level: "pass",
    summary: "会话签名密钥已配置。",
    details: {
      configured,
      usingDefaultSecret
    }
  };
}

export async function buildHealthReport(probe = false): Promise<HealthReport> {
  const checks = {
    auth: buildAuthCheck(),
    supabase: await buildSupabaseCheck(probe),
    ai: await buildAiCheck(probe),
    automation: await buildAutomationCheck()
  };
  const overall = getOverallLevel(Object.values(checks));

  return {
    ok: overall !== "fail",
    status: overall,
    app: "brand-hotspot-studio",
    checkedAt: new Date().toISOString(),
    mode: probe ? "probe" : "config",
    env: {
      nodeEnv: process.env.NODE_ENV ?? "development",
      vercelEnv: process.env.VERCEL_ENV ?? null,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null
    },
    checks
  };
}
