import { synthesizeWithOpenAiTts } from "@/lib/services/providers/audio/openai-tts";
import { transcribeWithOpenAiStt } from "@/lib/services/providers/audio/openai-stt";

export interface VoiceSynthesisResult {
  provider: string;
  model: string;
  script: string;
  audioUrl?: string;
  warning?: string;
}

export interface SubtitleTranscriptionResult {
  provider: string;
  model: string;
  subtitles?: string;
  transcript: string;
  warning?: string;
}

export async function synthesizeVoiceTrack(input: {
  script: string;
}): Promise<VoiceSynthesisResult> {
  const provider = process.env.BEST_TTS_PROVIDER?.trim() || "openai-tts";
  const model = process.env.BEST_TTS_MODEL?.trim() || "gpt-4o-mini-tts";

  if (provider === "openai-tts") {
    const output = await synthesizeWithOpenAiTts({
      text: input.script,
      model
    }).catch((error) => ({
      text: input.script,
      audioUrl: undefined,
      warning: error instanceof Error ? error.message : "tts_failed"
    }));

    return {
      provider,
      model,
      script: output.text,
      audioUrl: output.audioUrl,
      warning: "warning" in output ? output.warning : undefined
    };
  }

  return {
    provider,
    model,
    script: input.script,
    warning: "未配置可用 TTS provider，已回退文本口播稿。"
  };
}

export async function transcribeVoiceTrack(input: {
  audioUrl?: string;
  fallbackText: string;
}): Promise<SubtitleTranscriptionResult> {
  const provider = process.env.BEST_STT_PROVIDER?.trim() || "openai-stt";
  const model = process.env.BEST_STT_MODEL?.trim() || "gpt-4o-transcribe";

  if (provider === "openai-stt") {
    const output = await transcribeWithOpenAiStt({
      audioUrl: input.audioUrl,
      fallbackText: input.fallbackText,
      model
    }).catch((error) => ({
      transcript: input.fallbackText,
      subtitles: undefined,
      warning: error instanceof Error ? error.message : "stt_failed"
    }));

    return {
      provider,
      model,
      transcript: output.transcript,
      subtitles: output.subtitles,
      warning: "warning" in output ? output.warning : undefined
    };
  }

  return {
    provider,
    model,
    transcript: input.fallbackText,
    subtitles: undefined,
    warning: "未配置可用 STT provider，已回退脚本字幕。"
  };
}
