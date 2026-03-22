export interface OpenAiSttResult {
  transcript: string;
  subtitles?: string;
}

interface OpenAiSttResponse {
  text?: string;
  subtitles?: string;
}

export async function transcribeWithOpenAiStt(input: {
  audioUrl?: string;
  fallbackText?: string;
  model?: string;
  apiKey?: string;
  endpoint?: string;
}): Promise<OpenAiSttResult> {
  const endpoint = input.endpoint?.trim() || process.env.OPENAI_STT_API_URL?.trim();
  const apiKey = input.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();

  if (!endpoint || !apiKey) {
    return {
      transcript: input.fallbackText ?? "",
      subtitles: undefined
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(120000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: input.model ?? process.env.BEST_STT_MODEL ?? "gpt-4o-transcribe",
      audio_url: input.audioUrl,
      response_format: "verbose_json",
      include_subtitles: true,
      fallback_text: input.fallbackText
    })
  });
  const payload = (await response.json().catch(() => null)) as OpenAiSttResponse | null;

  if (!response.ok) {
    const message = JSON.stringify(payload ?? {});
    throw new Error(`openai_stt_failed:${message.slice(0, 260)}`);
  }

  return {
    transcript: payload?.text?.trim() || input.fallbackText || "",
    subtitles: payload?.subtitles?.trim()
  };
}
