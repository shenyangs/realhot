import { LlmTask, ModelPreference, ModelRouteDecision } from "@/lib/domain/types";

export interface ProviderConfig {
  provider: string;
  model: string;
  preference: ModelPreference;
  available: boolean;
}

const providerConfigs: ProviderConfig[] = [
  {
    provider: "openai",
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    preference: "latency",
    available: Boolean(process.env.OPENAI_API_KEY)
  },
  {
    provider: "anthropic",
    model: process.env.ANTHROPIC_MODEL ?? "claude-3-7-sonnet-latest",
    preference: "quality",
    available: Boolean(process.env.ANTHROPIC_API_KEY)
  },
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
  "content-generation": "latency",
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
        : `Selected for ${preferred} priority on ${task}.`
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

  if (route.provider === "openai") {
    return runOpenAiTask(route.model, prompt);
  }

  return [
    `[${route.task}]`,
    `Provider ${route.provider} is configured in the router but not implemented yet.`,
    "Fallback to template output."
  ].join("\n");
}

async function runOpenAiTask(model: string, prompt: string): Promise<string> {
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      input: prompt
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
  };

  return payload.output_text ?? "No output_text returned from OpenAI.";
}
