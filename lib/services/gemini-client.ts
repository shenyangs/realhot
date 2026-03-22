interface GeminiPart {
  text?: string;
}

interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
}

interface GeminiTool {
  googleSearch?: Record<string, never>;
  urlContext?: Record<string, never>;
  codeExecution?: Record<string, never>;
}

interface GeminiGenerationConfig {
  responseMimeType?: string;
  responseJsonSchema?: Record<string, unknown>;
}

export interface GeminiGenerateContentRequest {
  model: string;
  contents: GeminiContent[];
  systemInstruction?: GeminiContent;
  tools?: GeminiTool[];
  generationConfig?: GeminiGenerationConfig;
  timeoutMs?: number;
}

export interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?: string;
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: {
          uri?: string;
          title?: string;
        };
      }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: Array<{
      category?: string;
      probability?: string;
    }>;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

function getGeminiBaseUrl() {
  return process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta";
}

function isGeminiTlsRelaxed() {
  return (
    process.env.GEMINI_ALLOW_INSECURE_TLS === "true" ||
    process.env.HOTSPOT_ALLOW_INSECURE_TLS === "true"
  );
}

export function createUserTextContent(text: string): GeminiContent {
  return {
    role: "user",
    parts: [
      {
        text
      }
    ]
  };
}

export async function requestGeminiContent(
  input: GeminiGenerateContentRequest
): Promise<GeminiGenerateContentResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("未检测到 GEMINI_API_KEY");
  }

  const allowInsecureTls = isGeminiTlsRelaxed();
  const previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  if (allowInsecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  try {
    const response = await fetch(`${getGeminiBaseUrl()}/models/${input.model}:generateContent`, {
      method: "POST",
      signal: AbortSignal.timeout(input.timeoutMs ?? 20000),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: input.contents,
        systemInstruction: input.systemInstruction,
        tools: input.tools,
        generationConfig: input.generationConfig
      })
    });

    const payload = (await response.json().catch(() => null)) as GeminiGenerateContentResponse | null;

    if (!response.ok) {
      const detail =
        payload?.error?.message ??
        payload?.error?.status ??
        payload?.promptFeedback?.blockReason ??
        "Unknown upstream error";

      throw new Error(`Gemini request failed with status ${response.status}: ${detail}`);
    }

    if (payload?.error) {
      const detail = payload.error.message ?? payload.error.status ?? "Unknown upstream error";
      throw new Error(`Gemini request returned an error payload: ${detail}`);
    }

    return payload ?? {};
  } finally {
    if (allowInsecureTls) {
      if (previousTlsSetting === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting;
      }
    }
  }
}

export function extractGeminiText(payload: GeminiGenerateContentResponse | null): string | null {
  if (!payload) {
    return null;
  }

  const texts =
    payload.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text?.trim() ?? "")
      .filter(Boolean) ?? [];

  if (texts.length > 0) {
    return texts.join("\n\n");
  }

  return null;
}
