import type { AiProvider } from "@/lib/domain/ai-routing";

function getProviderLabel(provider?: AiProvider | string) {
  if (provider === "gemini") {
    return "Gemini";
  }

  if (provider === "minimax") {
    return "MiniMax";
  }

  return provider || "AI 服务";
}

function toMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.trim();
  }

  return typeof error === "string" ? error.trim() : "unknown_ai_error";
}

export function isRetryableAiError(error: unknown) {
  const message = toMessage(error).toLowerCase();

  return [
    "status 429",
    "status 500",
    "status 502",
    "status 503",
    "status 504",
    "timeout",
    "timed out",
    "aborted due to timeout",
    "high demand",
    "temporarily unavailable",
    "overloaded",
    "fetch failed",
    "econnreset",
    "etimedout",
    "socket hang up"
  ].some((keyword) => message.includes(keyword));
}

export function humanizeAiError(error: unknown, provider?: AiProvider | string) {
  const message = toMessage(error);
  const normalized = message.toLowerCase();
  const label = getProviderLabel(provider);

  if (normalized.includes("status 503") || normalized.includes("high demand") || normalized.includes("overloaded")) {
    return `${label} 当前请求拥挤，稍后再试。`;
  }

  if (normalized.includes("status 429")) {
    return `${label} 当前请求过于频繁，请稍后再试。`;
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("aborted due to timeout")
  ) {
    return `${label} 当前响应超时，请稍后重试。`;
  }

  if (normalized.includes("status 500") || normalized.includes("status 502") || normalized.includes("status 504")) {
    return `${label} 当前服务不稳定，请稍后再试。`;
  }

  if (normalized.includes("未检测到 gemini_api_key")) {
    return "Gemini 尚未配置密钥。";
  }

  if (normalized.includes("未检测到 minimax_api_key")) {
    return "MiniMax 尚未配置密钥。";
  }

  if (normalized.includes("invalid api key") || normalized.includes("api key not valid")) {
    return `${label} 密钥无效，请检查后台配置。`;
  }

  if (normalized.includes("permission denied") || normalized.includes("forbidden")) {
    return `${label} 当前无权限访问，请检查账号或密钥权限。`;
  }

  if (normalized.includes("unsupported_ai_provider")) {
    return "当前模型提供方暂不受支持。";
  }

  if (normalized.includes("provider_not_available")) {
    return `${label} 当前不可用，请检查密钥与路由配置。`;
  }

  return `${label} 暂时不可用，请稍后再试。`;
}
