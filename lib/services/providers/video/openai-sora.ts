import OpenAI from "openai";
import {
  buildProductionAssetRelativePath,
  buildProductionAssetUrl,
  writeProductionAssetBuffer
} from "@/lib/services/production-assets";

export interface GeneratedVideoAsset {
  status: "done" | "failed";
  provider: string;
  model: string;
  note: string;
  previewUrl?: string;
  audioPreviewUrl?: string;
}

function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("未检测到 OPENAI_API_KEY");
  }

  return new OpenAI({
    apiKey
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateOpenAiProductionVideo(input: {
  packId: string;
  jobId: string;
  prompt: string;
}): Promise<GeneratedVideoAsset> {
  const model = process.env.OPENAI_VIDEO_MODEL?.trim() || "sora-2";
  const size = process.env.OPENAI_VIDEO_SIZE?.trim() || "720x1280";
  const seconds = process.env.OPENAI_VIDEO_SECONDS?.trim() || "4";
  const pollIntervalMs = Number(process.env.OPENAI_VIDEO_POLL_INTERVAL_MS || 5000);
  const timeoutMs = Number(process.env.OPENAI_VIDEO_TIMEOUT_MS || 180000);

  try {
    const openai = getOpenAiClient();
    let video = (await openai.videos.create({
      model,
      prompt: input.prompt,
      size,
      seconds
    } as never)) as {
      id: string;
      status?: string;
      progress?: number;
      failure_reason?: string;
      error?: {
        message?: string;
      };
    };

    const startedAt = Date.now();

    while (video.status === "queued" || video.status === "in_progress") {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`视频生成超时，已等待 ${Math.round(timeoutMs / 1000)} 秒`);
      }

      await sleep(pollIntervalMs);
      video = (await openai.videos.retrieve(video.id as never)) as typeof video;
    }

    if (video.status !== "completed") {
      throw new Error(video.failure_reason || video.error?.message || `视频生成失败，状态 ${video.status ?? "unknown"}`);
    }

    const content = await openai.videos.downloadContent(video.id as never);
    const buffer = Buffer.from(await content.arrayBuffer());
    const relativePath = buildProductionAssetRelativePath(input.packId, input.jobId, "video.mp4");
    await writeProductionAssetBuffer(relativePath, buffer);
    const previewUrl = buildProductionAssetUrl(relativePath);

    return {
      status: "done",
      provider: "OpenAI Sora",
      model,
      note: `已生成真实视频资产，规格 ${size} / ${seconds}s。`,
      previewUrl,
      audioPreviewUrl: previewUrl
    };
  } catch (error) {
    return {
      status: "failed",
      provider: "OpenAI Sora",
      model,
      note: error instanceof Error ? error.message : "视频生成失败"
    };
  }
}
