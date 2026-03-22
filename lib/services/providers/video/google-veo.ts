export interface GoogleVeoAsset {
  previewUrl: string;
  videoUrl?: string;
  narrative?: string;
}

interface GoogleVeoResponse {
  predictions?: Array<{
    videoUri?: string;
    thumbnailUri?: string;
    storyboard?: string;
  }>;
  voiceScript?: string;
  subtitleSrt?: string;
}

export async function generateWithGoogleVeo(input: {
  prompt: string;
  script: string;
  count: number;
  durationSeconds: number;
  model?: string;
  apiKey?: string;
  endpoint?: string;
}): Promise<{
  assets: GoogleVeoAsset[];
  voiceScript?: string;
  subtitles?: string;
}> {
  const endpoint = input.endpoint?.trim() || process.env.GOOGLE_VEO_API_URL?.trim();
  const apiKey = input.apiKey?.trim() || process.env.GOOGLE_VEO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();

  if (!endpoint) {
    throw new Error("google_veo_endpoint_missing");
  }

  if (!apiKey) {
    throw new Error("google_veo_api_key_missing");
  }

  const response = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    signal: AbortSignal.timeout(180000),
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model ?? process.env.BEST_VIDEO_MODEL ?? "veo-3.1",
      instances: [
        {
          prompt: input.prompt,
          script: input.script
        }
      ],
      parameters: {
        sampleCount: Math.max(1, Math.min(input.count, 3)),
        aspectRatio: "9:16",
        durationSeconds: Math.max(8, Math.min(input.durationSeconds, 90)),
        autoVoiceover: true,
        autoSubtitles: true
      }
    })
  });
  const payload = (await response.json().catch(() => null)) as GoogleVeoResponse | null;

  if (!response.ok) {
    const message = JSON.stringify(payload ?? {});
    throw new Error(`google_veo_failed:${message.slice(0, 260)}`);
  }

  const mapped = (payload?.predictions ?? []).map<GoogleVeoAsset | null>((item) => {
      const previewUrl = item.thumbnailUri?.trim() || item.videoUri?.trim() || "";

      if (!previewUrl) {
        return null;
      }

      return {
        previewUrl,
        videoUrl: item.videoUri?.trim(),
        narrative: item.storyboard?.trim() || input.prompt
      };
    });
  const assets = mapped.filter((item): item is GoogleVeoAsset => item !== null);

  return {
    assets,
    voiceScript: payload?.voiceScript?.trim(),
    subtitles: payload?.subtitleSrt?.trim()
  };
}
