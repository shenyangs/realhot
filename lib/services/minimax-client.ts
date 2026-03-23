interface MiniMaxMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MiniMaxTool {
  type: string;
}

export interface MiniMaxChatRequest {
  model: string;
  messages: MiniMaxMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  tools?: MiniMaxTool[];
  toolChoice?: "auto" | "none" | "required";
  timeoutMs?: number;
}

interface MiniMaxContentPart {
  text?: string;
  type?: string;
}

export interface MiniMaxChatResponse {
  choices?: Array<{
    message?: {
      content?: string | MiniMaxContentPart[];
    };
    finish_reason?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

function getMiniMaxBaseUrl() {
  return process.env.MINIMAX_BASE_URL?.trim() || "https://api.minimax.chat/v1";
}

function isMiniMaxTlsRelaxed() {
  return process.env.MINIMAX_ALLOW_INSECURE_TLS === "true";
}

function normalizeContent(content: string | MiniMaxContentPart[] | undefined): string | null {
  if (typeof content === "string") {
    return content.trim() || null;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((item) => item.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n")
      .trim();

    return text || null;
  }

  return null;
}

export async function requestMiniMaxChatCompletion(
  input: MiniMaxChatRequest
): Promise<MiniMaxChatResponse> {
  const apiKey = process.env.MINIMAX_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("未检测到 MINIMAX_API_KEY");
  }

  const allowInsecureTls = isMiniMaxTlsRelaxed();
  const previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  if (allowInsecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  try {
    const response = await fetch(`${getMiniMaxBaseUrl()}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(input.timeoutMs ?? 60000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        top_p: input.topP,
        max_tokens: input.maxTokens,
        tools: input.tools,
        tool_choice: input.toolChoice
      })
    });

    const payload = (await response.json().catch(() => null)) as MiniMaxChatResponse | null;

    if (!response.ok) {
      const detail =
        payload?.error?.message ??
        payload?.error?.type ??
        payload?.error?.code ??
        "Unknown upstream error";

      throw new Error(`MiniMax request failed with status ${response.status}: ${detail}`);
    }

    if (payload?.error) {
      const detail =
        payload.error.message ?? payload.error.type ?? payload.error.code ?? "Unknown upstream error";
      throw new Error(`MiniMax request returned an error payload: ${detail}`);
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

export function extractMiniMaxText(payload: MiniMaxChatResponse | null): string | null {
  if (!payload) {
    return null;
  }

  const text = payload.choices
    ?.map((choice) => normalizeContent(choice.message?.content))
    .find((value): value is string => Boolean(value));

  return text ?? null;
}
