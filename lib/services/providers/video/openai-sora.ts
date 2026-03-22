export interface OpenAiVideoAsset {
  previewUrl: string;
  videoUrl?: string;
  narrative?: string;
}

interface OpenAiVideoResponse {
  data?: Array<{
    url?: string;
    thumbnail_url?: string;
    narrative?: string;
    script?: string;
    subtitles?: string;
  }>;
  voice_script?: string;
  subtitles?: string;
}

export async function generateWithOpenAiSora(input: {
  prompt: string;
  script: string;
  count: number;
  durationSeconds: number;
  model?: string;
  apiKey?: string;
  endpoint?: string;
}): Promise<{
  assets: OpenAiVideoAsset[];
  voiceScript?: string;
  subtitles?: string;
}> {
  const endpoint = input.endpoint?.trim() || process.env.OPENAI_VIDEO_API_URL?.trim();
  const apiKey = input.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();

  if (!endpoint) {
    throw new Error("openai_video_endpoint_missing");
  }

  if (!apiKey) {
    throw new Error("openai_api_key_missing");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(180000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: input.model ?? process.env.BEST_VIDEO_MODEL ?? "sora-2",
      prompt: input.prompt,
      script: input.script,
      variants: Math.max(1, Math.min(input.count, 3)),
      duration_seconds: Math.max(8, Math.min(input.durationSeconds, 90)),
      aspect_ratio: "9:16",
      auto_voiceover: true,
      auto_subtitles: true
    })
  });
  const payload = (await response.json().catch(() => null)) as OpenAiVideoResponse | null;

  if (!response.ok) {
    const message = JSON.stringify(payload ?? {});
    throw new Error(`openai_video_failed:${message.slice(0, 260)}`);
  }

  const mapped = (payload?.data ?? []).map<OpenAiVideoAsset | null>((item) => {
      const previewUrl = item.thumbnail_url?.trim() || item.url?.trim() || "";

      if (!previewUrl) {
        return null;
      }

      return {
        previewUrl,
        videoUrl: item.url?.trim(),
        narrative: item.narrative?.trim() || input.prompt
      };
    });
  const assets = mapped.filter((item): item is OpenAiVideoAsset => item !== null);

  return {
    assets,
    voiceScript: payload?.voice_script?.trim() || payload?.data?.[0]?.script?.trim(),
    subtitles: payload?.subtitles?.trim() || payload?.data?.[0]?.subtitles?.trim()
  };
}
