export interface GoogleImagenAsset {
  previewUrl: string;
  prompt: string;
}

interface GoogleImagenResponse {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
    prompt?: string;
    imageUri?: string;
  }>;
}

export async function generateWithGoogleImagen(input: {
  prompt: string;
  count: number;
  model?: string;
  apiKey?: string;
  endpoint?: string;
}): Promise<GoogleImagenAsset[]> {
  const endpoint = input.endpoint?.trim() || process.env.GOOGLE_IMAGEN_API_URL?.trim();
  const apiKey = input.apiKey?.trim() || process.env.GOOGLE_IMAGEN_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();

  if (!endpoint) {
    throw new Error("google_imagen_endpoint_missing");
  }

  if (!apiKey) {
    throw new Error("google_imagen_api_key_missing");
  }

  const response = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    signal: AbortSignal.timeout(120000),
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      instances: [
        {
          prompt: input.prompt
        }
      ],
      parameters: {
        sampleCount: Math.max(1, Math.min(input.count, 4)),
        aspectRatio: "16:9"
      },
      model: input.model ?? process.env.BEST_IMAGE_MODEL ?? "imagen-4.0-generate-001"
    })
  });
  const payload = (await response.json().catch(() => null)) as GoogleImagenResponse | null;

  if (!response.ok) {
    const message = JSON.stringify(payload ?? {});
    throw new Error(`google_imagen_failed:${message.slice(0, 260)}`);
  }

  return (payload?.predictions ?? [])
    .map((item) => {
      const base64 = item.bytesBase64Encoded?.trim();
      const mime = item.mimeType?.trim() || "image/png";
      const previewUrl = item.imageUri?.trim() || (base64 ? `data:${mime};base64,${base64}` : "");

      if (!previewUrl) {
        return null;
      }

      return {
        previewUrl,
        prompt: item.prompt?.trim() || input.prompt
      };
    })
    .filter((item): item is GoogleImagenAsset => item !== null);
}
