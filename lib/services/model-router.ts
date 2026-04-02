import { LlmTask, ModelPreference, ModelRouteDecision } from "@/lib/domain/types";
import { AiFeature, AiProvider, AiRoutingConfig, DEFAULT_AI_ROUTING_CONFIG } from "@/lib/domain/ai-routing";
import {
  getAiRoutingConfig,
  resolveModelOverrideForFeature,
  resolveProviderForFeature
} from "@/lib/services/ai-routing-config";
import {
  extractMiniMaxText,
  requestMiniMaxChatCompletion,
  requestMiniMaxChatCompletionStream
} from "@/lib/services/minimax-client";

export interface ProviderConfig {
  provider: AiProvider;
  model: string;
  available: boolean;
  missingEnvKey?: string;
}

const taskPreference: Record<LlmTask, ModelPreference> = {
  "hotspot-analysis": "balanced",
  "strategy-planning": "quality",
  "content-generation": "quality",
  "copy-polish": "quality"
};

const taskFeatureDefaults: Record<LlmTask, AiFeature> = {
  "copy-polish": "rewrite",
  "hotspot-analysis": "hotspot-insight",
  "content-generation": "content-generation",
  "strategy-planning": "content-generation"
};

export interface ModelRouteOptions {
  feature?: AiFeature;
  desiredProvider?: AiProvider;
  modelOverride?: string;
}

export interface AiProviderConnectionTestResult {
  provider: AiProvider;
  model: string;
  latencyMs: number;
  outputPreview: string | null;
}

function resolveFeature(task: LlmTask, options?: ModelRouteOptions): AiFeature {
  return options?.feature ?? taskFeatureDefaults[task];
}

function resolveMiniMaxModel(feature: AiFeature): string {
  if (feature === "production-generation") {
    return process.env.MINIMAX_PRODUCTION_MODEL?.trim() || process.env.MINIMAX_MODEL?.trim() || "MiniMax-M2.7";
  }

  return process.env.MINIMAX_MODEL?.trim() || "MiniMax-M2.7";
}

function resolveDefaultModel(provider: AiProvider, feature: AiFeature): string {
  return resolveMiniMaxModel(feature);
}

function getProviderConfigs(
  feature: AiFeature,
  options?: {
    desiredProvider?: AiProvider;
    modelOverride?: string;
  }
): ProviderConfig[] {
  const hasMiniMaxKey = Boolean(process.env.MINIMAX_API_KEY?.trim());
  const resolvedModelOverride = options?.modelOverride?.trim();

  return [
    {
      provider: "minimax",
      model:
        options?.desiredProvider === "minimax" && resolvedModelOverride
          ? resolvedModelOverride
          : resolveMiniMaxModel(feature),
      available: hasMiniMaxKey,
      missingEnvKey: hasMiniMaxKey ? undefined : "MINIMAX_API_KEY"
    }
  ];
}

export function listProviderConfigs(feature: AiFeature = "content-generation"): ProviderConfig[] {
  return getProviderConfigs(feature);
}

export function resolveFeatureProviderConfig(
  feature: AiFeature,
  config: AiRoutingConfig
): ProviderConfig {
  const desiredProvider = resolveProviderForFeature(config, feature);
  const modelOverride = resolveModelOverrideForFeature(config, feature);

  return (
    getProviderConfigs(feature, {
      desiredProvider,
      modelOverride
    }).find((item) => item.provider === desiredProvider) ?? {
      provider: desiredProvider,
      model: modelOverride ?? resolveDefaultModel(desiredProvider, feature),
      available: false
    }
  );
}

function getProviderLabel(provider: string): string {
  if (provider === "minimax") {
    return "MiniMax";
  }

  return provider;
}

export async function decideModelRoute(
  task: LlmTask,
  options?: ModelRouteOptions
): Promise<ModelRouteDecision> {
  const preferred = taskPreference[task];
  const feature = resolveFeature(task, options);
  const manualProvider = options?.desiredProvider;
  const manualModelOverride = options?.modelOverride?.trim() || undefined;
  let desiredProvider: AiProvider =
    manualProvider ?? DEFAULT_AI_ROUTING_CONFIG.featureProviderOverrides[feature] ?? DEFAULT_AI_ROUTING_CONFIG.defaultProvider;
  let desiredModelOverride: string | undefined = manualModelOverride;
  let config: AiRoutingConfig = DEFAULT_AI_ROUTING_CONFIG;

  if (!manualProvider) {
    try {
      config = await getAiRoutingConfig();
      desiredProvider = resolveProviderForFeature(config, feature);
      desiredModelOverride = resolveModelOverrideForFeature(config, feature);
    } catch {
      desiredProvider =
        DEFAULT_AI_ROUTING_CONFIG.featureProviderOverrides[feature] ?? DEFAULT_AI_ROUTING_CONFIG.defaultProvider;
      desiredModelOverride = resolveModelOverrideForFeature(DEFAULT_AI_ROUTING_CONFIG, feature);
    }
  }

  const providerConfigs = getProviderConfigs(feature, {
    desiredProvider,
    modelOverride: desiredModelOverride
  });
  const desiredConfig = providerConfigs.find((config) => config.provider === desiredProvider);
  const modelReason = desiredModelOverride?.trim()
    ? `${manualProvider ? "手动指定模型" : "已指定模型"} ${desiredModelOverride.trim()}`
    : `默认模型 ${desiredConfig?.model ?? resolveDefaultModel(desiredProvider, feature)}`;
  const providerReasonPrefix = manualProvider ? "手动选择" : `${feature} 已配置为`;

  if (desiredConfig?.available) {
    return {
      task,
      provider: desiredConfig.provider,
      model: desiredConfig.model,
      reason: `${providerReasonPrefix} ${getProviderLabel(desiredConfig.provider)}，${modelReason}，按 ${preferred} 优先级执行。`
    };
  }

  const fallbackConfig = providerConfigs.find((config) => config.available);

  if (fallbackConfig) {
    const missingHint = desiredConfig?.missingEnvKey
      ? `（缺少 ${desiredConfig.missingEnvKey}）`
      : "";

    return {
      task,
      provider: fallbackConfig.provider,
      model: fallbackConfig.model,
      reason: `${manualProvider ? "手动选择" : feature} 目标模型 ${getProviderLabel(desiredProvider)}${missingHint}，已自动回退到 ${getProviderLabel(fallbackConfig.provider)}。`
    };
  }

  return {
    task,
    provider: "mock",
    model: "template-engine",
    reason: `未检测到可用的 MiniMax 密钥，已回退到本地模板输出。${feature} 仍保留为 ${preferred} 优先级。`
  };
}

export async function runResolvedModelTask(route: ModelRouteDecision, prompt: string): Promise<string> {
  if (route.provider === "mock") {
    return [
      `[${route.task}]`,
      route.reason,
      "Prompt summary:",
      prompt.slice(0, 220)
    ].join("\n");
  }

  if (route.provider === "minimax") {
    return runMiniMaxTask(route.model, prompt);
  }

  return [
    `[${route.task}]`,
    `Provider ${route.provider} is configured in the router but not implemented yet.`,
    "Fallback to template output."
  ].join("\n");
}

export async function* runResolvedModelTaskStream(
  route: ModelRouteDecision,
  prompt: string
): AsyncGenerator<string> {
  if (route.provider === "mock") {
    yield [
      `[${route.task}]`,
      route.reason,
      "Prompt summary:",
      prompt.slice(0, 220)
    ].join("\n");
    return;
  }

  if (route.provider === "minimax") {
    yield* runMiniMaxTaskStream(route.model, prompt);
    return;
  }

  yield [
    `[${route.task}]`,
    `Provider ${route.provider} is configured in the router but not implemented yet.`,
    "Fallback to template output."
  ].join("\n");
}

export async function runModelTaskWithRoute(
  task: LlmTask,
  prompt: string,
  options?: ModelRouteOptions
): Promise<{
  route: ModelRouteDecision;
  output: string;
}> {
  const route = await decideModelRoute(task, options);
  const output = await runResolvedModelTask(route, prompt);

  return {
    route,
    output
  };
}

export async function runModelTask(
  task: LlmTask,
  prompt: string,
  options?: ModelRouteOptions
): Promise<string> {
  const result = await runModelTaskWithRoute(task, prompt, options);
  return result.output;
}

export async function testAiProviderConnection(
  provider: AiProvider,
  feature: AiFeature = "content-generation"
): Promise<AiProviderConnectionTestResult> {
  const providerConfig = getProviderConfigs(feature).find((item) => item.provider === provider);

  if (!providerConfig) {
    throw new Error("unsupported_ai_provider");
  }

  if (!providerConfig.available) {
    throw new Error(providerConfig.missingEnvKey ? `未检测到 ${providerConfig.missingEnvKey}` : "provider_not_available");
  }

  const startedAt = Date.now();
  const prompt = "Reply with OK.";
  let outputPreview: string | null = null;

  if (provider === "minimax") {
    const payload = await requestMiniMaxChatCompletion({
      model: providerConfig.model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      timeoutMs: 15000
    });

    outputPreview = extractMiniMaxText(payload);
  } else {
    throw new Error("unsupported_ai_provider");
  }

  return {
    provider,
    model: providerConfig.model,
    latencyMs: Math.max(Date.now() - startedAt, 1),
    outputPreview: outputPreview?.slice(0, 120) ?? null
  };
}

async function runMiniMaxTask(model: string, prompt: string): Promise<string> {
  const payload = await requestMiniMaxChatCompletion({
    model,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    timeoutMs: 60000
  });
  const outputText = extractMiniMaxText(payload);

  return outputText ?? "No text returned from MiniMax chat completions.";
}

async function* runMiniMaxTaskStream(model: string, prompt: string): AsyncGenerator<string> {
  yield* requestMiniMaxChatCompletionStream({
    model,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    timeoutMs: 60000
  });
}
