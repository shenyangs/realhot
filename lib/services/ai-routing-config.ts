import { readLocalDataStore, updateLocalDataStore } from "@/lib/data/local-store";
import {
  AI_FEATURES,
  AI_PROVIDERS,
  AiFeature,
  AiProvider,
  AiRoutingConfig,
  DEFAULT_AI_ROUTING_CONFIG
} from "@/lib/domain/ai-routing";
import { getSupabaseServerClient } from "@/lib/supabase/client";

interface AiRoutingConfigRow {
  id: string;
  default_provider: string;
  feature_overrides: unknown;
  feature_model_overrides: unknown;
}

function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
}

function normalizeFeatureOverrides(value: unknown): Partial<Record<AiFeature, AiProvider>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const next: Partial<Record<AiFeature, AiProvider>> = {};

  for (const feature of AI_FEATURES) {
    const provider = input[feature];

    if (isAiProvider(provider)) {
      next[feature] = provider;
    }
  }

  return next;
}

function normalizeFeatureModelOverrides(value: unknown): Partial<Record<AiFeature, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const next: Partial<Record<AiFeature, string>> = {};

  for (const feature of AI_FEATURES) {
    const model = input[feature];

    if (typeof model === "string" && model.trim()) {
      next[feature] = model.trim();
    }
  }

  return next;
}

export function normalizeAiRoutingConfig(value: unknown): AiRoutingConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ...DEFAULT_AI_ROUTING_CONFIG
    };
  }

  const input = value as Partial<AiRoutingConfig>;

  return {
    // 全局默认统一收敛到 MiniMax。
    defaultProvider: DEFAULT_AI_ROUTING_CONFIG.defaultProvider,
    featureProviderOverrides: normalizeFeatureOverrides(input.featureProviderOverrides),
    featureModelOverrides: normalizeFeatureModelOverrides(input.featureModelOverrides)
  };
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: string };
  return record.code === "42P01";
}

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: string };
  return record.code === "42703";
}

async function getLocalConfig(): Promise<AiRoutingConfig> {
  const store = await readLocalDataStore();
  return normalizeAiRoutingConfig(store.aiRoutingConfig);
}

async function setLocalConfig(config: AiRoutingConfig): Promise<AiRoutingConfig> {
  const next = normalizeAiRoutingConfig(config);
  await updateLocalDataStore((store) => ({
    ...store,
    aiRoutingConfig: next
  }));
  return next;
}

export async function getAiRoutingConfig(): Promise<AiRoutingConfig> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return getLocalConfig();
  }

  const { data, error } = await supabase
    .from("platform_ai_routing_configs")
    .select("id, default_provider, feature_overrides, feature_model_overrides")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<AiRoutingConfigRow>();

  if (error) {
    if (isMissingColumnError(error)) {
      const legacy = await supabase
        .from("platform_ai_routing_configs")
        .select("id, default_provider, feature_overrides")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{
          id: string;
          default_provider: string;
          feature_overrides: unknown;
        }>();

      if (legacy.error) {
        if (isMissingRelationError(legacy.error)) {
          return getLocalConfig();
        }

        return {
          ...DEFAULT_AI_ROUTING_CONFIG
        };
      }

      if (!legacy.data) {
        return {
          ...DEFAULT_AI_ROUTING_CONFIG
        };
      }

      return normalizeAiRoutingConfig({
        defaultProvider: legacy.data.default_provider,
        featureProviderOverrides: legacy.data.feature_overrides
      });
    }

    if (isMissingRelationError(error)) {
      return getLocalConfig();
    }

    return {
      ...DEFAULT_AI_ROUTING_CONFIG
    };
  }

  if (!data) {
    return {
      ...DEFAULT_AI_ROUTING_CONFIG
    };
  }

  return normalizeAiRoutingConfig({
    defaultProvider: data.default_provider,
    featureProviderOverrides: data.feature_overrides,
    featureModelOverrides: data.feature_model_overrides
  });
}

export async function updateAiRoutingConfig(
  input: AiRoutingConfig,
  options?: {
    actorUserId?: string;
  }
): Promise<AiRoutingConfig> {
  const next = normalizeAiRoutingConfig(input);
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return setLocalConfig(next);
  }

  const { data: existing, error: existingError } = await supabase
    .from("platform_ai_routing_configs")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingError && !isMissingRelationError(existingError)) {
    throw existingError;
  }

  const payload = {
    default_provider: next.defaultProvider,
    feature_overrides: next.featureProviderOverrides,
    feature_model_overrides: next.featureModelOverrides,
    updated_by: options?.actorUserId ?? null,
    updated_at: new Date().toISOString()
  };

  const writeResult = existing?.id
    ? await supabase
        .from("platform_ai_routing_configs")
        .update(payload)
        .eq("id", existing.id)
    : await supabase.from("platform_ai_routing_configs").insert(payload);

  if (writeResult.error) {
    if (isMissingColumnError(writeResult.error)) {
      if (Object.keys(next.featureModelOverrides).length > 0) {
        throw new Error("数据库尚未升级 feature_model_overrides 字段，暂时不能保存模型覆写");
      }

      const legacyPayload = {
        default_provider: next.defaultProvider,
        feature_overrides: next.featureProviderOverrides,
        updated_by: options?.actorUserId ?? null,
        updated_at: new Date().toISOString()
      };

      const legacyWriteResult = existing?.id
        ? await supabase
            .from("platform_ai_routing_configs")
            .update(legacyPayload)
            .eq("id", existing.id)
        : await supabase.from("platform_ai_routing_configs").insert(legacyPayload);

      if (legacyWriteResult.error) {
        if (isMissingRelationError(legacyWriteResult.error)) {
          return setLocalConfig(next);
        }

        throw legacyWriteResult.error;
      }

      return next;
    }

    if (isMissingRelationError(writeResult.error)) {
      return setLocalConfig(next);
    }

    throw writeResult.error;
  }

  return next;
}

export function resolveProviderForFeature(
  config: AiRoutingConfig,
  feature: AiFeature
): AiProvider {
  return config.featureProviderOverrides[feature] ?? config.defaultProvider;
}

export function resolveModelOverrideForFeature(
  config: AiRoutingConfig,
  feature: AiFeature
): string | undefined {
  const model = config.featureModelOverrides[feature];
  return typeof model === "string" && model.trim() ? model.trim() : undefined;
}

export function buildEffectiveFeatureRoutes(
  config: AiRoutingConfig
): Record<AiFeature, AiProvider> {
  return Object.fromEntries(
    AI_FEATURES.map((feature) => [feature, resolveProviderForFeature(config, feature)])
  ) as Record<AiFeature, AiProvider>;
}
