export interface OpenAiImageAsset {
  previewUrl: string;
  prompt: string;
}

interface OpenAiImageResponse {
  data?: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

export async function generateWithOpenAiImage(input: {
  prompt: string;
  count: number;
  model?: string;
  apiKey?: string;
  endpoint?: string;
}): Promise<OpenAiImageAsset[]> {
  const endpoint = input.endpoint?.trim() || process.env.OPENAI_IMAGE_API_URL?.trim() || "https://api.openai.com/v1/images/generations";
  const apiKey = input.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("openai_api_key_missing");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(120000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: input.model ?? process.env.BEST_IMAGE_MODEL ?? "gpt-image-1",
      prompt: input.prompt,
      n: Math.max(1, Math.min(input.count, 4)),
      size: "1536x1024",
      quality: "high"
    })
  });
  const payload = (await response.json().catch(() => null)) as OpenAiImageResponse | null;

  if (!response.ok) {
    const message = JSON.stringify(payload ?? {});
    throw new Error(`openai_image_failed:${message.slice(0, 260)}`);
  }

  return (payload?.data ?? [])
    .map((item) => {
      const previewUrl = item.url?.trim() || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : "");

      if (!previewUrl) {
        return null;
      }

      return {
        previewUrl,
        prompt: item.revised_prompt?.trim() || input.prompt
      };
    })
    .filter((item): item is OpenAiImageAsset => item !== null);
}
