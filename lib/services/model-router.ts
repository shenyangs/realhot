import { LlmTask, ModelPreference, ModelRouteDecision } from "@/lib/domain/types";
import { AiFeature, AiProvider, DEFAULT_AI_ROUTING_CONFIG } from "@/lib/domain/ai-routing";
import { getAiRoutingConfig, resolveProviderForFeature } from "@/lib/services/ai-routing-config";
import { createUserTextContent, extractGeminiText, requestGeminiContent } from "@/lib/services/gemini-client";
import { extractMiniMaxText, requestMiniMaxChatCompletion } from "@/lib/services/minimax-client";

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

function resolveGeminiModel(feature: AiFeature): string {
  if (feature === "brand-autofill") {
    return process.env.GEMINI_SEARCH_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-2.5-pro";
  }

  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-pro";
}

function resolveMiniMaxModel(): string {
  return process.env.MINIMAX_MODEL?.trim() || "MiniMax-M2.7";
}

function getProviderConfigs(feature: AiFeature): ProviderConfig[] {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasMiniMaxKey = Boolean(process.env.MINIMAX_API_KEY?.trim());

  return [
    {
      provider: "gemini",
      model: resolveGeminiModel(feature),
      available: hasGeminiKey,
      missingEnvKey: hasGeminiKey ? undefined : "GEMINI_API_KEY"
    },
    {
      provider: "minimax",
      model: resolveMiniMaxModel(),
      available: hasMiniMaxKey,
      missingEnvKey: hasMiniMaxKey ? undefined : "MINIMAX_API_KEY"
    }
  ];
}

export function listProviderConfigs(feature: AiFeature = "content-generation"): ProviderConfig[] {
  return getProviderConfigs(feature);
}

function getProviderLabel(provider: string): string {
  if (provider === "gemini") {
    return "Gemini";
  }

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
  let desiredProvider: AiProvider = DEFAULT_AI_ROUTING_CONFIG.defaultProvider;

  try {
    const config = await getAiRoutingConfig();
    desiredProvider = resolveProviderForFeature(config, feature);
  } catch {
    desiredProvider = DEFAULT_AI_ROUTING_CONFIG.defaultProvider;
  }

  const providerConfigs = getProviderConfigs(feature);
  const desiredConfig = providerConfigs.find((config) => config.provider === desiredProvider);

  if (desiredConfig?.available) {
    return {
      task,
      provider: desiredConfig.provider,
      model: desiredConfig.model,
      reason: `${feature} 已配置为 ${getProviderLabel(desiredConfig.provider)}，按 ${preferred} 优先级执行。`
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
      reason: `${feature} 目标模型 ${getProviderLabel(desiredProvider)}${missingHint}，已自动回退到 ${getProviderLabel(fallbackConfig.provider)}。`
    };
  }

  return {
    task,
    provider: "mock",
    model: "template-engine",
    reason: `未检测到可用模型密钥（Gemini/MiniMax），已回退到本地模板输出。${feature} 仍保留为 ${preferred} 优先级。`
  };
}

export async function runModelTask(
  task: LlmTask,
  prompt: string,
  options?: ModelRouteOptions
): Promise<string> {
  const route = await decideModelRoute(task, options);

  if (route.provider === "mock") {
    return [
      `[${route.task}]`,
      route.reason,
      "Prompt summary:",
      prompt.slice(0, 220)
    ].join("\n");
  }

  if (route.provider === "gemini") {
    return runGeminiTask(route.model, prompt);
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

  if (provider === "gemini") {
    const payload = await requestGeminiContent({
      model: providerConfig.model,
      contents: [createUserTextContent(prompt)],
      timeoutMs: 15000,
      generationConfig: {
        responseMimeType: "text/plain"
      }
    });

    outputPreview = extractGeminiText(payload);
  } else if (provider === "minimax") {
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

async function runGeminiTask(model: string, prompt: string): Promise<string> {
  const payload = await requestGeminiContent({
    model,
    contents: [createUserTextContent(prompt)],
    timeoutMs: 60000,
    generationConfig: {
      responseMimeType: "text/plain"
    }
  });
  const outputText = extractGeminiText(payload);

  return outputText ?? "No text returned from Gemini generateContent.";
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
