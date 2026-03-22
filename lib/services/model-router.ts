import { LlmTask, ModelPreference, ModelRouteDecision } from "@/lib/domain/types";
import { createUserTextContent, extractGeminiText, requestGeminiContent } from "@/lib/services/gemini-client";

export interface ProviderConfig {
  provider: string;
  model: string;
  preference: ModelPreference;
  available: boolean;
}

const providerConfigs: ProviderConfig[] = [
  {
    provider: "gemini",
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
    preference: "balanced",
    available: Boolean(process.env.GEMINI_API_KEY)
  }
];

const taskPreference: Record<LlmTask, ModelPreference> = {
  "hotspot-analysis": "balanced",
  "strategy-planning": "quality",
  "content-generation": "quality",
  "copy-polish": "quality"
};

export function decideModelRoute(task: LlmTask): ModelRouteDecision {
  const preferred = taskPreference[task];
  const chosen =
    providerConfigs.find(
      (config) => config.preference === preferred && config.available
    ) ??
    providerConfigs.find((config) => config.available) ?? {
      provider: "mock",
      model: "template-engine",
      preference: "balanced",
      available: true
    };

  return {
    task,
    provider: chosen.provider,
    model: chosen.model,
    reason:
      chosen.provider === "mock"
        ? "No model credentials detected, using deterministic local templates."
        : `Using Gemini for ${task} with ${preferred} priority.`
  };
}

export async function runModelTask(task: LlmTask, prompt: string): Promise<string> {
  const route = decideModelRoute(task);

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

  return [
    `[${route.task}]`,
    `Provider ${route.provider} is configured in the router but not implemented yet.`,
    "Fallback to template output."
  ].join("\n");
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
