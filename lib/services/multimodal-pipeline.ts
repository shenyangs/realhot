import { generateWithGoogleImagen } from "@/lib/services/providers/image/google-imagen";
import { generateWithOpenAiImage } from "@/lib/services/providers/image/openai-image";
import { generateWithGoogleVeo } from "@/lib/services/providers/video/google-veo";
import { generateWithOpenAiSora } from "@/lib/services/providers/video/openai-sora";

interface JsonObject {
  [key: string]: unknown;
}

export interface MultimodalImageAsset {
  name: string;
  previewUrl: string;
  prompt: string;
  provider: string;
  model: string;
}

export interface MultimodalVideoAsset {
  name: string;
  previewUrl: string;
  videoUrl?: string;
  narrative?: string;
  provider: string;
  model: string;
}

export interface ImageSynthesisResult {
  provider: string;
  model: string;
  assets: MultimodalImageAsset[];
  warning?: string;
}

export interface VideoSynthesisResult {
  provider: string;
  model: string;
  assets: MultimodalVideoAsset[];
  voiceScript?: string;
  subtitles?: string;
  warning?: string;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asObjectArray(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is JsonObject => isObject(item));
}

function pickFirstString(source: JsonObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(source[key]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function toDataUrl(base64: string, mimeType = "image/png"): string {
  return `data:${mimeType};base64,${base64}`;
}

function collectCandidates(payload: JsonObject, keys: string[]): JsonObject[] {
  const candidates: JsonObject[] = [];

  for (const key of keys) {
    candidates.push(...asObjectArray(payload[key]));
  }

  return candidates;
}

async function postToProvider(input: {
  endpoint: string;
  apiKey?: string;
  payload: JsonObject;
  timeoutMs?: number;
}): Promise<JsonObject> {
  const response = await fetch(input.endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(input.timeoutMs ?? 120000),
    headers: {
      "Content-Type": "application/json",
      ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {})
    },
    body: JSON.stringify(input.payload)
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  const normalized = isObject(payload) ? payload : {};

  if (!response.ok) {
    const errorMessage =
      asString(normalized.error) ??
      asString(isObject(normalized.error) ? normalized.error.message : undefined) ??
      asString(normalized.message) ??
      `upstream_status_${response.status}`;

    throw new Error(errorMessage);
  }

  return normalized;
}

function parseImageCandidates(input: {
  payload: JsonObject;
  provider: string;
  model: string;
  fallbackPrompt: string;
}): MultimodalImageAsset[] {
  const candidates = collectCandidates(input.payload, ["images", "data", "outputs", "results", "items"]);

  return candidates
    .map((candidate, index) => {
      const rawBase64 =
        pickFirstString(candidate, ["b64_json", "base64", "image_base64"]) ??
        pickFirstString(
          isObject(candidate.image) ? candidate.image : {},
          ["b64_json", "base64", "image_base64"]
        );
      const mimeType = pickFirstString(candidate, ["mime_type", "mimeType"]) ?? "image/png";
      const directUrl = pickFirstString(candidate, ["url", "image_url", "imageUrl", "preview_url", "previewUrl"]);
      const previewUrl = directUrl ?? (rawBase64 ? toDataUrl(rawBase64, mimeType) : undefined);

      if (!previewUrl) {
        return null;
      }

      return {
        name: index === 0 ? "封面图" : `图卡 ${index + 1}`,
        previewUrl,
        prompt: pickFirstString(candidate, ["prompt", "caption", "description"]) ?? input.fallbackPrompt,
        provider: input.provider,
        model: input.model
      };
    })
    .filter((asset): asset is MultimodalImageAsset => asset !== null);
}

function parseVideoCandidates(input: {
  payload: JsonObject;
  provider: string;
  model: string;
  fallbackNarrative: string;
}): {
  assets: MultimodalVideoAsset[];
  voiceScript?: string;
  subtitles?: string;
} {
  const candidates = collectCandidates(input.payload, ["videos", "data", "outputs", "results", "items"]);
  const voiceScript =
    pickFirstString(input.payload, ["voice_script", "voiceScript", "voiceover_text", "voiceoverText"]) ??
    pickFirstString(isObject(input.payload.output) ? input.payload.output : {}, ["voice_script", "voiceScript"]);
  const subtitles =
    pickFirstString(input.payload, ["subtitles", "subtitle_srt", "subtitleSrt"]) ??
    pickFirstString(isObject(input.payload.output) ? input.payload.output : {}, ["subtitles", "subtitle_srt"]);

  const mapped = candidates.map<MultimodalVideoAsset | null>((candidate, index) => {
      const videoUrl = pickFirstString(candidate, ["video_url", "videoUrl", "url", "download_url", "downloadUrl"]);
      const previewUrl =
        pickFirstString(candidate, ["thumbnail_url", "thumbnailUrl", "poster_url", "posterUrl", "preview_url", "previewUrl"]) ??
        videoUrl;

      if (!previewUrl) {
        return null;
      }

      return {
        name: index === 0 ? "主视频" : `视频版本 ${index + 1}`,
        previewUrl,
        videoUrl,
        narrative: pickFirstString(candidate, ["storyboard", "narrative", "description"]) ?? input.fallbackNarrative,
        provider: input.provider,
        model: input.model
      };
    });
  const assets = mapped.filter((asset): asset is MultimodalVideoAsset => asset !== null);

  return {
    assets,
    voiceScript,
    subtitles
  };
}

export async function generateImageAssets(input: {
  prompt: string;
  desiredCount?: number;
}): Promise<ImageSynthesisResult> {
  const provider = process.env.BEST_IMAGE_PROVIDER?.trim() || "openai-image";
  const model = process.env.BEST_IMAGE_MODEL?.trim() || "gpt-image-1";
  const endpoint = process.env.BEST_IMAGE_API_URL?.trim();
  const apiKey = process.env.BEST_IMAGE_API_KEY?.trim();
  const desiredCount = Math.min(Math.max(input.desiredCount ?? 2, 1), 4);

  if (provider === "openai-image") {
    const assets = await generateWithOpenAiImage({
      prompt: input.prompt,
      count: desiredCount,
      model
    }).catch((error) => {
      throw new Error(error instanceof Error ? error.message : "openai_image_failed");
    });

    return {
      provider,
      model,
      assets: assets.map((asset, index) => ({
        name: index === 0 ? "封面图" : `图卡 ${index + 1}`,
        previewUrl: asset.previewUrl,
        prompt: asset.prompt,
        provider,
        model
      })),
      warning: assets.length > 0 ? undefined : "OpenAI 生图返回为空。"
    };
  }

  if (provider === "google-imagen") {
    const assets = await generateWithGoogleImagen({
      prompt: input.prompt,
      count: desiredCount,
      model,
      endpoint,
      apiKey
    }).catch((error) => {
      throw new Error(error instanceof Error ? error.message : "google_imagen_failed");
    });

    return {
      provider,
      model,
      assets: assets.map((asset, index) => ({
        name: index === 0 ? "封面图" : `图卡 ${index + 1}`,
        previewUrl: asset.previewUrl,
        prompt: asset.prompt,
        provider,
        model
      })),
      warning: assets.length > 0 ? undefined : "Google Imagen 生图返回为空。"
    };
  }

  if (!endpoint) {
    return {
      provider,
      model,
      assets: [],
      warning: "BEST_IMAGE_API_URL 未配置，已回退本地预览图。"
    };
  }

  const payload = await postToProvider({
    endpoint,
    apiKey,
    payload: {
      model,
      prompt: input.prompt,
      n: desiredCount,
      quality: "high",
      aspect_ratio: "16:9",
      output_format: "url"
    }
  });

  const assets = parseImageCandidates({
    payload,
    provider,
    model,
    fallbackPrompt: input.prompt
  });

  return {
    provider,
    model,
    assets: assets.slice(0, desiredCount),
    warning: assets.length > 0 ? undefined : "生图接口已返回，但未解析到可用图片地址。"
  };
}

export async function generateVideoAssets(input: {
  prompt: string;
  script: string;
  desiredCount?: number;
  durationSeconds?: number;
}): Promise<VideoSynthesisResult> {
  const provider = process.env.BEST_VIDEO_PROVIDER?.trim() || "openai-sora";
  const model = process.env.BEST_VIDEO_MODEL?.trim() || "sora-2";
  const endpoint = process.env.BEST_VIDEO_API_URL?.trim();
  const apiKey = process.env.BEST_VIDEO_API_KEY?.trim();
  const desiredCount = Math.min(Math.max(input.desiredCount ?? 1, 1), 3);

  if (provider === "openai-sora") {
    const parsed = await generateWithOpenAiSora({
      prompt: input.prompt,
      script: input.script,
      count: desiredCount,
      durationSeconds: input.durationSeconds ?? 45,
      model,
      endpoint,
      apiKey
    }).catch((error) => {
      throw new Error(error instanceof Error ? error.message : "openai_sora_failed");
    });

    return {
      provider,
      model,
      assets: parsed.assets.map((asset, index) => ({
        name: index === 0 ? "主视频" : `视频版本 ${index + 1}`,
        previewUrl: asset.previewUrl,
        videoUrl: asset.videoUrl,
        narrative: asset.narrative,
        provider,
        model
      })),
      voiceScript: parsed.voiceScript,
      subtitles: parsed.subtitles,
      warning: parsed.assets.length > 0 ? undefined : "OpenAI 视频返回为空。"
    };
  }

  if (provider === "google-veo") {
    const parsed = await generateWithGoogleVeo({
      prompt: input.prompt,
      script: input.script,
      count: desiredCount,
      durationSeconds: input.durationSeconds ?? 45,
      model,
      endpoint,
      apiKey
    }).catch((error) => {
      throw new Error(error instanceof Error ? error.message : "google_veo_failed");
    });

    return {
      provider,
      model,
      assets: parsed.assets.map((asset, index) => ({
        name: index === 0 ? "主视频" : `视频版本 ${index + 1}`,
        previewUrl: asset.previewUrl,
        videoUrl: asset.videoUrl,
        narrative: asset.narrative,
        provider,
        model
      })),
      voiceScript: parsed.voiceScript,
      subtitles: parsed.subtitles,
      warning: parsed.assets.length > 0 ? undefined : "Google Veo 视频返回为空。"
    };
  }

  if (!endpoint) {
    return {
      provider,
      model,
      assets: [],
      warning: "BEST_VIDEO_API_URL 未配置，已回退本地视频预览。"
    };
  }

  const payload = await postToProvider({
    endpoint,
    apiKey,
    payload: {
      model,
      prompt: input.prompt,
      script: input.script,
      duration_seconds: input.durationSeconds ?? 45,
      aspect_ratio: "9:16",
      variants: desiredCount,
      auto_storyboard: true,
      auto_voiceover: true,
      auto_subtitles: true
    }
  });

  const parsed = parseVideoCandidates({
    payload,
    provider,
    model,
    fallbackNarrative: input.prompt
  });

  return {
    provider,
    model,
    assets: parsed.assets.slice(0, desiredCount),
    voiceScript: parsed.voiceScript,
    subtitles: parsed.subtitles,
    warning: parsed.assets.length > 0 ? undefined : "视频接口已返回，但未解析到可用视频资产。"
  };
}
