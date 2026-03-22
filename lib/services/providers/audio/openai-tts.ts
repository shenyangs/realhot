export interface OpenAiTtsResult {
  audioUrl?: string;
  text: string;
}

interface OpenAiTtsResponse {
  audio_url?: string;
  b64_audio?: string;
}

export async function synthesizeWithOpenAiTts(input: {
  text: string;
  voice?: string;
  model?: string;
  apiKey?: string;
  endpoint?: string;
}): Promise<OpenAiTtsResult> {
  const endpoint = input.endpoint?.trim() || process.env.OPENAI_TTS_API_URL?.trim() || "https://api.openai.com/v1/audio/speech";
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
      model: input.model ?? process.env.BEST_TTS_MODEL ?? "gpt-4o-mini-tts",
      voice: input.voice ?? process.env.BEST_TTS_VOICE ?? "alloy",
      input: input.text,
      format: "mp3"
    })
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`openai_tts_failed:${message.slice(0, 260)}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => ({}))) as OpenAiTtsResponse;
    const audioUrl = payload.audio_url?.trim() || (payload.b64_audio ? `data:audio/mp3;base64,${payload.b64_audio}` : undefined);

    return {
      audioUrl,
      text: input.text
    };
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return {
    audioUrl: `data:audio/mp3;base64,${base64}`,
    text: input.text
  };
}
